import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as cp from "child_process";
import * as util from "util";
import * as path from "path";
import * as os from "os";
import { Logger } from "../utils/logger";
import { CONFIG } from "../constants";

const execAsync = util.promisify(cp.exec);

export async function runAiScriptForFile(
	filePath: string,
	workspaceRoot: string,
	apiKey: string
): Promise<void> {
	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	const model = config.get<string>(CONFIG.KEYS.MODEL) || "gemini-1.5-flash";
	const autoApply = config.get<boolean>(CONFIG.KEYS.AUTO_APPLY) ?? true;

	let originalContent = "";
	try {
		originalContent = await fs.readFile(filePath, "utf8");
	} catch (e) {
		throw new Error(`Could not read file: ${filePath}`);
	}

	const forensicData = await analyzeGitHistory(
		filePath,
		workspaceRoot,
		originalContent
	);

	if (!forensicData) {
		vscode.window.showInformationMessage(
			"No new commits found since the last documentation."
		);
		return;
	}

	const fileName = path.basename(filePath);
	const promptText = getPrompt(fileName, forensicData, originalContent);

	Logger.info(`[AI] Requesting update for ${fileName} using ${model}...`);
	const newContent = await callGeminiWithRetry(
		model,
		apiKey,
		promptText,
		fileName
	);

	if (newContent) {
		const cleanContent = newContent
			.replace(/^```sql\s*/i, "")
			.replace(/^```plsql\s*/i, "")
			.replace(/```$/, "");

		if (autoApply) {
			await fs.writeFile(filePath, cleanContent, "utf8");
			Logger.info(`[SUCCESS] Applied changes to ${fileName}`);
		} else {
			await showDiffPreview(filePath, cleanContent);
			Logger.info(`[SUCCESS] Opened Diff View for ${fileName}`);
		}
	} else {
		throw new Error(`Gemini API returned empty response for ${fileName}`);
	}
}

async function analyzeGitHistory(
	filePath: string,
	cwd: string,
	content: string
): Promise<string | null> {
	const headerMatch = content.match(/--\s+(\d{6})\s+\w+/);
	let gitCommand = `git log -n 20 --date=format:'%y%m%d' --pretty=format:"%H|%ad|%an" -- "${filePath}"`;

	if (headerMatch) {
		const lastDocDate = headerMatch[1];
		const isoDate = `20${lastDocDate.substring(
			0,
			2
		)}-${lastDocDate.substring(2, 4)}-${lastDocDate.substring(4, 6)}`;

		Logger.info(
			`[GIT] Last doc date found: ${isoDate}. Fetching incremental updates...`
		);
		gitCommand = `git log --since="${isoDate} 00:00:00" --date=format:'%y%m%d' --pretty=format:"%H|%ad|%an" -- "${filePath}"`;
	}

	let commitsRaw: string;
	try {
		const { stdout } = await execAsync(gitCommand, { cwd });
		commitsRaw = stdout.trim();
	} catch (e: any) {
		Logger.error(`[GIT ERROR] Failed to read logs: ${e.message}`);
		return null;
	}

	if (!commitsRaw) {
		return null;
	}

	const commits = commitsRaw.split("\n").slice(0, 10);
	let forensicData = "";

	for (const commitLine of commits) {
		const parts = commitLine.split("|");
		if (parts.length < 3) {
			continue;
		}

		const [hash, date, author] = parts;

		try {
			const { stdout } = await execAsync(
				`git show --no-color --oneline ${hash} -- "${filePath}"`,
				{ cwd, maxBuffer: 1024 * 1024 * 5 }
			);

			const cleanDiff = stdout
				.split("\n")
				.filter((l) => l.match(/^(\+|-)|^\s+@@/))
				.join("\n");

			forensicData += `=== COMMIT: ${date} by ${author} ===\n${cleanDiff}\n================================\n`;
		} catch (e) {
			continue;
		}
	}

	return forensicData || null;
}

async function callGeminiWithRetry(
	modelName: string,
	apiKey: string,
	prompt: string,
	fileName: string
): Promise<string | null> {
	const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
	const headers = {
		"x-goog-api-key": apiKey,
		"Content-Type": "application/json",
	};

	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	const maxRetries = config.get<number>(CONFIG.KEYS.RETRIES) || 3;

	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			const response = await fetch(apiUrl, {
				method: "POST",
				headers: headers,
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.2,
						maxOutputTokens: 8192,
					},
				}),
			});

			if (response.status === 429) {
				attempt++;
				const delay = Math.pow(2, attempt) * 1000;
				Logger.warn(
					`[RATE LIMIT] ${fileName} (Attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status} - ${response.statusText}`
				);
			}

			const result: any = await response.json();

			if (
				result.candidates &&
				result.candidates[0] &&
				result.candidates[0].content
			) {
				return result.candidates[0].content.parts[0].text;
			} else {
				return null;
			}
		} catch (e: any) {
			attempt++;
			Logger.error(`[API ERROR] ${e.message}`);
			if (attempt >= maxRetries) {
				return null;
			}
		}
	}
	return null;
}

async function showDiffPreview(originalPath: string, newContent: string) {
	const fileName = path.basename(originalPath);
	const tempPath = path.join(os.tmpdir(), `prasasti_ai_${fileName}`);

	await fs.writeFile(tempPath, newContent, "utf8");

	const leftUri = vscode.Uri.file(originalPath);
	const rightUri = vscode.Uri.file(tempPath);

	await vscode.commands.executeCommand(
		"vscode.diff",
		leftUri,
		rightUri,
		`Review AI: ${fileName}`
	);
}

function getPrompt(fileName: string, forensic: string, code: string): string {
	return `
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
${forensic}

SOURCE CODE for '${fileName}':
${code}
`;
}
