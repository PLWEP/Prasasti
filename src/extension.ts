import * as vscode from "vscode";
import {
	PrasastiDataManager,
	PrasastiProvider,
	IssueItem,
} from "./providers/issueProvider";
import { generateDocsForFile } from "./commands/generateDocs";
import { fixMarkersForFile } from "./commands/fixMarker";
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
		const total =
			provider.getMarkerFiles().length + provider.getDocFiles().length;
		treeView.badge =
			total > 0 ? { value: total, tooltip: "Issues found" } : undefined;
	});

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.REFRESH, () =>
			provider.refresh()
		),

		vscode.commands.registerCommand(
			COMMANDS.GENERATE_SINGLE_DOC,
			async (item: IssueItem) => {
				const key = getApiKey();
				if (!key) {
					return;
				}
				await runWithProgress("Generating Docs...", async () => {
					await generateDocsForFile(item.resourceUri, key);
					provider.refresh();
				});
			}
		),

		vscode.commands.registerCommand(
			COMMANDS.GENERATE_ALL_DOCS,
			async () => {
				const key = getApiKey();
				if (!key) {
					return;
				}
				const items = provider.getDocFiles();
				if (items.length === 0) {
					return vscode.window.showInformationMessage(
						"No docs to update."
					);
				}
				if (await confirmAction(items.length)) {
					await runBatch("Updating Docs", items, async (item) =>
						generateDocsForFile(item.resourceUri, key)
					);
					provider.refresh();
				}
			}
		),

		vscode.commands.registerCommand(
			COMMANDS.FIX_SINGLE_MARKER,
			async (item: IssueItem) => {
				await runWithProgress("Fixing Markers...", async () => {
					await fixMarkersForFile(item.resourceUri);
					provider.refresh();
				});
			}
		),

		vscode.commands.registerCommand(COMMANDS.FIX_ALL_MARKERS, async () => {
			const items = provider.getMarkerFiles();
			if (items.length === 0) {
				return vscode.window.showInformationMessage(
					"No missing markers."
				);
			}
			if (await confirmAction(items.length)) {
				await runBatch("Fixing Markers", items, async (item) =>
					fixMarkersForFile(item.resourceUri)
				);
				provider.refresh();
			}
		})
	);

	setTimeout(() => provider.refresh(), 1000);
}

function getApiKey() {
	const key = vscode.workspace
		.getConfiguration(CONFIG.SECTION)
		.get<string>(CONFIG.KEYS.API_KEY);
	if (!key) {
		vscode.window.showErrorMessage("API Key missing.");
	}
	return key;
}

async function runWithProgress(title: string, task: () => Promise<void>) {
	await vscode.window.withProgress(
		{ title, location: vscode.ProgressLocation.Notification },
		async () => {
			try {
				await task();
				vscode.window.showInformationMessage("Success!");
			} catch (e: any) {
				vscode.window.showErrorMessage(e.message);
				Logger.error("Action Failed", "Ext", e);
			}
		}
	);
}

async function confirmAction(count: number) {
	return (
		(await vscode.window.showWarningMessage(
			`Process ${count} files?`,
			"Yes",
			"No"
		)) === "Yes"
	);
}

async function runBatch(
	title: string,
	items: IssueItem[],
	task: (item: IssueItem) => Promise<void>
) {
	await vscode.window.withProgress(
		{
			title,
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
		},
		async (p, token) => {
			let s = 0,
				f = 0;
			for (let i = 0; i < items.length; i++) {
				if (token.isCancellationRequested) {
					break;
				}
				p.report({
					message: `(${i + 1}/${items.length})`,
					increment: (1 / items.length) * 100,
				});
				try {
					await task(items[i]);
					s++;
				} catch {
					f++;
				}
			}
			vscode.window.showInformationMessage(
				`Batch complete. Success: ${s}, Fail: ${f}`
			);
		}
	);
}

export function deactivate() {}
