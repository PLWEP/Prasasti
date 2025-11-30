import * as vscode from "vscode";

export class CategoryItem extends vscode.TreeItem {
	constructor(label: string, public readonly children: IssueItem[]) {
		super(
			label,
			children.length > 0
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None
		);
		this.contextValue = "category";
		this.iconPath = new vscode.ThemeIcon("folder-opened");
	}
}

export class IssueItem extends vscode.TreeItem {
	constructor(
		public readonly resourceUri: vscode.Uri,
		label: string,
		type: "error" | "warning",
		reason: string,
		contextType: "marker" | "docs"
	) {
		super(resourceUri, vscode.TreeItemCollapsibleState.None);
		this.description = label;
		this.tooltip = `${label}: ${reason}`;
		this.contextValue = contextType;
		this.iconPath = new vscode.ThemeIcon(
			type === "error" ? "error" : "alert",
			new vscode.ThemeColor(
				type === "error"
					? "testing.iconFailed"
					: "problemsWarningIcon.foreground"
			)
		);
		this.command = {
			command: "vscode.open",
			title: "Open",
			arguments: [resourceUri],
		};
	}
}
