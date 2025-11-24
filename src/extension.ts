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
		treeView.badge =
			count > 0
				? { value: count, tooltip: `${count} outdated files` }
				: undefined;
	});

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.REFRESH, () =>
			provider.refresh()
		),

		vscode.commands.registerCommand(
			COMMANDS.GENERATE_SINGLE,
			async (item) => {
				const key = getApiKey();
				if (!key) {
					return;
				}
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: "Generating...",
					},
					async () => {
						try {
							await generateDocsForFile(item.resourceUri, key);
							vscode.window.showInformationMessage("Success!");
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
			const key = getApiKey();
			if (!key) {
				return;
			}
			const items = provider.getItems();
			if (items.length === 0) {
				return vscode.window.showInformationMessage(
					"No files to update."
				);
			}

			if (
				(await vscode.window.showWarningMessage(
					`Process ${items.length} files?`,
					"Yes",
					"No"
				)) !== "Yes"
			) {
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Batch Update",
					cancellable: true,
				},
				async (p, token) => {
					let success = 0,
						fail = 0;
					for (let i = 0; i < items.length; i++) {
						if (token.isCancellationRequested) {
							break;
						}
						const item = items[i];
						p.report({
							message: `(${i + 1}/${
								items.length
							}) ${path.basename(item.resourceUri.fsPath)}`,
							increment: (1 / items.length) * 100,
						});
						try {
							await generateDocsForFile(item.resourceUri, key);
							success++;
						} catch (e: any) {
							fail++;
							Logger.error(
								`Batch fail: ${item.resourceUri.fsPath}`,
								"Extension",
								e
							);
						}
					}
					provider.refresh();
					vscode.window.showInformationMessage(
						`Batch complete. Success: ${success}, Fail: ${fail}`
					);
				}
			);
		})
	);

	setTimeout(() => provider.refresh(), 1000);
}

function getApiKey(): string | undefined {
	const key = vscode.workspace
		.getConfiguration(CONFIG.SECTION)
		.get<string>(CONFIG.KEYS.API_KEY);
	if (!key) {
		vscode.window.showErrorMessage("API Key missing.");
	}
	return key;
}

export function deactivate() {}
