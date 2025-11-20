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
		const includePattern =
			config.get<string>(CONFIG.KEYS.INCLUDE) ||
			"**/*.{plsql,plsvc,views}";
		const skipKeywords =
			config.get<string[]>(CONFIG.KEYS.SKIP_KEYWORDS) || [];

		const files = await vscode.workspace.findFiles(
			includePattern,
			"**/node_modules/**"
		);
		const tempItems: IssueItem[] = [];

		const processFile = async (uri: vscode.Uri) => {
			const result = await AnalysisService.analyzeFile(uri, skipKeywords);

			if (result.status === DocStatus.OUTDATED) {
				tempItems.push(
					new IssueItem(
						uri,
						"Outdated Documentation",
						"warning",
						result.reason
					)
				);
			} else if (result.status === DocStatus.NO_HEADER) {
				tempItems.push(
					new IssueItem(uri, "Missing Header", "error", result.reason)
				);
			} else if (result.status === DocStatus.DIRTY_CODE) {
				tempItems.push(
					new IssueItem(
						uri,
						"Unsaved Changes",
						"warning",
						result.reason
					)
				);
			}
		};

		const CONCURRENCY = 10;
		for (let i = 0; i < files.length; i += CONCURRENCY) {
			await Promise.all(files.slice(i, i + CONCURRENCY).map(processFile));
		}

		this.problemItems = tempItems;
		this.onDidChangeData.fire();
		Logger.info(
			`Scan complete. Found ${tempItems.length} issues.`,
			"Provider"
		);
	}

	public getProblemFiles() {
		return this.problemItems;
	}
}

export class PrasastiProvider implements vscode.TreeDataProvider<IssueItem> {
	private dataManager = PrasastiDataManager.getInstance();
	readonly onDidChangeTreeData = this.dataManager.onDidChangeData.event;

	getTreeItem(element: IssueItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: IssueItem): Promise<IssueItem[]> {
		if (!element) {
			return this.dataManager.problemItems;
		}
		return [];
	}

	public refresh() {
		this.dataManager.scanWorkspace();
	}

	public getItems(): IssueItem[] {
		return this.dataManager.getProblemFiles();
	}
}

export class IssueItem extends vscode.TreeItem {
	constructor(
		public readonly resourceUri: vscode.Uri,
		public readonly description: string,
		public readonly type: "error" | "warning",
		public readonly debugReason: string
	) {
		super(resourceUri, vscode.TreeItemCollapsibleState.None);

		this.tooltip = `${this.description}\nDetails: ${this.debugReason}`;
		this.contextValue = "issueItem";

		if (type === "error") {
			this.iconPath = new vscode.ThemeIcon(
				"error",
				new vscode.ThemeColor("testing.iconFailed")
			);
		} else {
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
