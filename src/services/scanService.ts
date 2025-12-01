import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitService } from "./gitService";
import { HEADER_REGEX } from "../constants";
import { Logger } from "../utils/logger";
import { DocStatus } from "../utils/enums";
import { Result } from "../utils/interfaces";
import { getMarkerDate } from "../commands/generateMarkers";

export class scanService {
	static async scanUncommitFiles(): Promise<string[]> {
		const wsFolder = vscode.workspace.workspaceFolders;
		if (!wsFolder) {
			return [];
		}

		try {
			const root = wsFolder[0].uri.fsPath;
			return await GitService.getUncommitFile(root);
		} catch (e) {
			Logger.error(`Uncommit Analysis Failed`, "Analysis", e);
		}
		return [];
	}

	static async scanMarkerFiles(
		uri: vscode.Uri,
		skip: string[],
		markerScanOption: string
	): Promise<Result | null> {
		const filePath = uri.fsPath;
		const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!wsFolder) {
			return null;
		}

		try {
			const root = wsFolder.uri.fsPath;

			const fileDatesList = getMarkerDate(filePath);
			let gitDatesList: string[] = [];
			fileDatesList.sort();
			const lastDate =
				fileDatesList.length > 0
					? fileDatesList[fileDatesList.length - 1]
					: undefined;

			if (markerScanOption === "Full Scan" || !lastDate) {
				gitDatesList = await GitService.getMarkerDate(
					filePath,
					root,
					skip
				);
			} else {
				gitDatesList = await GitService.getMarkerDate(
					filePath,
					root,
					skip,
					lastDate
				);
			}

			const missingDates: string[] = [];

			gitDatesList.forEach((gitDate) => {
				if (!fileDatesList.includes(gitDate)) {
					missingDates.push(gitDate);
				}
			});

			if (missingDates.length > 0) {
				const missingStr = missingDates.sort().join(", ");

				return {
					status: DocStatus.MISSING_MARKERS,
					reason: `Missing markers for dates: ${missingStr}`,
					resourceUri: uri,
				};
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

	static async scanDocumentationFiles(
		uri: vscode.Uri,
		skipKeywords: string[]
	): Promise<Result | null> {
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

	private static getHeaderDateString(filePath: string): string | null {
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

	private static getHeaderDate(filePath: string): string | null {
		return this.getHeaderDateString(filePath);
	}
}
