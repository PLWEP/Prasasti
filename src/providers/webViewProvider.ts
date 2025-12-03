import * as vscode from "vscode";
import { DataManager } from "../managers/dataManager";
import { IssueItem } from "../utils/treeItems";
import * as path from "path";
import { COMMANDS } from "../constants";

export class WebviewProvider implements vscode.WebviewViewProvider {
	private manager = DataManager.getInstance();
	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		this._updateHtml();
		this._updateBadge();

		this.manager.onDidChangeData.event(() => {
			this._updateHtml();
			this._updateBadge();
		});

		webviewView.webview.onDidReceiveMessage(async (data) => {
			if (data.command === "openFile") {
				try {
					const doc = await vscode.workspace.openTextDocument(
						vscode.Uri.file(data.path)
					);
					await vscode.window.showTextDocument(doc, {
						preview: true,
					});
				} catch (e) {
					vscode.window.showErrorMessage(
						"Error opening file: " + data.path
					);
				}
			}
			if (data.command === "executeAction") {
				const uri = vscode.Uri.file(data.path);

				const mockItem = {
					resourceUri: uri,
				};

				vscode.commands.executeCommand(
					COMMANDS.GENERATE_MARKER,
					mockItem
				);
			}
		});
	}

	private _updateBadge() {
		if (!this._view) {
			return;
		}

		const total =
			this.manager.markerItems.length + this.manager.docItems.length;

		if (total > 0) {
			this._view.badge = {
				value: total,
				tooltip: `${total} issues found`,
			};
		} else {
			this._view.badge = undefined;
		}
	}

	private _updateHtml() {
		if (!this._view) {
			return;
		}
		const markers = this.manager.markerItems;
		const docs = this.manager.docItems;
		this._view.webview.html = this._buildHtml(markers, docs);
	}

	private _buildHtml(markers: IssueItem[], docs: IssueItem[]): string {
		const styles = this._getStyles();
		const script = this._getScript();
		const icons = this._getIcons();

		const markersHtml = this._renderList(markers, icons);
		const docsHtml = this._renderList(docs, icons);

		return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${styles}
        </head>
        <body>
            <div class="header-container">
                <div class="input-wrapper" id="input-wrapper">
                    <input type="text" class="search-box" id="search-input" placeholder="Filter files...">
                    <div class="toggle-btn" id="match-case-btn" title="Match Case (Alt+C)">${icons.matchCase}</div>
                </div>
            </div>

            <div class="section-header" id="header-markers">
                <div class="arrow-icon" id="arrow-markers">${icons.arrow}</div>
                <span id="label-markers">Marker Issues (${markers.length})</span>
            </div>
            <div id="list-markers" class="list-container">
                ${markersHtml}
            </div>

            <div class="section-header" id="header-docs" style="margin-top: 5px;">
                <div class="arrow-icon" id="arrow-docs">${icons.arrow}</div>
                <span id="label-docs">Doc Issues (${docs.length})</span>
            </div>
            <div id="list-docs" class="list-container">
                ${docsHtml}
            </div>

            ${script}
        </body>
        </html>`;
	}

	private _renderList(items: IssueItem[], icons: any): string {
		if (items.length === 0) {
			return `<div class="empty-state">No issues found.</div>`;
		}
		return items.map((item) => this._renderItem(item, icons)).join("");
	}

	private _renderItem(item: IssueItem, icons: any): string {
		const filePath = item.resourceUri.fsPath;
		const fileName = path.basename(filePath);

		let rawReason = item.tooltip || item.description || "";
		if (typeof rawReason !== "string") {
			rawReason = rawReason.toString();
		}
		const cleanReason = rawReason.replace(
			/^(Missing Markers:|Outdated Docs:|Missing Header:)\s*/i,
			""
		);

		return `
        <div class="item" data-path="${filePath}" title="${cleanReason}">
            <div class="icon-container">${icons.file}</div>
            <div class="content">
                <div class="file-header">
                    <span class="filename">${fileName}</span>
                    </div>
                <div class="issue-reason">${cleanReason}</div>
            </div>
            <button class="action-btn" title="Run Command">${icons.action}</button>
        </div>`;
	}

	private _getIcons() {
		return {
			file: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h9l1-1V5l-.29-.71zM13 14H4V2h5v4h4v8z"/></svg>`,
			arrow: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11 8L6 13 5.3 12.3 9.6 8 5.3 3.7 6 3z"/></svg>`,
			matchCase: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 13L5 6h1l2.5 7h-1L6.9 11H4.1l-.6 2h-1zm2-3h2L5.5 7.6 4.5 10zm6-1h4.5v1H11v3.5h-1v-8h1V9zm1-2.5v-1h2.5v1h-2.5z"/></svg>`,
			action: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2l10 6-10 6z"/></svg>`,
		};
	}

	private _getStyles(): string {
		return `<style>
            body { padding: 0; margin: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); background-color: var(--vscode-editor-background); }
            
            /* Header & Search */
            .header-container { position: sticky; top: 0; padding: 10px; background: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-widget-border); z-index: 10; }
            .input-wrapper { display: flex; align-items: center; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 2px; }
            .input-wrapper.focus { border-color: var(--vscode-focusBorder); }
            .search-box { flex-grow: 1; background: transparent; color: var(--vscode-input-foreground); border: none; padding: 4px 6px; outline: none; }
            .search-box::placeholder { color: var(--vscode-input-placeholderForeground); }
            .toggle-btn { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 3px; margin-right: 2px; opacity: 0.6; border: 1px solid transparent; }
            .toggle-btn:hover { background-color: var(--vscode-list-hoverBackground); opacity: 1; }
            .toggle-btn.active { background-color: var(--vscode-inputOption-activeBackground); color: var(--vscode-inputOption-activeForeground); border-color: var(--vscode-inputOption-activeBorder); opacity: 1; }

            /* Sections */
            .section-header { display: flex; align-items: center; padding: 6px 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; cursor: pointer; user-select: none; background: var(--vscode-sideBar-background); opacity: 0.8; }
            .section-header:hover { opacity: 1; }
            .arrow-icon { width: 16px; height: 16px; transition: transform 0.2s ease; transform: rotate(90deg); margin-right: 4px; }
            .arrow-icon.collapsed { transform: rotate(0deg); }
            .list-container { overflow: hidden; }
            .list-container.hidden { display: none; }

            /* Items */
            .item { display: flex; align-items: center; padding: 6px 12px 6px 22px; cursor: pointer; border-bottom: 1px solid var(--vscode-widget-border); position: relative; }
            .item:hover { background-color: var(--vscode-list-hoverBackground); }
            
            .icon-container { margin-right: 8px; color: var(--vscode-icon-foreground); opacity: 0.8; flex-shrink: 0; }
            .content { flex-grow: 1; overflow: hidden; margin-right: 10px; }
            .file-header { display: flex; align-items: baseline; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
            .filename { font-weight: 600; color: var(--vscode-list-highlightForeground); margin-right: 6px; }
            .issue-reason { margin-top: 2px; font-size: 0.9em; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            /* Action Button (Show on Hover) */
            .action-btn { background: transparent; border: none; color: var(--vscode-icon-foreground); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; opacity: 0; transform: translateX(5px); transition: all 0.2s ease; }
            .action-btn:hover { background-color: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
            .item:hover .action-btn { opacity: 1; transform: translateX(0); }

            .empty-state { padding: 10px 20px; opacity: 0.5; font-style: italic; font-size: 0.9em;}
            .hidden-item { display: none !important; }
        </style>`;
	}

	private _getScript(): string {
		return `<script>
            const vscode = acquireVsCodeApi();
            let isMatchCase = false;

            // --- EVENT HANDLING ---
            document.body.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('.action-btn');
                if (actionBtn) {
                    e.stopPropagation();
                    const path = actionBtn.closest('.item').getAttribute('data-path');
                    vscode.postMessage({ command: 'executeAction', path: path });
                    return;
                }

                const item = e.target.closest('.item');
                if (item) {
                    const path = item.getAttribute('data-path');
                    vscode.postMessage({ command: 'openFile', path: path });
                }
            });

            // --- SECTION TOGGLE ---
            function toggleSection(headerId, listId, arrowId) {
                const header = document.getElementById(headerId);
                const list = document.getElementById(listId);
                const arrow = document.getElementById(arrowId);
                header.addEventListener('click', () => {
                    list.classList.toggle('hidden');
                    arrow.classList.toggle('collapsed');
                });
            }
            toggleSection('header-markers', 'list-markers', 'arrow-markers');
            toggleSection('header-docs', 'list-docs', 'arrow-docs');

            // --- SEARCH LOGIC ---
            const searchInput = document.getElementById('search-input');
            const matchCaseBtn = document.getElementById('match-case-btn');
            const inputWrapper = document.getElementById('input-wrapper');

            searchInput.addEventListener('focus', () => inputWrapper.classList.add('focus'));
            searchInput.addEventListener('blur', () => inputWrapper.classList.remove('focus'));
            
            matchCaseBtn.addEventListener('click', () => {
                isMatchCase = !isMatchCase;
                matchCaseBtn.classList.toggle('active', isMatchCase);
                runFilter();
            });
            searchInput.addEventListener('input', runFilter);

            function runFilter() {
                const query = searchInput.value;
                const filterContainer = (containerId) => {
                    const items = document.getElementById(containerId).querySelectorAll('.item');
                    let visibleCount = 0;
                    items.forEach(item => {
                        let text = item.innerText;
                        let title = item.getAttribute('title') || '';
                        let searchText = query;
                        if (!isMatchCase) {
                            text = text.toLowerCase();
                            title = title.toLowerCase();
                            searchText = searchText.toLowerCase();
                        }
                        if(text.includes(searchText) || title.includes(searchText)) {
                            item.classList.remove('hidden-item');
                            visibleCount++;
                        } else {
                            item.classList.add('hidden-item');
                        }
                    });
                    return visibleCount;
                };
                
                const countMarkers = filterContainer('list-markers');
                const countDocs = filterContainer('list-docs');
                document.getElementById('label-markers').innerText = 'Marker Issues (' + countMarkers + ')';
                document.getElementById('label-docs').innerText = 'Doc Issues (' + countDocs + ')';
            }
        </script>`;
	}
}
