import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { GitService } from "../services/gitService";
import { AiService } from "../services/aiService";
import { CONFIG, HEADER_REGEX } from "../constants";
import { Logger } from "../utils/logger";

export async function generateDocsForFile(uri: vscode.Uri, apiKey: string) {
	const filePath = uri.fsPath;
	const fileName = path.basename(filePath);
	const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
	if (!wsFolder) {
		return;
	}

	Logger.info(`Starting generation for ${fileName}`, "Generator");

	const content = await fs.readFile(filePath, "utf8");

	const match = content.match(HEADER_REGEX);
	let sinceDate = "";

	if (match) {
		const raw = match[1];
		sinceDate = `20${raw.substr(0, 2)}-${raw.substr(2, 2)}-${raw.substr(
			4,
			2
		)}`;
		Logger.info(`Base version found: ${sinceDate}`, "Generator");
	}

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
			.filter((l) => l.match(/^(\+|-)|^\s+@@/))
			.join("\n");
		forensicData += `=== COMMIT: ${date} by ${author} ===\n${cleanDiff}\n\n`;
	}

	const prompt = buildPrompt(fileName, forensicData, content);

	const newContent = await AiService.generateDocs(prompt, apiKey);
	if (!newContent) {
		throw new Error("AI returned empty content");
	}

	const finalCode = newContent
		.replace(/^```(sql|plsql)?\s*/i, "")
		.replace(/```$/, "");

	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	const autoApply = config.get<boolean>(CONFIG.KEYS.AUTO_APPLY);

	if (autoApply) {
		await fs.writeFile(filePath, finalCode, "utf8");
		Logger.info(`Auto-applied changes to ${fileName}`, "Generator");
	} else {
		const tempPath = path.join(os.tmpdir(), `prasasti_${fileName}`);
		await fs.writeFile(tempPath, finalCode, "utf8");
		await vscode.commands.executeCommand(
			"vscode.diff",
			uri,
			vscode.Uri.file(tempPath),
			`AI Review: ${fileName}`
		);
		Logger.info(`Opened Diff for ${fileName}`, "Generator");
	}
}

function buildPrompt(filename: string, forensic: string, code: string): string {
	return `You are a Senior IFS ERP Technical Consultant. Your task is to UPDATE documentation based on NEW GIT CHANGES.

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

FORENSIC GIT HISTORY for '${filename}':
${forensic}

SOURCE CODE for '${filename}':
${code}
`;
}
