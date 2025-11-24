import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitService } from "./gitService";
import { HEADER_REGEX } from "../constants";
import { Logger } from "../utils/logger";

export enum DocStatus {
	SUCCESS,
	OUTDATED,
	NO_HEADER,
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
		const fileName = path.basename(filePath);

		const headerDate = this.getHeaderDate(filePath);
		if (!headerDate) {
			return {
				status: DocStatus.NO_HEADER,
				reason: "Header missing",
				resourceUri: uri,
			};
		}

		if (await GitService.isDirty(filePath, root)) {
			const diff = await GitService.getDiff(filePath, root);
			if (GitService.hasLogicChanges(diff)) {
				return {
					status: DocStatus.DIRTY_CODE,
					reason: "Unsaved Logic Changes",
					resourceUri: uri,
				};
			}
			return {
				status: DocStatus.SUCCESS,
				reason: "Writing docs...",
				resourceUri: uri,
			};
		}

		const logRaw = await GitService.getLog(filePath, root, 1);
		if (!logRaw) {
			return {
				status: DocStatus.UNKNOWN,
				reason: "Untracked",
				resourceUri: uri,
			};
		}

		const [hash, gitDate, author] = logRaw.split("|");
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
			Logger.info(
				`Skipping ${fileName} - Docs/Comment update only.`,
				"Analysis"
			);
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
