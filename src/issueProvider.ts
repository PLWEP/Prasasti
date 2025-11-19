import * as vscode from "vscode";
import * as path from "path";
import { readedFile, DocStatus } from "./viewService";
import { OutputChannel } from "vscode";

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

	private logger?: OutputChannel; // Variable logger

	public setLogger(log: OutputChannel) {
		this.logger = log;
	}

	public async scanWorkspace() {
		if (!this.globalState) {
			return;
		}

		this.logger?.appendLine(`[SCAN] Starting scan...`);

		const config = vscode.workspace.getConfiguration("prasasti");
		const filePattern =
			config.get<string>("includedFiles") || "**/*.{plsql,plsvc}";
		const skipKeywords = config.get<string[]>("skipDocKeywords"); // <-- AMBIL KONFIGURASI BARU
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
				this.globalState,
				this.logger,
				skipKeywords
			);

			const fileName = path.basename(uri.fsPath);
			if (result.status === DocStatus.UNKNOWN) {
				this.logger?.appendLine(`[SKIP] ${fileName}: ${result.reason}`);
			}

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

		const getStatusScore = (type: string) => {
			if (type === "dirty") {
				return 0;
			}
			if (type === "error") {
				return 1;
			}
			return 2;
		};

		tempItems.sort((a, b) => {
			const scoreA = getStatusScore(a.type);
			const scoreB = getStatusScore(b.type);

			if (scoreA !== scoreB) {
				return scoreA - scoreB;
			}

			return a.label.localeCompare(b.label);
		});

		this.problemItems = tempItems;
		this.logger?.appendLine(
			`[SCAN] Finished. Found ${this.problemItems.length} issues.`
		);
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
