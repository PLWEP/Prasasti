import * as vscode from "vscode";
import {
	PrasastiDataManager,
	PrasastiProvider,
} from "./providers/issueProvider";
import { generateDocsForFile } from "./commands/generateDocs";
import { COMMANDS, CONFIG, VIEWS } from "./constants";
import { Logger } from "./utils/logger";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
	Logger.info("Prasasti Extension Activated.");

	const dataManager = PrasastiDataManager.getInstance();
	dataManager.setContext(context.workspaceState);

	const provider = new PrasastiProvider();
	const treeView = vscode.window.createTreeView(VIEWS.PROBLEMS, {
		treeDataProvider: provider,
	});

	provider.onDidChangeTreeData(() => {
		const count = provider.getItems().length;
		if (count > 0) {
			treeView.badge = {
				value: count,
				tooltip: `${count} files need documentation updates`,
			};
		} else {
			treeView.badge = undefined;
		}
	});

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.REFRESH, () => {
			provider.refresh();
		}),

		vscode.commands.registerCommand(
			COMMANDS.GENERATE_SINGLE,
			async (item) => {
				const apiKey = getApiKey();
				if (!apiKey) {
					return;
				}

				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Generating docs for ${path.basename(
							item.resourceUri.fsPath
						)}...`,
						cancellable: false,
					},
					async () => {
						try {
							await generateDocsForFile(item.resourceUri, apiKey);
							vscode.window.showInformationMessage(
								"Docs updated!"
							);
							provider.refresh();
						} catch (e: any) {
							vscode.window.showErrorMessage(
								`Error: ${e.message}`
							);
							Logger.error(
								"Generate Single Failed",
								"Extension",
								e
							);
						}
					}
				);
			}
		),

		vscode.commands.registerCommand(COMMANDS.GENERATE_ALL, async () => {
			const apiKey = getApiKey();
			if (!apiKey) {
				return;
			}

			const items = provider.getItems();
			if (items.length === 0) {
				return vscode.window.showInformationMessage(
					"No files to update."
				);
			}

			const confirm = await vscode.window.showWarningMessage(
				`Are you sure you want to generate docs for ${items.length} files?`,
				"Yes, Generate All",
				"Cancel"
			);

			if (confirm !== "Yes, Generate All") {
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Prasasti Batch Update",
					cancellable: true,
				},
				async (progress, token) => {
					let successCount = 0;
					let failCount = 0;
					const total = items.length;

					for (let i = 0; i < total; i++) {
						if (token.isCancellationRequested) {
							Logger.warn(
								"Batch process cancelled by user.",
								"Extension"
							);
							break;
						}

						const item = items[i];
						const fileName = path.basename(item.resourceUri.fsPath);

						progress.report({
							message: `Processing (${
								i + 1
							}/${total}): ${fileName}...`,
							increment: (1 / total) * 100,
						});

						try {
							await generateDocsForFile(item.resourceUri, apiKey);
							successCount++;
						} catch (e: any) {
							failCount++;
							Logger.error(
								`Failed to process ${fileName}`,
								"Batch",
								e
							);
						}
					}

					provider.refresh();

					if (failCount > 0) {
						vscode.window.showWarningMessage(
							`Batch complete. Success: ${successCount}, Failed: ${failCount}. Check logs for details.`
						);
					} else {
						vscode.window.showInformationMessage(
							`Batch complete! Successfully updated ${successCount} files.`
						);
					}
				}
			);
		})
	);

	setTimeout(() => {
		Logger.info("Triggering initial scan...", "Extension");
		provider.refresh();
	}, 1000);
}

function getApiKey(): string | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	const key = config.get<string>(CONFIG.KEYS.API_KEY);
	if (!key) {
		vscode.window.showErrorMessage("API Key missing. Check Settings.");
		return undefined;
	}
	return key;
}

export function deactivate() {}
