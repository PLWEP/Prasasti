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
}

export interface AuditResult {
	status: DocStatus;
	reason: string;
	resourceUri: vscode.Uri;
}

export class AnalysisService {
	static async analyzeForMarkers(
		uri: vscode.Uri
	): Promise<AuditResult | null> {
		const filePath = uri.fsPath;
		const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!wsFolder) {
			return null;
		}

		try {
			let diffToCheck = await GitService.getWorkingDiff(
				filePath,
				wsFolder.uri.fsPath
			);
			let source = "Unsaved Changes";

			if (!diffToCheck || diffToCheck.trim().length === 0) {
				diffToCheck = await GitService.getLastCommitDiff(
					filePath,
					wsFolder.uri.fsPath
				);
				source = "Last Commit";
			}

			if (diffToCheck && GitService.hasLogicChanges(diffToCheck)) {
				const content = fs.readFileSync(filePath, "utf8");

				const areMarkersValid = MarkerService.validateMarkers(
					content,
					diffToCheck
				);

				if (!areMarkersValid) {
					return {
						status: DocStatus.MISSING_MARKERS,
						reason: `Logic in ${source} not marked`,
						resourceUri: uri,
					};
				}
			}
		} catch (e) {
			Logger.error(
				`Marker Analysis Failed: ${path.basename(filePath)}`,
				"Analysis",
				e
			);
		}
		return null;
	}

	static async analyzeForDocs(
		uri: vscode.Uri,
		skipKeywords: string[]
	): Promise<AuditResult | null> {
		const filePath = uri.fsPath;
		const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!wsFolder) {
			return null;
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

		const logRaw = await GitService.getLog(filePath, root, 1);
		if (!logRaw) {
			return null;
		}

		const [hash, gitDate] = logRaw.split("|");
		const gitDateInt = parseInt(gitDate) || 0;
		const headerDateInt = parseInt(headerDate) || 0;

		if (headerDateInt >= gitDateInt) {
			return null;
		}

		const commitDiff = await GitService.getDiff(filePath, root, hash);
		if (!GitService.hasLogicChanges(commitDiff)) {
			return null;
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
