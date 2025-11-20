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

		const isDirty = await GitService.isDirty(filePath, root);
		if (isDirty) {
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

		const logRaw = await GitService.getLog(filePath, root);
		if (!logRaw) {
			return {
				status: DocStatus.UNKNOWN,
				reason: "Untracked",
				resourceUri: uri,
			};
		}

		const [hash, gitDate, author, subject] = logRaw.split("|");
		const gitDateInt = parseInt(gitDate) || 0;
		const headerDateInt = parseInt(headerDate) || 0;

		if (headerDateInt >= gitDateInt) {
			return {
				status: DocStatus.SUCCESS,
				reason: "Up to date",
				resourceUri: uri,
			};
		}

		if (this.shouldSkip(subject, skipKeywords)) {
			Logger.info(
				`Skipping ${fileName} due to keyword match.`,
				"Analysis"
			);
			return {
				status: DocStatus.SUCCESS,
				reason: "Keyword skipped",
				resourceUri: uri,
			};
		}

		const commitDiff = await GitService.getDiff(filePath, root, hash);
		if (!GitService.hasLogicChanges(commitDiff)) {
			Logger.info(
				`Skipping ${fileName} - Commit was docs only.`,
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
			const read = fs.readSync(fd, buffer, 0, 8192, 0);
			fs.closeSync(fd);
			const match = buffer.slice(0, read).toString().match(HEADER_REGEX);
			return match ? match[1] : null;
		} catch {
			return null;
		}
	}

	private static shouldSkip(subject: string, keywords: string[]): boolean {
		const upperSubject = (subject || "").toUpperCase();
		return keywords.some((k) => upperSubject.includes(k.toUpperCase()));
	}
}
