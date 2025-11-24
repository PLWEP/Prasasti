import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { GitService } from "../services/gitService";
import { MarkerService } from "../services/markerService";
import { Logger } from "../utils/logger";

export async function fixMarkersForFile(uri: vscode.Uri) {
	const filePath = uri.fsPath;
	const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
	if (!wsFolder) {
		return;
	}

	try {
		Logger.info(
			`Fixing Markers for ${path.basename(filePath)}`,
			"FixMarkers"
		);

		let rawDiff = await GitService.getWorkingDiff(
			filePath,
			wsFolder.uri.fsPath
		);
		if (!rawDiff || rawDiff.trim().length === 0) {
			rawDiff = await GitService.getLastCommitDiff(
				filePath,
				wsFolder.uri.fsPath
			);
		}

		if (!rawDiff || rawDiff.trim().length === 0) {
			vscode.window.showInformationMessage("No changes detected.");
			return;
		}

		let content = await fs.readFile(filePath, "utf8");
		const log = await GitService.getLog(filePath, wsFolder.uri.fsPath, 1);

		let sign = "AI";
		let ticketId = `MOD-${new Date()
			.toISOString()
			.slice(2, 10)
			.replace(/-/g, "")}`;

		if (log) {
			const parts = log.split("|");
			if (parts.length >= 3) {
				sign = parts[2].substring(0, 5).toUpperCase();
			}
		}

		const newContent = MarkerService.ensureMarkers(
			content,
			rawDiff,
			ticketId,
			sign
		);

		if (newContent !== content) {
			await fs.writeFile(filePath, newContent, "utf8");
			vscode.window.showInformationMessage("Markers applied!");
		} else {
			vscode.window.showInformationMessage("Markers are already valid.");
		}
	} catch (e: any) {
		Logger.error("Failed to fix markers", "FixMarkers", e);
		vscode.window.showErrorMessage(`Error fixing markers: ${e.message}`);
	}
}
