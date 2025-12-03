import * as vscode from "vscode";
import { COMMANDS, CONFIG, VIEWS } from "./constants";
import { IssueItem } from "./utils/treeItems";
import {
	generateMarkerHandler,
	generateMarkersHandler,
	refreshHandler,
} from "./handlers/commandHandlers";
import { WebviewProvider } from "./providers/webViewProvider";

export function activate(context: vscode.ExtensionContext) {
	const provider = new WebviewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEWS.WEB_VIEW, provider)
	);

	// provider.onDidChangeTreeData(() => {
	// 	const total =
	// 		provider.getMarkerFiles().length + provider.getDocFiles().length;
	// 	treeView.badge =
	// 		total > 0 ? { value: total, tooltip: "Issues found" } : undefined;
	// });

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.REFRESH, () =>
			refreshHandler(provider)
		),

		// vscode.commands.registerCommand(
		// 	COMMANDS.GENERATE_SINGLE_DOC,
		// 	async (item: IssueItem) => {
		// 		const key = getApiKey();
		// 		if (!key) {
		// 			return;
		// 		}
		// 		await runWithProgress("Generating Docs...", async () => {
		// 			await generateDocsForFile(item.resourceUri, key);
		// 			provider.refresh();
		// 		});
		// 	}
		// ),

		// vscode.commands.registerCommand(
		// 	COMMANDS.GENERATE_ALL_DOCS,
		// 	async () => {
		// 		const key = getApiKey();
		// 		if (!key) {
		// 			return;
		// 		}
		// 		const items = provider.getDocFiles();
		// 		if (items.length === 0) {
		// 			return vscode.window.showInformationMessage(
		// 				"No docs to update."
		// 			);
		// 		}
		// 		if (await confirmAction(items.length)) {
		// 			await runBatch("Updating Docs", items, async (item) =>
		// 				generateDocsForFile(item.resourceUri, key)
		// 			);
		// 			provider.refresh();
		// 		}
		// 	}
		// ),

		vscode.commands.registerCommand(
			COMMANDS.GENERATE_MARKER,
			async (item: IssueItem) => generateMarkerHandler(item, provider)
		),

		vscode.commands.registerCommand(COMMANDS.GENERATE_MARKERS, async () =>
			generateMarkersHandler(provider)
		)
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

export function deactivate() {}
