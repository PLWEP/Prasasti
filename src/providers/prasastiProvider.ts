import * as vscode from "vscode";
import { CategoryItem } from "../utils/treeItems";
import { PrasastiDataManager } from "../managers/dataManager";

export class PrasastiProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>
{
	private manager = PrasastiDataManager.getInstance();
	readonly onDidChangeTreeData = this.manager.onDidChangeData.event;

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			const items: vscode.TreeItem[] = [];
			items.push(
				new CategoryItem(
					`Marker Issues (${this.manager.markerItems.length})`,
					this.manager.markerItems.sort()
				)
			);
			items.push(
				new CategoryItem(
					`Doc Issues (${this.manager.docItems.length})`,
					this.manager.docItems.sort()
				)
			);
			return items;
		}
		if (element instanceof CategoryItem) {
			return element.children;
		}
		return [];
	}
	refresh() {
		this.manager.scanWorkspace();
	}
	getMarkerFiles() {
		return this.manager.markerItems;
	}
	getDocFiles() {
		return this.manager.docItems;
	}
}
