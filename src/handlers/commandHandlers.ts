import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { generateMarker } from "../commands/generateMarker";
import { DataManager } from "../managers/dataManager";
import { ListItem } from "../utils/interfaces";

export function refreshHandler() {
	const manager = DataManager.getInstance();
	manager.scanWorkspace();
}

export async function generateMarkerHandler(item: ListItem) {
	const manager = DataManager.getInstance();
	await runWithProgress("Generating Markers...", async () => {
		await generateMarker(item.resourceUri);
		manager.removeMarkerItem(item);
	});
}

export async function generateMarkersHandler() {
	const manager = DataManager.getInstance();
	const items = manager.markerItems;
	if (items.length === 0) {
		return vscode.window.showInformationMessage("No missing markers.");
	}
	if (await confirmAction(items.length)) {
		await runBatch("Fixing Markers", items, async (item) =>
			generateMarker(item.resourceUri)
		);
		manager.scanWorkspace();
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
	items: ListItem[],
	task: (item: ListItem) => Promise<void>
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
