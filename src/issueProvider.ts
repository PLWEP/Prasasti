import * as vscode from "vscode";
import * as path from "path";
import { readedFile, DocStatus } from "./viewService";

export class PrasastiDataManager {
	private static instance: PrasastiDataManager;
	public readonly onDidChangeData = new vscode.EventEmitter<void>();
	public problemItems: IssueItem[] = [];
	private globalState?: vscode.Memento;

	private constructor() {}

	public static getInstance(): PrasastiDataManager {
		if (!PrasastiDataManager.instance) {
			PrasastiDataManager.instance = new PrasastiDataManager();
		}
		return PrasastiDataManager.instance;
	}

	public setContext(state: vscode.Memento) {
		this.globalState = state;
	}

	public async scanWorkspace() {
		if (!this.globalState) {
			return;
		}

		const config = vscode.workspace.getConfiguration("prasasti");
		const filePattern =
			config.get<string>("includedFiles") || "**/*.{plsql,apv,apy,sql}";
		const files = await vscode.workspace.findFiles(
			filePattern,
			"**/node_modules/**"
		);

		const tempItems: IssueItem[] = [];
		const CONCURRENCY = 10;

		const processFile = async (uri: vscode.Uri) => {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
			if (!workspaceFolder || !this.globalState) {
				return;
			}

			const result = await readedFile(
				uri.fsPath,
				workspaceFolder.uri.fsPath,
				this.globalState
			);
			const fileName = path.basename(uri.fsPath);

			if (result.status === DocStatus.NO_HEADER) {
				tempItems.push(
					new IssueItem(
						fileName,
						uri,
						"Missing Header",
						"error",
						result.reason
					)
				);
			} else if (result.status === DocStatus.OUTDATED) {
				tempItems.push(
					new IssueItem(
						fileName,
						uri,
						"Outdated Documentation",
						"warning",
						result.reason
					)
				);
			}
		};

		for (let i = 0; i < files.length; i += CONCURRENCY) {
			const chunk = files.slice(i, i + CONCURRENCY);
			await Promise.all(chunk.map((uri) => processFile(uri)));
		}

		tempItems.sort((a, b) => {
			if (a.type === "error" && b.type !== "error") {
				return -1;
			}
			if (a.type !== "error" && b.type === "error") {
				return 1;
			}
			return 0;
		});

		this.problemItems = tempItems;
		this.onDidChangeData.fire();
	}

	public getProblemFiles() {
		return this.problemItems;
	}
}

export class PrasastiProvider implements vscode.TreeDataProvider<IssueItem> {
	private dataManager = PrasastiDataManager.getInstance();
	readonly onDidChangeTreeData = this.dataManager.onDidChangeData.event;
	getTreeItem(element: IssueItem) {
		return element;
	}
	async getChildren(element?: IssueItem) {
		if (!element) {
			return this.dataManager.problemItems;
		}
		return [];
	}
	public refresh() {
		this.dataManager.scanWorkspace();
	}
}

class IssueItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly resourceUri: vscode.Uri,
		public readonly description: string,
		public readonly type: "error" | "warning",
		public readonly debugReason: string
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.tooltip = `${this.label}\nReason: ${this.debugReason}`;
		this.contextValue = type;

		if (type === "error") {
			this.iconPath = new vscode.ThemeIcon(
				"error",
				new vscode.ThemeColor("testing.iconFailed")
			);
		} else if (type === "warning") {
			this.iconPath = new vscode.ThemeIcon(
				"alert",
				new vscode.ThemeColor("problemsWarningIcon.foreground")
			);
		}

		this.command = {
			command: "vscode.open",
			title: "Open File",
			arguments: [this.resourceUri],
		};
	}
}
