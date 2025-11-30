import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { GitService } from "../services/gitService";
import { AiService } from "../services/aiService";
import { PatchService } from "../services/patchService";
import { CONFIG, HEADER_REGEX, LINE_LIMIT_THRESHOLD } from "../constants";
import { Logger } from "../utils/logger";
import { HistoryEntry } from "../utils/interfaces";

export async function generateDocsForFile(uri: vscode.Uri, apiKey: string) {
	const filePath = uri.fsPath;
	const fileName = path.basename(filePath);
	const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
	if (!wsFolder) {
		return;
	}

	const content = await fs.readFile(filePath, "utf8");
	const match = content.match(HEADER_REGEX);
	let headerDateInt = 0;

	if (match) {
		headerDateInt = parseInt(match[1]);
	}

	const logs = await GitService.getLog(filePath, wsFolder.uri.fsPath, 50);
	if (!logs) {
		vscode.window.showInformationMessage("No history found.");
		return;
	}

	let forensicData = "";
	const commits = logs.split("\n");
	let validCount = 0;

	for (const line of commits) {
		if (forensicData.length > 30000) {
			break;
		}
		const [hash, date, author] = line.split("|");
		if (!hash) {
			continue;
		}

		if (parseInt(date) <= headerDateInt) {
			continue;
		}

		const diff = await GitService.getDiff(
			filePath,
			wsFolder.uri.fsPath,
			hash
		);
		if (!GitService.hasLogicChanges(diff)) {
			continue;
		}

		const cleanDiff = diff
			.split("\n")
			.filter((l) => l.match(/^(\+|-)/))
			.join("\n")
			.substring(0, 5000);
		forensicData += `=== COMMIT: ${date} by ${author} ===\n${cleanDiff}\n\n`;
		validCount++;
	}

	if (validCount === 0) {
		vscode.window.showInformationMessage("Docs are up to date.");
		return;
	}

	let finalContent = "";
	const lineCount = content.split("\n").length;

	try {
		if (lineCount < LINE_LIMIT_THRESHOLD) {
			const fullPrompt = `
You are a Senior IFS ERP Technical Consultant.
TASK: REWRITE documentation based on GIT CHANGES.
OUTPUT: Return FULL PL/SQL CODE.
CURRENT HEADER DATE: ${match ? match[1] : "None"}
NEW COMMITS TO DOCUMENT:
${forensicData}
SOURCE CODE:
${content}
RULES:
1. Update 'History' block. Add entries for the NEW COMMITS above.
2. Add/Update docstrings for modified methods.
3. Keep code logic EXACTLY as is.
`;
			const result = await AiService.generateDocs(
				fullPrompt,
				apiKey,
				false
			);
			if (!result) {
				throw new Error("Empty Full Rewrite result");
			}
			finalContent = result
				.replace(/^```(sql|plsql)?\s*/i, "")
				.replace(/```$/, "");
		} else {
			throw new Error("MAX_TOKENS_LIMIT");
		}
	} catch (e: any) {
		if (e.message === "MAX_TOKENS_LIMIT") {
			Logger.warn(`Switching to Patching for ${fileName}`, "Generator");
			const tomlPrompt = `
You are a Senior IFS ERP Consultant.
Task: Generate TOML Header History entries for the following GIT CHANGES.
NEW COMMITS:
${forensicData}
INSTRUCTIONS:
1. Create a TOML entry [[commits]] for EACH commit block above.
2. Keys: date (YYMMDD), sign, id, desc.
`;
			const raw = await AiService.generateDocs(tomlPrompt, apiKey, false);
			if (!raw) {
				throw new Error("Empty Patch result");
			}

			const entries = parseTomlOutput(raw);
			finalContent = PatchService.applyHeaderPatch(content, entries);
		} else {
			throw e;
		}
	}

	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	if (config.get<boolean>(CONFIG.KEYS.AUTO_APPLY)) {
		await fs.writeFile(filePath, finalContent, "utf8");
	} else {
		const tempPath = path.join(os.tmpdir(), `prasasti_${fileName}`);
		await fs.writeFile(tempPath, finalContent, "utf8");
		await vscode.commands.executeCommand(
			"vscode.diff",
			uri,
			vscode.Uri.file(tempPath),
			`AI Review: ${fileName}`
		);
	}
}

function parseTomlOutput(tomlText: string): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	let currentEntry: Partial<HistoryEntry> = {};
	const lines = tomlText
		.replace(/```toml|```/g, "")
		.trim()
		.split("\n");
	for (const line of lines) {
		const t = line.trim();
		if (t.startsWith("[[commits]]")) {
			if (Object.keys(currentEntry).length > 0) {
				entries.push(currentEntry as HistoryEntry);
			}
			currentEntry = {};
			continue;
		}
		const m = t.match(/^(\w+)\s*=\s*"(.*)"$/);
		if (m) {
			const k = m[1];
			const v = m[2];
			if (k === "date") {
				currentEntry.date = v;
			}
			if (k === "sign") {
				currentEntry.sign = v;
			}
			if (k === "id") {
				currentEntry.id = v.replace(/[\[\]]/g, "");
			}
			if (k === "desc") {
				currentEntry.desc = v;
			}
		}
	}
	if (Object.keys(currentEntry).length > 0) {
		entries.push(currentEntry as HistoryEntry);
	}
	return entries;
}
