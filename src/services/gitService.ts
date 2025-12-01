import * as cp from "child_process";
import { CommitInfo, BlameInfo } from "../utils/interfaces";

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

	static async getUncommitFile(root: string): Promise<string[]> {
		const args = ["status", "-s"];

		try {
			const output = await this.spawnAsync(args, root);
			const files = output
				.split("\n")
				.map((line) => {
					const i = line.lastIndexOf("/");
					return i >= 0 ? line.slice(i + 1) : line;
				})
				.filter((line) => line.trim() !== "");
			return [...new Set(files)];
		} catch {
			return [];
		}
	}

	static async getMarkerDate(
		filePath: string,
		root: string,
		skip: string[],
		maxDate?: string
	): Promise<string[]> {
		const fullArgs = [
			"log",
			"--date=format:%y%m%d",
			"--pretty=format:%ad|%s",
			"--",
			filePath,
		];

		const maxArgs = [
			"log",
			`--after=${maxDate?.replace(
				/^(\d{2})(\d{2})(\d{2})$/,
				"20$1-$2-$3"
			)}`,
			"--date=format:%y%m%d",
			"--pretty=format:%ad|%s",
			"--",
			filePath,
		];

		try {
			const output = await this.spawnAsync(
				maxDate ? maxArgs : fullArgs,
				root
			);
			const dates = output
				.split("\n")
				.filter((line) => line.trim() !== "")
				.filter((line) => !skip.some((word) => line.includes(word)))
				.map((line) => line.split("|")[0].trim());
			return [...new Set(dates)];
		} catch {
			return [];
		}
	}

	static async getMarkerDiff(
		filePath: string,
		root: string,
		skip: string[],
		maxDate?: string
	): Promise<CommitInfo[]> {
		const fullArgs = [
			"log",
			"--date=short",
			"--pretty=format:[COMMIT]|%H|%ad|%an|%s",
			"--name-status",
			"--",
			filePath,
		];

		const maxArgs = [...fullArgs];
		if (maxDate) {
			const formattedDate = maxDate.replace(
				/^(\d{2})(\d{2})(\d{2})$/,
				"20$1-$2-$3"
			);
			maxArgs.splice(1, 0, `--after=${formattedDate}`);
		}

		try {
			const rawOutput = await this.spawnAsync(
				maxDate ? maxArgs : fullArgs,
				root
			);

			const logBlocks = rawOutput
				.split("[COMMIT]|")
				.filter((b) => b.trim() !== "");

			const parsedCommits: CommitInfo[] = [];

			for (const block of logBlocks) {
				const lines = block.trim().split("\n");
				const header = lines[0].split("|");

				const statusLine = lines.find(
					(l) => l.startsWith("A\t") || l.startsWith("M\t")
				);

				if (header.length < 4) {
					continue;
				}

				const [hash, date, author, msg] = header;

				if (skip.some((s) => msg.includes(s))) {
					continue;
				}

				let type: "ADD" | "MOD" = "MOD";
				if (statusLine && statusLine.startsWith("A")) {
					type = "ADD";
				}

				parsedCommits.push({ hash, date, author, type });
			}

			return parsedCommits.reverse();
		} catch {
			return [];
		}
	}

	static async getMarkerBlame(
		filePath: string,
		root: string
	): Promise<BlameInfo[]> {
		const args = ["blame", "--line-porcelain", "-w", filePath];

		try {
			const blameOutput = await this.spawnAsync(args, root);
			const blameLinesRaw = blameOutput.split("\n");

			const blameData: BlameInfo[] = [];
			let currentInfo: BlameInfo = {};

			for (const line of blameLinesRaw) {
				if (/^[0-9a-f]{40}/.test(line)) {
					currentInfo = { hash: line.split(" ")[0] };
				} else if (line.startsWith("author ")) {
					currentInfo.blameAuthor = line.substring(7).trim();
				} else if (line.startsWith("\t")) {
					currentInfo.content = line.substring(1);
					blameData.push({ ...currentInfo });
				}
			}
			return blameData;
		} catch {
			return [];
		}
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

	static async getCumulativeDiff(
		filePath: string,
		root: string,
		sinceDate: string
	): Promise<string> {
		const args = [
			"diff",
			`-U0`,
			`--since=${sinceDate} 00:00:00`,
			"HEAD",
			"--",
			filePath,
		];
		try {
			return await this.spawnAsync(args, root);
		} catch {
			return "";
		}
	}

	static hasLogicChanges(diffText: string): boolean {
		const lines = diffText.split("\n");
		for (const line of lines) {
			if (line.match(/^(---|(\+\+\+)|index|@@)/)) {
				continue;
			}

			if (!line.startsWith("+") && !line.startsWith("-")) {
				continue;
			}

			const content = line.substring(1).trim();
			if (content.length === 0) {
				continue;
			}

			if (
				content.startsWith("--") ||
				content.startsWith("//") ||
				content.startsWith("/*")
			) {
				continue;
			}
			return true;
		}
		return false;
	}
}
