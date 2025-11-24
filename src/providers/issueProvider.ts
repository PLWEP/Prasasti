import * as vscode from "vscode";
import { AnalysisService, DocStatus } from "../services/analysisService";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";

export class CategoryItem extends vscode.TreeItem {
	constructor(label: string, public readonly children: IssueItem[]) {
		super(label, vscode.TreeItemCollapsibleState.Expanded);
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

export class PrasastiDataManager {
	private static instance: PrasastiDataManager;
	public readonly onDidChangeData = new vscode.EventEmitter<void>();
	public markerItems: IssueItem[] = [];
	public docItems: IssueItem[] = [];

	private constructor() {}
	public static getInstance() {
		if (!PrasastiDataManager.instance) {
			PrasastiDataManager.instance = new PrasastiDataManager();
		}
		return PrasastiDataManager.instance;
	}
	public setContext(state: vscode.Memento) {}

	public async scanWorkspace() {
		Logger.info("Scanning workspace...", "Provider");
		const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
		const pattern =
			config.get<string>(CONFIG.KEYS.INCLUDE) || "**/*.{plsql,plsvc}";
		const skip = config.get<string[]>(CONFIG.KEYS.SKIP_KEYWORDS) || [];

		const files = await vscode.workspace.findFiles(
			pattern,
			"**/node_modules/**"
		);
		const tempMarker: IssueItem[] = [];
		const tempDocs: IssueItem[] = [];

		const batchSize = 5;
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (uri) => {
					const res = await AnalysisService.analyzeFile(uri, skip);
					if (res.status === DocStatus.MISSING_MARKERS) {
						tempMarker.push(
							new IssueItem(
								uri,
								"Missing Markers",
								"error",
								res.reason,
								"marker"
							)
						);
					} else if (res.status === DocStatus.OUTDATED) {
						tempDocs.push(
							new IssueItem(
								uri,
								"Outdated Docs",
								"warning",
								res.reason,
								"docs"
							)
						);
					} else if (res.status === DocStatus.NO_HEADER) {
						tempDocs.push(
							new IssueItem(
								uri,
								"Missing Header",
								"error",
								res.reason,
								"docs"
							)
						);
					}
				})
			);
		}

		this.markerItems = tempMarker;
		this.docItems = tempDocs;
		this.onDidChangeData.fire();
	}
}

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
			if (this.manager.markerItems.length > 0) {
				items.push(
					new CategoryItem(
						`Marker Issues (${this.manager.markerItems.length})`,
						this.manager.markerItems
					)
				);
			}
			if (this.manager.docItems.length > 0) {
				items.push(
					new CategoryItem(
						`Doc Issues (${this.manager.docItems.length})`,
						this.manager.docItems
					)
				);
			}
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
