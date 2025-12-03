import { scanService } from "../services/scanService";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";
import * as vscode from "vscode";
import { ListItem } from "../utils/interfaces";

export class DataManager {
	private static instance: DataManager;
	public readonly onDidChangeData = new vscode.EventEmitter<void>();
	public markerItems: ListItem[] = [];
	public docItems: ListItem[] = [];

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
		const fileScanOption =
			config.get<string>(CONFIG.KEYS.FILE_SCAN) || "Max Scan";

		const tempMarker: ListItem[] = [];
		const tempDocs: ListItem[] = [];

		Logger.info("Scanning Uncommit Files...", "Provider");
		const skipUncommitFiles: string[] =
			await scanService.scanUncommitFiles();
		Logger.info(
			`Found ${skipUncommitFiles.length} uncommitted files.`,
			"Provider"
		);

		Logger.info(
			`Scanning files with option: ${fileScanOption}...`,
			"Provider"
		);
		const markerFiles = await vscode.workspace.findFiles(patternMarkers);
		for (const uri of markerFiles) {
			const fileName = uri.fsPath.split(/[\\/]/).pop() ?? "";
			if (skipUncommitFiles.includes(fileName)) {
				continue;
			}
			const res = await scanService.scanFiles(
				uri,
				skip,
				fileScanOption,
				"Marker"
			);
			if (res) {
				tempMarker.push({
					resourceUri: uri,
					label: "Missing Markers",
					reason: res.reason,
					contextType: "marker",
				});
			}
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
			const res = await scanService.scanFiles(
				uri,
				skip,
				fileScanOption,
				"Documentation"
			);
			if (res) {
				tempDocs.push({
					resourceUri: uri,
					label: "Missing Documentation",
					reason: res.reason,
					contextType: "documentation",
				});
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

	public async removeMarkerItem(item: ListItem) {
		this.markerItems = this.markerItems.filter(
			(i) => i.resourceUri.fsPath !== item.resourceUri.fsPath
		);
		this.onDidChangeData.fire();
	}
}
