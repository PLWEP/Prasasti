import { HistoryEntry } from "../utils/interfaces";

export class PatchService {
	static applyHeaderPatch(
		originalContent: string,
		newEntries: HistoryEntry[]
	): string {
		if (!newEntries || newEntries.length === 0) {
			return originalContent;
		}

		const historyBlockRegex =
			/(--\s+Date\s+Sign\s+History\r?\n--\s+-{2,}\s+-{2,}\s+-{5,}.*\r?\n)([\s\S]*?)(-{60,})/;
		const match = originalContent.match(historyBlockRegex);

		if (match) {
			const headerPrefix = match[1];
			const oldHistoryText = match[2];
			const footer = match[3];

			const existingEntries = this.parseExistingHistory(oldHistoryText);
			const allEntries = [...existingEntries, ...newEntries];
			const finalEntries = this.processEntries(allEntries);

			const newHistoryBlock = finalEntries
				.map((e) => this.formatLine(e))
				.join("\n");
			return originalContent.replace(
				historyBlockRegex,
				`${headerPrefix}${newHistoryBlock}\n${footer}`
			);
		}

		return this.simpleInjection(originalContent, newEntries);
	}

	private static parseExistingHistory(textBlock: string): HistoryEntry[] {
		const entries: HistoryEntry[] = [];
		const lines = textBlock.split("\n");
		const lineRegex = /--\s+(\d{6})\s+(\w+)\s+(.*)/;

		for (const line of lines) {
			const cleanLine = line.trim();
			if (!cleanLine.startsWith("--")) {
				continue;
			}
			const m = cleanLine.match(lineRegex);
			if (m) {
				const rawRest = m[3].trim();
				let id = "Patch";
				let desc = rawRest;

				const bracketMatch = rawRest.match(/^\[([^\]]+)\]\s*(.*)/);
				if (bracketMatch) {
					id = bracketMatch[1];
					desc = bracketMatch[2];
				} else {
					const spaceMatch = rawRest.match(/^([A-Z0-9\-]+)\s+(.*)/);
					if (spaceMatch) {
						id = spaceMatch[1];
						desc = spaceMatch[2];
					}
				}
				entries.push({ date: m[1], sign: m[2], id, desc });
			}
		}
		return entries;
	}

	private static processEntries(entries: HistoryEntry[]): HistoryEntry[] {
		const uniqueMap = new Map<string, HistoryEntry>();
		entries.forEach((e) => {
			const cleanId = e.id.replace(/[\[\]]/g, "").trim();
			const cleanDate = e.date.trim();
			const key = `${cleanDate}-${cleanId}`;

			if (uniqueMap.has(key)) {
				if (e.desc.length > uniqueMap.get(key)!.desc.length) {
					uniqueMap.set(key, { ...e, id: cleanId });
				}
			} else {
				uniqueMap.set(key, { ...e, id: cleanId });
			}
		});

		return Array.from(uniqueMap.values()).sort((a, b) =>
			b.date.localeCompare(a.date)
		);
	}

	private static formatLine(e: HistoryEntry): string {
		return `--  ${e.date}  ${e.sign.padEnd(6)}  [${e.id}] ${e.desc}`;
	}

	private static simpleInjection(
		content: string,
		entries: HistoryEntry[]
	): string {
		entries.forEach((e) => (e.id = e.id.replace(/[\[\]]/g, "")));
		const newLines = entries.map((e) => this.formatLine(e)).join("\n");
		const separatorRegex = /(--\s+-{2,}\s+-{2,}\s+-{5,}.*)(\r?\n)/;
		if (separatorRegex.test(content)) {
			return content.replace(separatorRegex, `$1$2${newLines}$2`);
		}
		return content;
	}
}
