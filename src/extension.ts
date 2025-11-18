import * as vscode from "vscode";
import * as path from "path";
import { PrasastiProvider, PrasastiDataManager } from "./issueProvider";
import { runAiScriptForFile } from "./fixService";

export function activate(context: vscode.ExtensionContext) {
	const dataManager = PrasastiDataManager.getInstance();
	dataManager.setContext(context.workspaceState);

	const problemProvider = new PrasastiProvider();

	const problemTreeView = vscode.window.createTreeView("prasasti.problems", {
		treeDataProvider: problemProvider,
		showCollapseAll: true,
	});

	context.subscriptions.push(problemTreeView);

	dataManager.onDidChangeData.event(() => {
		const count = dataManager.getProblemFiles().length;
		if (count > 0) {
			problemTreeView.badge = {
				value: count,
				tooltip: `${count} files need documentation attention`,
			};
		} else {
			problemTreeView.badge = undefined;
		}
	});

	const refreshCmd = vscode.commands.registerCommand(
		"prasasti.refresh",
		() => {
			problemProvider.refresh();
			vscode.window.showInformationMessage("Refreshed");
		}
	);

	const fixAllCmd = vscode.commands.registerCommand(
		"prasasti.fixAll",
		async () => {
			const config = vscode.workspace.getConfiguration("prasasti");
			const apiKey = config.get<string>("apiKey");

			if (!apiKey) {
				promptToOpenSettings(
					"Gemini API Key is missing. Please configure it to use AI features."
				);
				return;
			}

			const filesToFix = dataManager.getProblemFiles();
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

			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Generating Documentation (AI)...",
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
						if (wsFolder) {
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
							} catch (e: any) {
								vscode.window.showErrorMessage(
									`Failed ${item.label}: ${e.message}`
								);
							}
						}
						processed++;
					}
					problemProvider.refresh();
					vscode.window.showInformationMessage(
						`Completed! Processed ${processed} files.`
					);
				}
			);
		}
	);

	const fixSingleCmd = vscode.commands.registerCommand(
		"prasasti.fixSingle",
		async (item: any) => {
			if (!item || !item.resourceUri) {
				return;
			}
			const config = vscode.workspace.getConfiguration("prasasti");
			const apiKey = config.get<string>("apiKey");

			if (!apiKey) {
				promptToOpenSettings("Gemini API Key is missing.");
				return;
			}

			const fileName = path.basename(item.resourceUri.fsPath);
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Updating ${fileName}...`,
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
							problemProvider.refresh();
							vscode.window.showInformationMessage(
								`Updated ${fileName}`
							);
						} catch (e: any) {
							vscode.window.showErrorMessage(
								`Error: ${e.message}`
							);
						}
					}
				}
			);
		}
	);

	let debounceTimer: NodeJS.Timeout | undefined;
	const triggerRefresh = () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => problemProvider.refresh(), 2000);
	};

	const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");
	fileWatcher.onDidChange(triggerRefresh);
	fileWatcher.onDidCreate(triggerRefresh);
	fileWatcher.onDidDelete(triggerRefresh);

	context.subscriptions.push(
		fileWatcher,
		refreshCmd,
		fixAllCmd,
		fixSingleCmd
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("prasasti")) {
				triggerRefresh();
			}
		})
	);

	checkSettingsOnStartup();

	problemProvider.refresh();
}

async function checkSettingsOnStartup() {
	const config = vscode.workspace.getConfiguration("prasasti");
	const apiKey = config.get<string>("apiKey");

	if (!apiKey || apiKey.trim() === "") {
		promptToOpenSettings(
			"Prasasti: Please set your Google Gemini API Key to enable AI documentation."
		);
	}
}

async function promptToOpenSettings(message: string) {
	const selection = await vscode.window.showWarningMessage(
		message,
		"Open Settings"
	);
	if (selection === "Open Settings") {
		vscode.commands.executeCommand(
			"workbench.action.openSettings",
			"prasasti"
		);
	}
}

export function deactivate() {}
