import * as cp from "child_process";
import { Logger } from "../utils/logger";

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
	"RETURN",
	"EXCEPTION",
	"FUNCTION",
	"PROCEDURE",
	"PRAGMA",
	"TYPE",
	"CONSTANT",
];

export class GitService {
	private static spawnAsync(args: string[], cwd: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const child = cp.spawn("git", args, { cwd, shell: false });
			let stdout = "",
				stderr = "";
			child.stdout.on("data", (d) => (stdout += d.toString()));
			child.stderr.on("data", (d) => (stderr += d.toString()));
			child.on("close", (code) =>
				code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr))
			);
			child.on("error", reject);
		});
	}

	static async getLog(
		filePath: string,
		root: string,
		limit = 20,
		sinceDate?: string
	): Promise<string | null> {
		const args = [
			"log",
			`-${limit}`,
			"--date=format:%y%m%d",
			"--pretty=format:%H|%ad|%an",
			"--",
			filePath,
		];
		if (sinceDate) {
			args.push(`--since=${sinceDate} 00:00:00`);
		}
		try {
			return await this.spawnAsync(args, root);
		} catch {
			return null;
		}
	}

	static async getDiff(
		filePath: string,
		root: string,
		hash?: string
	): Promise<string> {
		const args = hash
			? ["show", "--format=", "-U0", hash, "--", filePath]
			: ["diff", "-U0", "HEAD", "--", filePath];
		try {
			return await this.spawnAsync(args, root);
		} catch {
			return "";
		}
	}

	static async getWorkingDiff(
		filePath: string,
		root: string
	): Promise<string> {
		const args = ["diff", "-U0", "HEAD", "--", filePath];
		try {
			return await this.spawnAsync(args, root);
		} catch {
			return "";
		}
	}

	static async getLastCommitDiff(
		filePath: string,
		root: string
	): Promise<string> {
		const args = ["show", "--format=", "-U0", "HEAD", "--", filePath];
		try {
			return await this.spawnAsync(args, root);
		} catch {
			return "";
		}
	}

	static hasLogicChanges(diffText: string): boolean {
		const lines = diffText.split("\n");
		const structRegex = new RegExp(
			`^\\s*(${STRUCTURAL_KEYWORDS.join("|")})(\\s|;|$|\\()`,
			"i"
		);
		for (const line of lines) {
			if (line.match(/^(---|(\+\+\+)|index|@@)/)) {
				continue;
			}
			if (!line.startsWith("+") && !line.startsWith("-")) {
				continue;
			}
			const content = line.substring(1).trim();
			if (!content || content.startsWith("--")) {
				continue;
			}
			if (content.match(structRegex)) {
				continue;
			}
			return true;
		}
		return false;
	}
}
