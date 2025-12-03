import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitService } from "./gitService";
import { CODE_SEPARATOR, HEADER_REGEX } from "../constants";
import { Logger } from "../utils/logger";
import { FileResult } from "../utils/interfaces";
import { getMarkerDate } from "../commands/generateMarker";

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

	static async scanFiles(
		uri: vscode.Uri,
		skip: string[],
		fileScanOption: string,
		type: string
	): Promise<FileResult | null> {
		const filePath = uri.fsPath;
		const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!wsFolder) {
			return null;
		}

		try {
			const root = wsFolder.uri.fsPath;

			const fileDatesList =
				type === "Marker"
					? getMarkerDate(filePath)
					: this.getHistoryDates(filePath);
			let gitDatesList: string[] = [];

			fileDatesList.sort();
			const lastDate =
				fileDatesList.length > 0
					? fileDatesList[fileDatesList.length - 1]
					: undefined;

			if (fileScanOption === "Full Scan" || !lastDate) {
				gitDatesList = await GitService.getGitDates(
					filePath,
					root,
					skip
				);
			} else {
				gitDatesList = await GitService.getGitDates(
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
					reason: `Missing ${type} for dates: ${missingStr}`,
					resourceUri: uri,
				};
			}
		} catch (e) {
			Logger.error(
				`${type} Analysis Failed: ${path.basename(filePath)}`,
				"Analysis",
				e
			);
		}
		return null;
	}

	static getHistoryDates(filePath: string): string[] {
		try {
			const fileContent = fs.readFileSync(filePath, "utf-8");
			const parts = fileContent.split(CODE_SEPARATOR);
			const codeBody = parts.length >= 2 ? parts[0] : "";
			const matches = [...codeBody.matchAll(HEADER_REGEX)];
			const dates = matches.map((match) => match[1]);
			return dates;
		} catch {
			return [];
		}
	}
}
