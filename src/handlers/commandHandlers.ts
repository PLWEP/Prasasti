import { WebviewProvider } from "../providers/webViewProvider";
import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { generateMarker } from "../commands/generateMarker";
import { IssueItem } from "../utils/treeItems";

export function refreshHandler(provider: WebviewProvider) {
	provider.refresh();
}

export async function generateMarkerHandler(
	item: IssueItem,
	provider: WebviewProvider
) {
	await runWithProgress("Generating Markers...", async () => {
		await generateMarker(item.resourceUri);
		provider.removeMarkerFile(item);
	});
}

export async function generateMarkersHandler(provider: WebviewProvider) {
	const items = provider.getMarkerFiles();
	if (items.length === 0) {
		return vscode.window.showInformationMessage("No missing markers.");
	}
	if (await confirmAction(items.length)) {
		await runBatch("Fixing Markers", items, async (item) =>
			generateMarker(item.resourceUri)
		);
		provider.refresh();
	}
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
