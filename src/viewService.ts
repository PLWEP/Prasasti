import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

const HEADER_REGEX = /--\s+(\d{6})\s+[\w\d]+/;

export enum DocStatus {
	SUCCESS,
	OUTDATED,
	NO_HEADER,
	UNKNOWN,
	DIRTY_CODE,
}

export interface AuditResult {
	status: DocStatus;
	reason: string;
}

interface FileCache {
	lastHash: string;
	result: AuditResult;
}

function gitSpawn(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn("git", args, { cwd, shell: false });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				const err: any = new Error(stderr || "Git command failed");
				err.code = code;
				reject(err);
			}
		});
		child.on("error", (err) => reject(err));
	});
}

export async function readedFile(
	filePath: string,
	workspaceRoot: string,
	cacheState: vscode.Memento,
	logger?: vscode.OutputChannel,
	skipKeywords?: string[]
): Promise<AuditResult> {
	try {
		let isDirty = false;
		try {
			await gitSpawn(
				["diff", "--quiet", "HEAD", "--", filePath],
				workspaceRoot
			);
		} catch (err: any) {
			if (err.code === 1) {
				isDirty = true;
				const dirtyIsCode = await checkDiffIsCode(
					filePath,
					workspaceRoot,
					true
				);
				if (dirtyIsCode) {
					return {
						status: DocStatus.DIRTY_CODE,
						reason: "Unsaved Logic Changes",
					};
				} else {
					return {
						status: DocStatus.SUCCESS,
						reason: "Writing docs...",
					};
				}
			}
		}

		const output = await gitSpawn(
			[
				"log",
				"-1",
				"--format=%H|%ad|%s",
				"--date=format:%y%m%d",
				"--",
				filePath,
			],
			workspaceRoot
		);

		if (!output) {
			return { status: DocStatus.UNKNOWN, reason: "Untracked file" };
		}

		const [currentHash, gitDateStr, commitSubject] = output.split("|");

		const cacheKey = `prasasti.cache.${filePath}`;
		if (!isDirty) {
			const cachedData = cacheState.get<FileCache>(cacheKey);
			if (cachedData && cachedData.lastHash === currentHash) {
				return cachedData.result;
			}
		}

		const buffer = Buffer.alloc(8192);
		const fd = fs.openSync(filePath, "r");
		const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
		fs.closeSync(fd);

		const contentSnippet = buffer.slice(0, bytesRead).toString("utf8");
		const match = contentSnippet.match(HEADER_REGEX);

		const headerDateStr = match ? match[1] : "000000";
		const gitDateInt = parseInt(gitDateStr) || 0;
		const headerDateInt = parseInt(headerDateStr) || 0;

		let result: AuditResult;

		if (headerDateStr === "000000") {
			result = {
				status: DocStatus.NO_HEADER,
				reason: "Header Regex not matched",
			};
		} else if (headerDateInt >= gitDateInt) {
			result = { status: DocStatus.SUCCESS, reason: "Up to date" };
		} else {
			let shouldSkip = false;
			const subjectUpper = commitSubject
				? commitSubject.toUpperCase()
				: "";

			if (skipKeywords && skipKeywords.length > 0) {
				shouldSkip = skipKeywords.some((keyword) =>
					subjectUpper.includes(keyword.toUpperCase())
				);
			}

			if (shouldSkip) {
				result = {
					status: DocStatus.SUCCESS,
					reason: `Skipped by commit message: ${commitSubject}`,
				};
				logger?.appendLine(
					`[SKIP-MSG] ${path.basename(
						filePath
					)} skipped due to keyword in commit.`
				);
			} else {
				const isJustDocs = await checkLastCommitIsDocsOnly(
					currentHash,
					filePath,
					workspaceRoot
				);

				if (isJustDocs) {
					result = {
						status: DocStatus.SUCCESS,
						reason: "Latest commit was internal docs update only",
					};
				} else {
					result = {
						status: DocStatus.OUTDATED,
						reason: `Outdated (H:${headerDateInt} < G:${gitDateInt})`,
					};
				}
			}
		}

		if (!isDirty) {
			cacheState.update(cacheKey, {
				lastHash: currentHash,
				result: result,
			});
		}

		return result;
	} catch (e: any) {
		return { status: DocStatus.UNKNOWN, reason: `Exception: ${e.message}` };
	}
}

async function checkDiffIsCode(
	filePath: string,
	root: string,
	isDirtyCheck: boolean
): Promise<boolean> {
	try {
		const args = isDirtyCheck
			? ["diff", "-U0", "HEAD", "--", filePath]
			: ["show", "--format=", "-U0", "HEAD", "--", filePath];

		const stdout = await gitSpawn(args, root);
		return parseDiffForCode(stdout);
	} catch (e) {
		return true;
	}
}

async function checkLastCommitIsDocsOnly(
	hash: string,
	filePath: string,
	root: string
): Promise<boolean> {
	try {
		const stdout = await gitSpawn(
			["show", "--format=", "-U0", hash, "--", filePath],
			root
		);

		const hasCodeChange = parseDiffForCode(stdout);
		return !hasCodeChange;
	} catch (e) {
		return false;
	}
}

function parseDiffForCode(diffText: string): boolean {
	const lines = diffText.split("\n");

	const SAFE_KEYWORDS = [
		"CURSOR",
		"IS",
		"BEGIN",
		"END",
		"IF",
		"THEN",
		"ELSE",
		"ELSIF",
		"FOR",
		"LOOP",
		"NULL",
		"RETURN",
		"EXCEPTION",
		"WHEN",
		"FUNCTION",
		"PROCEDURE",
		"AS",
		"CONSTANT",
		"TYPE",
	];

	const structuralRegex = new RegExp(
		`^\\s*(${SAFE_KEYWORDS.join("|")})(\\s|;|$|\\()`,
		"i"
	);

	for (const line of lines) {
		if (
			line.startsWith("---") ||
			line.startsWith("+++") ||
			line.startsWith("index") ||
			line.startsWith("@@")
		) {
			continue;
		}

		if (line.startsWith("+") || line.startsWith("-")) {
			const content = line.substring(1).trim();

			if (content.length === 0) {
				continue;
			}

			if (content.startsWith("--")) {
				continue;
			}

			if (content.match(structuralRegex)) {
				continue;
			}

			return true;
		}
	}

	return false;
}
