import { Logger } from "../utils/logger";

export interface HistoryEntry {
	date: string;
	sign: string;
	id: string;
	desc: string;
}

export class PatchService {
	static applyHeaderPatch(
		originalContent: string,
		entries: HistoryEntry[]
	): string {
		if (!entries || entries.length === 0) {
			return originalContent;
		}

		const uniqueEntries = entries.filter((entry) => {
			const exists = this.checkIfEntryExists(originalContent, entry);
			if (exists) {
				Logger.info(
					`Skipping duplicate history: [${entry.id}]`,
					"PatchService"
				);
			}
			return !exists;
		});

		if (uniqueEntries.length === 0) {
			Logger.info("All entries exist. No patch needed.", "PatchService");
			return originalContent;
		}

		const newLinesBlock = uniqueEntries
			.map((h) => {
				const d = h.date || "000000";
				const s = (h.sign || "AI").trim().padEnd(6);
				const i = h.id || "Patch";
				const desc = h.desc || "Update";
				return `--  ${d}  ${s}  [${i}] ${desc}`;
			})
			.join("\n");

		const separatorRegex = /(--\s+-{2,}\s+-{2,}\s+-{5,}.*)(\r?\n)/;
		if (separatorRegex.test(originalContent)) {
			return originalContent.replace(
				separatorRegex,
				`$1$2${newLinesBlock}$2`
			);
		}

		const historyLabelRegex = /(--\s+Date\s+Sign\s+History.*)(\r?\n)/i;
		if (historyLabelRegex.test(originalContent)) {
			return originalContent.replace(
				historyLabelRegex,
				`$1$2${newLinesBlock}$2`
			);
		}

		Logger.warn("Header pattern not found. Patch skipped.", "PatchService");
		return originalContent;
	}

	private static checkIfEntryExists(
		content: string,
		entry: HistoryEntry
	): boolean {
		const cleanID = entry.id.replace(/[\[\]]/g, "");
		const regex = new RegExp(
			`--\\s+${entry.date}\\s+.*\\s+\\[?${cleanID}\\]?`,
			"i"
		);
		return regex.test(content);
	}
}
