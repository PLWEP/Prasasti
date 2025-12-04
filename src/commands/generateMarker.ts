import * as vscode from "vscode";
import * as path from "path";
import { GitService } from "../services/gitService";
import { Logger } from "../utils/logger";
import {
	CODE_SEPARATOR,
	CODE_SEPARATOR_REGEX,
	CONFIG,
	MARKER_REGEX,
	OLD_MARKER_REGEX,
} from "../constants";
import * as fs from "fs";
import { CommitInfo, MarkerRule } from "../utils/interfaces";
import { minimatch } from "minimatch";

export async function generateMarker(uri: vscode.Uri) {
	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	const skip = config.get<string[]>(CONFIG.KEYS.SKIP_KEYWORDS) || [];
	const fileScanOption =
		config.get<string>(CONFIG.KEYS.FILE_SCAN) || "Full Scan";
	const rules = config.get<MarkerRule[]>(CONFIG.KEYS.RULES) || [];

	const filePath = uri.fsPath;
	const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
	if (!wsFolder) {
		return;
	}

	const root = wsFolder.uri.fsPath;
	const relativePath = path.relative(root, filePath);
	Logger.info(`Generate Markers for ${path.basename(filePath)}`, "Markers");

	const activeRule = rules.find((rule) =>
		minimatch(relativePath, rule.filePattern)
	);
	if (!activeRule) {
		Logger.info(`No matching rule found for ${relativePath}`, "Markers");
		return;
	}
	Logger.info(
		`Applying rule: ${activeRule.message || activeRule.filePattern}`,
		"Markers"
	);
	let headerStopRegex: RegExp | null = null;
	try {
		if (activeRule.startRegex) {
			headerStopRegex = new RegExp(activeRule.startRegex, "i");
		}
	} catch (e) {
		vscode.window.showErrorMessage(
			`Invalid Regex in rule: ${activeRule.startRegex}`
		);
		return;
	}
	const inlineSkipKeywords = activeRule.skipKeywords || [];

	try {
		const commitMap = new Map<string, { label: string; author: string }>();
		const dateCounters: { [key: string]: number } = {};

		const fileDatesList = getMarkerDate(filePath);
		let parsedCommits: CommitInfo[] = [];

		fileDatesList.sort();
		const lastDate =
			fileDatesList.length > 0
				? fileDatesList[fileDatesList.length - 1]
				: undefined;

		if (fileScanOption === "Full Scan" || !lastDate) {
			parsedCommits = await GitService.getMarkerDiff(
				filePath,
				root,
				skip
			);
		} else {
			parsedCommits = await GitService.getMarkerDiff(
				filePath,
				root,
				skip,
				lastDate
			);
		}

		parsedCommits.forEach((c) => {
			const shortDate = c.date.replace(/-/g, "").substring(2);
			if (!dateCounters[shortDate]) {
				dateCounters[shortDate] = 0;
			}
			dateCounters[shortDate]++;

			const index = dateCounters[shortDate];
			const label = `${c.type}-${shortDate}-${index}`;

			commitMap.set(c.hash, { label, author: c.author });
		});

		const blameData = await GitService.getMarkerBlame(filePath, root);
		const annotatedLines: string[] = [];
		let headerPassed = !headerStopRegex;

		let currentBlock = {
			markerKey: null as string | null,
			info: null as { label: string; author: string } | null,
			lines: [] as string[],
		};

		const flushBlock = () => {
			if (currentBlock.lines.length === 0) {
				return;
			}
			const info = currentBlock.info;

			if (info) {
				if (currentBlock.lines.length === 1) {
					annotatedLines.push(
						`${currentBlock.lines[0]} -- [${info.label}] ${info.author}`
					);
				} else {
					annotatedLines.push(
						`-- Start [${info.label}] ${info.author}`
					);
					annotatedLines.push(...currentBlock.lines);
					annotatedLines.push(
						`-- End [${info.label}] ${info.author}`
					);
				}
			} else {
				annotatedLines.push(...currentBlock.lines);
			}
			currentBlock.lines = [];
			currentBlock.info = null;
			currentBlock.markerKey = null;
		};

		for (const lineData of blameData) {
			let content = lineData.content || "";

			if (!headerPassed && headerStopRegex) {
				annotatedLines.push(content);
				if (headerStopRegex.test(content)) {
					headerPassed = true;
				}
				continue;
			}

			if (
				content.trim().startsWith("-- Start [") ||
				content.trim().startsWith("-- End [")
			) {
				if (OLD_MARKER_REGEX.test(content)) {
					continue;
				}
			}

			if (content.includes("-- [")) {
				content = content
					.replace(/--\s*\[(?:ADD|MOD)-\d{6}-\d+\].*$/, "")
					.trimEnd();
			}

			if (content.trim() === "") {
				flushBlock();
				annotatedLines.push("");
				continue;
			}

			if (content.includes("----")) {
				flushBlock();
				annotatedLines.push(content);
				continue;
			}

			if (
				inlineSkipKeywords.some((keyword) => content.includes(keyword))
			) {
				flushBlock();
				annotatedLines.push(content);
				continue;
			}

			let commitInfo = lineData.hash
				? commitMap.get(lineData.hash)
				: undefined;

			let preservedLabel = null;
			let preservedAuthor = null;

			if (!commitInfo && fileScanOption !== "Full Scan") {
				const originalContent = lineData.content || "";
				const match = originalContent.match(
					/\[((?:ADD|MOD)-\d{6}-\d+)\]\s*(\w+)/
				);
				if (match) {
					preservedLabel = match[1];
					preservedAuthor = match[2];
				}
			}

			const finalLabel = commitInfo ? commitInfo.label : preservedLabel;
			const finalAuthor = commitInfo
				? commitInfo.author
				: preservedAuthor || lineData.blameAuthor || "Unknown";

			const currentKey = finalLabel
				? `${finalLabel}|${finalAuthor}`
				: "NO_MARKER";

			if (currentKey !== currentBlock.markerKey) {
				flushBlock();
				currentBlock.markerKey = currentKey;
				currentBlock.info = finalLabel
					? { label: finalLabel, author: finalAuthor }
					: null;
			}

			currentBlock.lines.push(content);
		}

		flushBlock();

		fs.writeFileSync(filePath, annotatedLines.join("\n"));
	} catch (e: any) {
		Logger.error("Failed to generate markers", "Markers", e);
		vscode.window.showErrorMessage(
			`Error generating markers: ${e.message}`
		);
	}
}

export function getMarkerDate(filePath: string): string[] {
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const parts = fileContent.split(CODE_SEPARATOR);
		const codeBody = parts.length >= 2 ? parts[1] : "";
		const modCommentRegex = MARKER_REGEX;
		const comments = codeBody.match(modCommentRegex) || [];
		const uniqueDates: Set<string> = new Set();

		comments.forEach((comment) => {
			const dateMatch = comment.match(/(\d{6})/);

			if (dateMatch) {
				uniqueDates.add(dateMatch[0]);
			}
		});

		const finalDates: string[] = [...uniqueDates];
		return finalDates;
	} catch {
		return [];
	}
}
