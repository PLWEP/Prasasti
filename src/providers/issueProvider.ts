import * as vscode from "vscode";
import {
	AnalysisService,
	AuditResult,
	DocStatus,
} from "../services/analysisService";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";

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
		Logger.info("Scanning workspace...", "Provider");
		const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
		const pattern =
			config.get<string>(CONFIG.KEYS.INCLUDE) ||
			"**/*.{plsql,plsvc,views}";
		const skip = config.get<string[]>(CONFIG.KEYS.SKIP_KEYWORDS) || [];

		const files = await vscode.workspace.findFiles(
			pattern,
			"**/node_modules/**"
		);
		const tempItems: IssueItem[] = [];

		const batchSize = 5;
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (uri) => {
					const res = await AnalysisService.analyzeFile(uri, skip);
					if (res.status === DocStatus.OUTDATED) {
						tempItems.push(
							new IssueItem(
								uri,
								"Outdated",
								"warning",
								res.reason
							)
						);
					}
					if (res.status === DocStatus.NO_HEADER) {
						tempItems.push(
							new IssueItem(
								uri,
								"Missing Header",
								"error",
								res.reason
							)
						);
					}
				})
			);
		}

		this.problemItems = tempItems;
		this.onDidChangeData.fire();
	}

	public getItems() {
		return this.problemItems;
	}
}

export class PrasastiProvider implements vscode.TreeDataProvider<IssueItem> {
	private manager = PrasastiDataManager.getInstance();
	readonly onDidChangeTreeData = this.manager.onDidChangeData.event;

	getTreeItem(element: IssueItem): vscode.TreeItem {
		return element;
	}
	async getChildren(element?: IssueItem): Promise<IssueItem[]> {
		return element ? [] : this.manager.problemItems;
	}
	refresh() {
		this.manager.scanWorkspace();
	}
	getItems() {
		return this.manager.getItems();
	}
}

export class IssueItem extends vscode.TreeItem {
	constructor(
		public readonly resourceUri: vscode.Uri,
		label: string,
		type: "error" | "warning",
		reason: string
	) {
		super(resourceUri, vscode.TreeItemCollapsibleState.None);
		this.description = label;
		this.tooltip = `${label}: ${reason}`;
		this.contextValue = "issueItem";
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
