import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as cp from "child_process";
import * as util from "util";
import * as path from "path";
import * as os from "os";

const execAsync = util.promisify(cp.exec);

export async function runAiScriptForFile(
	filePath: string,
	workspaceRoot: string,
	apiKey: string
): Promise<void> {
	const config = vscode.workspace.getConfiguration("prasasti");
	const model = config.get<string>("geminiModel") || "gemini-2.5-flash";
	const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
	const headers = {
		"x-goog-api-key": apiKey,
		"Content-Type": "application/json",
	};

	let originalContent = "";
	try {
		originalContent = await fs.readFile(filePath, "utf8");
	} catch (e) {
		throw new Error("Could not read file content.");
	}

	const headerMatch = originalContent.match(/--\s+(\d{6})\s+\w+/);

	let gitCommand = `git log -n 20 --date=format:'%y%m%d' --pretty=format:"%H|%ad|%an" -- "${filePath}"`;

	if (headerMatch) {
		const lastDocDate = headerMatch[1];

		const isoDate = `20${lastDocDate.substring(
			0,
			2
		)}-${lastDocDate.substring(2, 4)}-${lastDocDate.substring(4, 6)}`;

		console.log(
			`[Prasasti] Found last doc date: ${isoDate}. Fetching incremental updates...`
		);
		gitCommand = `git log --since="${isoDate} 00:00:00" --date=format:'%y%m%d' --pretty=format:"%H|%ad|%an" -- "${filePath}"`;
	}

	let commitsRaw: string;
	try {
		const { stdout } = await execAsync(gitCommand, { cwd: workspaceRoot });
		commitsRaw = stdout.trim();
	} catch (e) {
		return;
	}

	if (!commitsRaw) {
		vscode.window.showInformationMessage(
			"No new commits found since the last documentation date."
		);
		return;
	}

	const commits = commitsRaw.split("\n");
	let forensicData = "";

	const commitsToProcess = commits.slice(0, 10);

	for (const commitLine of commitsToProcess) {
		const parts = commitLine.split("|");
		if (parts.length < 3) {
			continue;
		}

		const hash = parts[0];
		const date = parts[1];
		const author = parts[2];

		try {
			const { stdout } = await execAsync(
				`git show --no-color --oneline ${hash} -- "${filePath}"`,
				{ cwd: workspaceRoot, maxBuffer: 1024 * 1024 * 5 }
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

	const fileName = path.basename(filePath);

	const promptText = getPrompt(fileName, forensicData, originalContent);

	const newContent = await callGeminiWithRetry(
		apiUrl,
		headers,
		promptText,
		fileName
	);

	if (newContent) {
		const cleanContent = newContent
			.replace(/^```sql\s*/, "")
			.replace(/```$/, "");

		const autoApply = config.get<boolean>("autoApply");
		if (autoApply) {
			await fs.writeFile(filePath, cleanContent, "utf8");
		} else {
			await showDiffPreview(filePath, cleanContent);
		}
	} else {
		throw new Error(`Gemini API failed for ${fileName}`);
	}
}

async function showDiffPreview(originalPath: string, newContent: string) {
	const fileName = path.basename(originalPath);
	const tempPath = path.join(os.tmpdir(), `prasasti_new_${fileName}`);
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

async function callGeminiWithRetry(
	url: string,
	headers: any,
	prompt: string,
	fileName: string
): Promise<string | null> {
	const config = vscode.workspace.getConfiguration("prasasti");
	const maxRetries = config.get<number>("maxRetries") || 3;
	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: headers,
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: { temperature: 0.2 },
				}),
			});

			if (response.status === 429) {
				attempt++;
				const delay = Math.pow(2, attempt) * 1000;
				console.warn(
					`Rate limit hit for ${fileName}. Retrying in ${delay}ms...`
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const result: any = await response.json();
			return result.candidates[0].content.parts[0].text;
		} catch (e) {
			attempt++;
			if (attempt >= maxRetries) {
				return null;
			}
		}
	}
	return null;
}

function getPrompt(fileName: string, forensic: string, code: string): string {
	const template = `
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
6. DONT REMOVE $ IN THE CODE. ($SEARCH, $TEXTSEARCH, $APPEND, $', ETC.)
7. DONT ADD PROMPT IN THE VIEW.

FORENSIC GIT HISTORY for '{{FILENAME}}':
{{FORENSIC_DATA}}

SOURCE CODE for '{{FILENAME}}':
{{SOURCE_CODE}}
`;

	return template
		.replace("{{FILENAME}}", fileName)
		.replace("{{FORENSIC_DATA}}", forensic)
		.replace("{{SOURCE_CODE}}", code);
}
