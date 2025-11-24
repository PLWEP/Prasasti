import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitService } from "./gitService";
import { MarkerService } from "./markerService";
import { HEADER_REGEX } from "../constants";
import { Logger } from "../utils/logger";

export enum DocStatus {
	SUCCESS,
	OUTDATED,
	NO_HEADER,
	MISSING_MARKERS,
	UNKNOWN,
	DIRTY_CODE,
}

export interface AuditResult {
	status: DocStatus;
	reason: string;
	resourceUri: vscode.Uri;
}

export class AnalysisService {
	static async analyzeFile(
		uri: vscode.Uri,
		skipKeywords: string[]
	): Promise<AuditResult> {
		const filePath = uri.fsPath;
		const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!wsFolder) {
			return {
				status: DocStatus.UNKNOWN,
				reason: "No Workspace",
				resourceUri: uri,
			};
		}
		const root = wsFolder.uri.fsPath;

		const headerDate = this.getHeaderDate(filePath);
		if (!headerDate) {
			return {
				status: DocStatus.NO_HEADER,
				reason: "Header missing",
				resourceUri: uri,
			};
		}

		try {
			let diffToCheck = "";
			let source = "";

			const workingDiff = await GitService.getWorkingDiff(filePath, root);
			if (workingDiff && workingDiff.trim().length > 0) {
				diffToCheck = workingDiff;
				source = "Unsaved Changes";
			} else {
				const lastCommitDiff = await GitService.getLastCommitDiff(
					filePath,
					root
				);
				if (lastCommitDiff && lastCommitDiff.trim().length > 0) {
					diffToCheck = lastCommitDiff;
					source = "Last Commit";
				}
			}

			if (diffToCheck && GitService.hasLogicChanges(diffToCheck)) {
				const content = fs.readFileSync(filePath, "utf8");
				if (!MarkerService.validateMarkers(content, diffToCheck)) {
					return {
						status: DocStatus.MISSING_MARKERS,
						reason: `Logic in ${source} not marked`,
						resourceUri: uri,
					};
				}
			}
		} catch (e: any) {
			Logger.error(`Marker check failed`, "Analysis", e);
		}

		const logRaw = await GitService.getLog(filePath, root, 1);
		if (!logRaw) {
			return {
				status: DocStatus.UNKNOWN,
				reason: "Untracked",
				resourceUri: uri,
			};
		}

		const [hash, gitDate] = logRaw.split("|");
		const gitDateInt = parseInt(gitDate) || 0;
		const headerDateInt = parseInt(headerDate) || 0;

		if (headerDateInt >= gitDateInt) {
			return {
				status: DocStatus.SUCCESS,
				reason: "Up to date",
				resourceUri: uri,
			};
		}

		const commitDiff = await GitService.getDiff(filePath, root, hash);
		if (!GitService.hasLogicChanges(commitDiff)) {
			return {
				status: DocStatus.SUCCESS,
				reason: "Docs-only update",
				resourceUri: uri,
			};
		}

		return {
			status: DocStatus.OUTDATED,
			reason: `Outdated (H:${headerDateInt} < G:${gitDateInt})`,
			resourceUri: uri,
		};
	}

	private static getHeaderDate(filePath: string): string | null {
		try {
			const buffer = Buffer.alloc(8192);
			const fd = fs.openSync(filePath, "r");
			fs.readSync(fd, buffer, 0, 8192, 0);
			fs.closeSync(fd);
			const match = buffer.toString().match(HEADER_REGEX);
			return match ? match[1] : null;
		} catch {
			return null;
		}
	}
}
