import * as vscode from "vscode";
import { AnalysisService } from "../services/analysisService";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";
import { DocStatus } from "../utils/enums";
import { IssueItem, CategoryItem } from "../utils/treeItems";

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

		const patternDocs =
			config.get<string>(CONFIG.KEYS.INCLUDE_DOCS) ||
			"**/*.{plsql,plsvc}";
		const patternMarkers =
			config.get<string>(CONFIG.KEYS.INCLUDE_MARKERS) ||
			"**/*.{plsql,plsvc}";
		const skip = config.get<string[]>(CONFIG.KEYS.SKIP_KEYWORDS) || [];
		const markersScanOption =
			config.get<string>(CONFIG.KEYS.MARKER_SCAN) || "Max Scan";

		const tempMarker: IssueItem[] = [];
		const tempDocs: IssueItem[] = [];

		Logger.info("Scanning Uncommit Files...", "Provider");
		const skipUncommitFiles: string[] =
			await AnalysisService.analyzeUncommit();

		Logger.info(
			`Scanning Markers with option: ${markersScanOption}...`,
			"Provider"
		);
		const markerFiles = await vscode.workspace.findFiles(patternMarkers);
		for (const uri of markerFiles) {
			const fileName = uri.fsPath.split(/[\\/]/).pop() ?? "";
			if (skipUncommitFiles.includes(fileName)) {
				continue;
			}
			const res = await AnalysisService.analyzeForMarkers(
				uri,
				skip,
				markersScanOption
			);
			if (res && res.status === DocStatus.MISSING_MARKERS) {
				tempMarker.push(
					new IssueItem(
						uri,
						"Missing Markers",
						"error",
						res.reason,
						"marker"
					)
				);
			}
		}

		Logger.info("Scanning Docs...", "Provider");
		const docFiles = await vscode.workspace.findFiles(patternDocs);
		for (const uri of docFiles) {
			const fileName = uri.fsPath.split(/[\\/]/).pop() ?? "";
			if (skipUncommitFiles.includes(fileName)) {
				continue;
			}
			const res = await AnalysisService.analyzeForDocs(uri, skip);
			if (res) {
				if (res.status === DocStatus.OUTDATED) {
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
			}
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
		return this.manager.markerItems.sort();
	}
	getDocFiles() {
		return this.manager.docItems.sort();
	}
}
