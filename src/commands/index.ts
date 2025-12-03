import * as vscode from "vscode";
import * as path from "path";
import { PrasastiProvider } from "../providers/prasastiProvider";
import { runAiScriptForFile } from "../services/fixService";
import { getApiKey, promptToOpenSettings } from "../utils/config";
import { Logger } from "../utils/logger";
import { DataManager } from "../managers/dataManager";

export async function handleGenerateAll(
	dataManager: DataManager,
	provider: PrasastiProvider
) {
	const apiKey = getApiKey();
	if (!apiKey) {
		return promptToOpenSettings("Gemini API Key is missing.");
	}

	const filesToFix = dataManager.docItems;
	if (filesToFix.length === 0) {
		vscode.window.showInformationMessage("No files need updates!");
		return;
	}

	const confirm = await vscode.window.showWarningMessage(
		`Regenerate documentation for ${filesToFix.length} files?`,
		"Yes",
		"Cancel"
	);
	if (confirm !== "Yes") {
		return;
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Prasasti: Generating Documentation...",
			cancellable: true,
		},
		async (progress, token) => {
			let processed = 0;
			for (const item of filesToFix) {
				if (token.isCancellationRequested) {
					break;
				}

				const wsFolder = vscode.workspace.getWorkspaceFolder(
					item.resourceUri
				);
				if (!wsFolder) {
					continue;
				}

				progress.report({
					message: `Processing ${item.label}...`,
					increment: (1 / filesToFix.length) * 100,
				});

				try {
					await runAiScriptForFile(
						item.resourceUri.fsPath,
						wsFolder.uri.fsPath,
						apiKey
					);
					Logger.info(`[SUCCESS] Generated: ${item.label}`);
				} catch (e: any) {
					Logger.error(`[ERROR] Generate All: ${e.message}`);
					vscode.window.showErrorMessage(
						`Failed ${item.label}: ${e.message}`
					);
				}
				processed++;
			}
			provider.refresh();
			vscode.window.showInformationMessage(
				`Completed! Processed ${processed} files.`
			);
		}
	);
}

export async function handleGenerateSingle(
	item: any,
	provider: PrasastiProvider
) {
	if (!item || !item.resourceUri) {
		return;
	}

	const apiKey = getApiKey();
	if (!apiKey) {
		return promptToOpenSettings("Gemini API Key is missing.");
	}

	const fileName = path.basename(item.resourceUri.fsPath);

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Prasasti: Updating ${fileName}...`,
		},
		async () => {
			const wsFolder = vscode.workspace.getWorkspaceFolder(
				item.resourceUri
			);
			if (wsFolder) {
				try {
					await runAiScriptForFile(
						item.resourceUri.fsPath,
						wsFolder.uri.fsPath,
						apiKey
					);
					provider.refresh();
					vscode.window.showInformationMessage(`Updated ${fileName}`);
				} catch (e: any) {
					vscode.window.showErrorMessage(`Error: ${e.message}`);
				}
			}
		}
	);
}
