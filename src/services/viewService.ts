import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../utils/logger";

const HEADER_REGEX = /--\s+(\d{6})\s+[\w\d]+/;
const CACHE_PREFIX = "prasasti.cache.";
const BYTES_TO_READ = 8192;

const STRUCTURAL_KEYWORDS = [
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
	"PRAGMA",
];

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

export async function readedFile(
	filePath: string,
	workspaceRoot: string,
	cacheState: vscode.Memento,
	_logger?: vscode.OutputChannel,
	skipKeywords: string[] = []
): Promise<AuditResult> {
	try {
		const fileName = path.basename(filePath);

		const isDirty = await isGitDirty(filePath, workspaceRoot);
		if (isDirty) {
			const dirtyHasLogic = await hasLogicChanges(
				filePath,
				workspaceRoot,
				true
			);
			if (dirtyHasLogic) {
				return {
					status: DocStatus.DIRTY_CODE,
					reason: "Unsaved Logic Changes",
				};
			}
			return {
				status: DocStatus.SUCCESS,
				reason: "Writing docs (Dirty)...",
			};
		}

		const gitInfo = await getLastCommitInfo(filePath, workspaceRoot);
		if (!gitInfo) {
			return { status: DocStatus.UNKNOWN, reason: "Untracked file" };
		}

		const cacheKey = `${CACHE_PREFIX}${filePath}`;
		const cachedData = cacheState.get<FileCache>(cacheKey);
		if (cachedData && cachedData.lastHash === gitInfo.hash) {
			return cachedData.result;
		}

		const headerDate = getHeaderDate(filePath);
		if (!headerDate) {
			return {
				status: DocStatus.NO_HEADER,
				reason: "Header Regex not matched",
			};
		}

		const gitDateInt = parseInt(gitInfo.date) || 0;
		const headerDateInt = parseInt(headerDate) || 0;

		let result: AuditResult;

		if (headerDateInt >= gitDateInt) {
			result = { status: DocStatus.SUCCESS, reason: "Up to date" };
		} else {
			const isIgnored = await shouldIgnoreCommit(
				gitInfo,
				filePath,
				workspaceRoot,
				skipKeywords
			);

			if (isIgnored) {
				result = {
					status: DocStatus.SUCCESS,
					reason: "Skipped: Docs-only update or ignored keyword.",
				};
				Logger.info(`[SKIP] ${fileName} deemed safe.`, "ViewService");
			} else {
				result = {
					status: DocStatus.OUTDATED,
					reason: `Outdated (Head:${headerDateInt} < Git:${gitDateInt})`,
				};
			}
		}

		cacheState.update(cacheKey, {
			lastHash: gitInfo.hash,
			result: result,
		});

		return result;
	} catch (e: any) {
		return { status: DocStatus.UNKNOWN, reason: `Error: ${e.message}` };
	}
}

async function isGitDirty(filePath: string, root: string): Promise<boolean> {
	try {
		await gitSpawn(["diff", "--quiet", "HEAD", "--", filePath], root);
		return false;
	} catch (err: any) {
		return err.code === 1;
	}
}

async function getLastCommitInfo(filePath: string, root: string) {
	const output = await gitSpawn(
		[
			"log",
			"-1",
			"--format=%H%%%ad%%%s",
			"--date=format:%y%m%d",
			"--",
			filePath,
		],
		root
	);

	if (!output) {
		return null;
	}

	const [hash, date, subject] = output.split("%%%");
	return { hash, date, subject };
}

function getHeaderDate(filePath: string): string | null {
	try {
		const buffer = Buffer.alloc(BYTES_TO_READ);
		const fd = fs.openSync(filePath, "r");
		const bytesRead = fs.readSync(fd, buffer, 0, BYTES_TO_READ, 0);
		fs.closeSync(fd);

		const content = buffer.slice(0, bytesRead).toString("utf8");
		const match = content.match(HEADER_REGEX);
		return match ? match[1] : null;
	} catch (e) {
		return null;
	}
}

async function shouldIgnoreCommit(
	gitInfo: { hash: string; subject: string },
	filePath: string,
	root: string,
	skipKeywords: string[]
): Promise<boolean> {
	const subjectUpper = gitInfo.subject.toUpperCase();
	if (skipKeywords.some((k) => subjectUpper.includes(k.toUpperCase()))) {
		return true;
	}

	const isLogicChange = await hasLogicChanges(
		filePath,
		root,
		false,
		gitInfo.hash
	);
	return !isLogicChange;
}

async function hasLogicChanges(
	filePath: string,
	root: string,
	isDirtyMode: boolean,
	commitHash?: string
): Promise<boolean> {
	try {
		const args = isDirtyMode
			? ["diff", "-U0", "HEAD", "--", filePath]
			: ["show", "--format=", "-U0", commitHash!, "--", filePath];

		const diffOutput = await gitSpawn(args, root);
		return parseDiffForLogic(diffOutput);
	} catch (e) {
		return true;
	}
}

function parseDiffForLogic(diffText: string): boolean {
	const lines = diffText.split("\n");
	const structRegex = new RegExp(
		`^\\s*(${STRUCTURAL_KEYWORDS.join("|")})(\\s|;|$|\\()`,
		"i"
	);

	for (const line of lines) {
		if (line.match(/^(---|(\+\+\+)|index|@@)/)) {
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

			if (content.match(structRegex)) {
				continue;
			}

			return true;
		}
	}
	return false;
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

		child.on("error", reject);
	});
}
