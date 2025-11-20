import * as cp from "child_process";
import * as util from "util";
import { Logger } from "../utils/logger";

const execAsync = util.promisify(cp.exec);
const spawnAsync = (args: string[], cwd: string): Promise<string> => {
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
};

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
];

export class GitService {
	static async getLog(
		filePath: string,
		root: string,
		limit = 1,
		sinceDate?: string
	) {
		const args = [
			"log",
			`-${limit}`,
			"--date=format:%y%m%d",
			"--pretty=format:%H|%ad|%an|%s",
			"--",
			filePath,
		];
		if (sinceDate) {
			args.push(`--since=${sinceDate}`);
		}

		try {
			return await spawnAsync(args, root);
		} catch (e) {
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
			return await spawnAsync(args, root);
		} catch (e) {
			Logger.error("Git Diff failed", "GitService", e);
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

	static async isDirty(filePath: string, root: string): Promise<boolean> {
		try {
			await spawnAsync(["diff", "--quiet", "HEAD", "--", filePath], root);
			return false;
		} catch {
			return true;
		}
	}
}
