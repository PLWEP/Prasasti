import { scanService } from "../services/scanService";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";
import { DocStatus } from "../utils/enums";
import { IssueItem } from "../utils/treeItems";
import * as vscode from "vscode";

export class DataManager {
	private static instance: DataManager;
	public readonly onDidChangeData = new vscode.EventEmitter<void>();
	public markerItems: IssueItem[] = [];
	public docItems: IssueItem[] = [];

	private constructor() {}
	public static getInstance() {
		if (!DataManager.instance) {
			DataManager.instance = new DataManager();
		}
		return DataManager.instance;
	}

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
			await scanService.scanUncommitFiles();
		Logger.info(
			`Found ${skipUncommitFiles.length} uncommitted files.`,
			"Provider"
		);

		Logger.info(
			`Scanning files with option: ${markersScanOption}...`,
			"Provider"
		);
		const markerFiles = await vscode.workspace.findFiles(patternMarkers);
		for (const uri of markerFiles) {
			const fileName = uri.fsPath.split(/[\\/]/).pop() ?? "";
			if (skipUncommitFiles.includes(fileName)) {
				continue;
			}
			const res = await scanService.scanMarkerFiles(
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
			tempMarker.sort();
		}
		Logger.info(
			`Found ${tempMarker.length} files need to generate marker...`,
			"Provider"
		);

		const docFiles = await vscode.workspace.findFiles(patternDocs);
		for (const uri of docFiles) {
			const fileName = uri.fsPath.split(/[\\/]/).pop() ?? "";
			if (skipUncommitFiles.includes(fileName)) {
				continue;
			}
			const res = await scanService.scanDocumentationFiles(uri, skip);
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
			tempDocs.sort();
		}
		Logger.info(
			`Found ${tempDocs.length} files need to generate documentation...`,
			"Provider"
		);

		this.markerItems = tempMarker;
		this.docItems = tempDocs;
		this.onDidChangeData.fire();
	}

	public async removeMarkerItem(item: IssueItem) {
		this.markerItems = this.markerItems.filter(
			(i) => i.resourceUri.fsPath !== item.resourceUri.fsPath
		);
		this.onDidChangeData.fire();
	}
}
