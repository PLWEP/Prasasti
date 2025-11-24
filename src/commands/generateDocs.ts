import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { GitService } from "../services/gitService";
import { AiService } from "../services/aiService";
import { PatchService, HistoryEntry } from "../services/patchService";
import { CONFIG, HEADER_REGEX } from "../constants";
import { Logger } from "../utils/logger";

export async function generateDocsForFile(uri: vscode.Uri, apiKey: string) {
	const filePath = uri.fsPath;
	const fileName = path.basename(filePath);
	const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
	if (!wsFolder) {
		return;
	}

	const content = await fs.readFile(filePath, "utf8");
	const match = content.match(HEADER_REGEX);
	let sinceDate = match
		? `20${match[1].substr(0, 2)}-${match[1].substr(
				2,
				2
		  )}-${match[1].substr(4, 2)}`
		: "";

	const logs = await GitService.getLog(
		filePath,
		wsFolder.uri.fsPath,
		20,
		sinceDate
	);
	if (!logs) {
		vscode.window.showInformationMessage(
			`No new changes found for ${fileName}`
		);
		return;
	}

	let forensicData = "";
	const commits = logs.split("\n");
	for (const line of commits) {
		if (forensicData.length > 30000) {
			break;
		}
		const [hash, date, author] = line.split("|");
		if (!hash) {
			continue;
		}
		const diff = await GitService.getDiff(
			filePath,
			wsFolder.uri.fsPath,
			hash
		);
		const cleanDiff = diff
			.split("\n")
			.filter((l) => l.match(/^(\+|-)/))
			.join("\n")
			.substring(0, 5000);
		forensicData += `=== COMMIT: ${date} by ${author} ===\n${cleanDiff}\n\n`;
	}

	let finalContent = "";
	try {
		Logger.info(`Attempting Full Rewrite for ${fileName}`, "Generator");
		const fullPrompt = `
You are a Senior IFS ERP Technical Consultant. Your task is to UPDATE documentation based on NEW GIT CHANGES.

INPUTS:
1. SOURCE CODE: Current file content (containing potentially messy legacy markers and including existing history).
2. FORENSIC DATA: Only the NEW changes (commits) that happened AFTER the last documentation update.

RULES:

1. **HEADER HISTORY RECONSTRUCTION:**
   - Locate the standard IFS Header block.
   - REWRITE the 'History' list based on the 'FORENSIC GIT HISTORY'.
   - **Format:** \`YYMMDD  Sign    [Ticket-ID] Description\`
   - **Ticket-ID:** If the git commit message or diff mentions a Ticket/Jira ID (e.g., SC-1234), use it. If not, generate a unique ID based on date (e.g., \`MOD-251118\`).
   - **Description:** Summarize the logic change professionally based on the diff analysis.
   - NEWER entries should be at the top of the 'History' list.

2. **CODE MARKER SYNCHRONIZATION (CRITICAL):**
   - **Legacy Markers:** If you find old markers (e.g., "-- 050519 ERW Start"), DO NOT DELETE THEM. Instead, **REFORMAT** them to match the standard format below using the corresponding info from the Header.
   - **New Changes:** If the 'FORENSIC GIT HISTORY' shows significant logic added/changed, ensure those blocks are wrapped in markers.
   - **STANDARD FORMAT:**
     -- [Ticket-ID] [Sign] Start
        [The Code Logic]
     -- [Ticket-ID] [Sign] End
     
3. **METHOD DOCUMENTATION:**
   - Add standard IFS Docstrings to all FUNCTIONS/PROCEDURES/VIEWS.
   - Format:
     -----------------------------------------------------------------------------
     -- [Method_Name]
     --    [Concise Description]
     -----------------------------------------------------------------------------

4. **NO LOGIC CHANGES:** Return the code logic exactly as is. Only add/format comments.
5. OUTPUT: Return ONLY the full valid PL/SQL code. Do not use Markdown code blocks (\`\`\`sql).
6. PRESERVE SYNTAX: DO NOT remove any special characters used for PL/SQL functions or variables, including the dollar sign ($), ampersand (&), and pipe (|).
7. DONT ADD PROMPT IN THE VIEW.
8. CRITICAL: The string '$SEARCH' and any text after that must remain intact.
9. IMPORTANT: Do not delete any system-level logging calls, including any function starting with 'Log_Sys.' or 'Dbms_Output'. These are required system functions.

FORENSIC GIT HISTORY for '${fileName}':
${forensicData}

SOURCE CODE for '${fileName}':
${content}
`;
		const result = await AiService.generateDocs(fullPrompt, apiKey, false);
		if (!result) {
			throw new Error("Empty Full Rewrite result");
		}
		finalContent = result
			.replace(/^```(sql|plsql)?\s*/i, "")
			.replace(/```$/, "");
	} catch (e: any) {
		if (e.message === "MAX_TOKENS_LIMIT") {
			Logger.warn(
				`Full Rewrite failed (File too large). Switching to TOML Patching.`,
				"Generator"
			);

			const tomlPrompt = `
You are a Senior IFS ERP Consultant.
Task: Analyze GIT CHANGES for '${fileName}' and generate Header History entries for EACH commit.

GIT FORENSIC DATA:
${forensicData}

INSTRUCTIONS:
1. Analyze ALL commits provided in the forensic data.
2. Create a TOML entry for EACH relevant commit.
3. Use strict TOML format with the tag [[commits]].
4. Keys required: date (YYMMDD), sign (Max 5 chars), id (Ticket ID), desc (Summary).
5. Sort: Newest commits first.
6. ID: If the git commit message or diff mentions a Ticket (e.g., SC-1234), use it. If not, generate a unique ID based on date (e.g., \`MOD-251118\`).

EXAMPLE OUTPUT:
[[commits]]
date = "241121"
sign = "ALEX"
id = "SC-1234"
desc = "Added validation logic for invoice"

[[commits]]
date = "241120"
sign = "BOB"
id = "SC-1100"
desc = "Fixed null pointer exception"
`;
			const raw = await AiService.generateDocs(tomlPrompt, apiKey, false);
			if (!raw) {
				throw new Error("Empty Patch result");
			}

			const entries = parseTomlOutput(raw);
			finalContent = PatchService.applyHeaderPatch(content, entries);
			Logger.info(
				`Surgical patch applied: ${entries.length} entries.`,
				"Generator"
			);
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
				currentEntry.id = v;
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
