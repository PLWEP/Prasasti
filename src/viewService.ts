import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as util from "util";

const execAsync = util.promisify(cp.exec);
const HEADER_REGEX = /--\s+(\d{6})\s+\w+/;

export enum DocStatus {
	SUCCESS,
	OUTDATED,
	NO_HEADER,
	UNKNOWN,
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
	cacheState: vscode.Memento
): Promise<AuditResult> {
	try {
		const { stdout } = await execAsync(
			`git log -1 --format='%H|%ad' --date=format:'%y%m%d' -- "${filePath}"`,
			{ cwd: workspaceRoot }
		);

		const output = stdout ? stdout.trim() : null;

		if (!output) {
			return {
				status: DocStatus.UNKNOWN,
				reason: "File not committed yet",
			};
		}

		const [currentHash, gitDateStr] = output.split("|");

		const cacheKey = `prasasti.cache.${filePath}`;
		const cachedData = cacheState.get<FileCache>(cacheKey);

		if (cachedData && cachedData.lastHash === currentHash) {
			return cachedData.result;
		}

		const buffer = Buffer.alloc(512);
		const fd = fs.openSync(filePath, "r");
		fs.readSync(fd, buffer, 0, 512, 0);
		fs.closeSync(fd);

		const contentSnippet = buffer.toString("utf8");
		const match = contentSnippet.match(HEADER_REGEX);
		const headerDateStr = match ? match[1] : "000000";

		const gitDateInt = parseInt(gitDateStr) || 0;
		const headerDateInt = parseInt(headerDateStr) || 0;

		let result: AuditResult;

		if (headerDateStr === "000000") {
			result = {
				status: DocStatus.NO_HEADER,
				reason: "Missing IFS Header format (-- YYMMDD Sign)",
			};
		} else if (headerDateInt >= gitDateInt) {
			result = {
				status: DocStatus.SUCCESS,
				reason: "Up to date",
			};
		} else {
			result = {
				status: DocStatus.OUTDATED,
				reason: `Outdated (Head: ${headerDateInt} < Git: ${gitDateInt})`,
			};
		}

		cacheState.update(cacheKey, { lastHash: currentHash, result: result });
		return result;
	} catch (e: any) {
		return { status: DocStatus.UNKNOWN, reason: `Error: ${e.message}` };
	}
}
