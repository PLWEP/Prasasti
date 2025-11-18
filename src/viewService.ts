import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

const HEADER_REGEX = /--\s+(\d{6})\s+\w+/;

export enum DocStatus {
	SUCCESS,
	OUTDATED,
	NO_HEADER,
	UNKNOWN,
	DIRTY_CODE,
}

export interface FileResult {
	status: DocStatus;
	reason: string;
}

interface FileCache {
	lastHash: string;
	result: FileResult;
}

function gitSpawn(args: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn("git", args, { cwd, shell: false });

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
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

		child.on("error", (err) => {
			reject(err);
		});
	});
}

export async function readedFile(
	filePath: string,
	workspaceRoot: string,
	cacheState: vscode.Memento,
	logger?: vscode.OutputChannel
): Promise<FileResult> {
	try {
		const output = await gitSpawn(
			[
				"log",
				"-1",
				"--format=%H|%ad",
				"--date=format:%y%m%d",
				"--",
				filePath,
			],
			workspaceRoot
		);

		if (!output) {
			return {
				status: DocStatus.UNKNOWN,
				reason: "No git history found (Untracked?)",
			};
		}

		const [currentHash, gitDateStr] = output.split("|");

		if (!gitDateStr || gitDateStr.length !== 6) {
			logger?.appendLine(
				`[WARN] ${path.basename(
					filePath
				)}: Invalid Git Date '${gitDateStr}'`
			);
		}

		const cacheKey = `prasasti.cache.${filePath}`;
		const cachedData = cacheState.get<FileCache>(cacheKey);

		if (cachedData && cachedData.lastHash === currentHash) {
			return cachedData.result;
		}

		const buffer = Buffer.alloc(1024);
		const fd = fs.openSync(filePath, "r");
		fs.readSync(fd, buffer, 0, 1024, 0);
		fs.closeSync(fd);

		const contentSnippet = buffer.toString("utf8");
		const match = contentSnippet.match(HEADER_REGEX);

		const headerDateStr = match ? match[1] : "000000";

		const gitDateInt = parseInt(gitDateStr) || 0;
		const headerDateInt = parseInt(headerDateStr) || 0;

		let result: FileResult;

		if (headerDateStr === "000000") {
			result = {
				status: DocStatus.NO_HEADER,
				reason: "Header Regex not matched",
			};
		} else if (headerDateInt >= gitDateInt) {
			result = { status: DocStatus.SUCCESS, reason: "Up to date" };
		} else {
			result = {
				status: DocStatus.OUTDATED,
				reason: `Header (${headerDateInt}) < Git (${gitDateInt})`,
			};

			logger?.appendLine(
				`[OUTDATED] ${path.basename(
					filePath
				)}: H=${headerDateInt} vs G=${gitDateInt}`
			);
		}

		cacheState.update(cacheKey, { lastHash: currentHash, result: result });
		return result;
	} catch (e: any) {
		return { status: DocStatus.UNKNOWN, reason: `Exception: ${e.message}` };
	}
}
