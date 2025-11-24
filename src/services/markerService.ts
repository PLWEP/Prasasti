import { Logger } from "../utils/logger";

interface ChangeBlock {
	startLine: number;
	endLine: number;
}

interface MarkerRange {
	start: number;
	end: number;
}

export class MarkerService {
	static validateMarkers(content: string, diffOutput: string): boolean {
		const changes = this.parseDiffToLineNumbers(diffOutput);
		if (changes.length === 0) {
			return true;
		}

		const existingMarkers = this.findExistingMarkerRanges(content);

		for (const change of changes) {
			const isCovered = existingMarkers.some(
				(marker) =>
					change.startLine >= marker.start &&
					change.endLine <= marker.end
			);
			if (!isCovered) {
				return false;
			}
		}
		return true;
	}

	static applyMarkers(
		originalContent: string,
		diffOutput: string,
		ticketId: string,
		sign: string
	): string {
		const lines = originalContent.split(/\r?\n/);
		const changes = this.parseDiffToLineNumbers(diffOutput);

		const mergedChanges = this.mergeNearbyChanges(changes, 3);
		Logger.info(
			`Applying ${mergedChanges.length} marker blocks.`,
			"MarkerService"
		);

		for (let i = mergedChanges.length - 1; i >= 0; i--) {
			const block = mergedChanges[i];
			if (block.startLine >= lines.length) {
				continue;
			}

			const currentLine = lines[block.startLine] || "";
			const indent = currentLine.match(/^\s*/)?.[0] || "";

			lines.splice(
				block.endLine + 1,
				0,
				`${indent}-- [${ticketId}] ${sign} End`
			);
			lines.splice(
				block.startLine,
				0,
				`${indent}-- [${ticketId}] ${sign} Start`
			);
		}

		return lines.join("\n");
	}

	private static findExistingMarkerRanges(content: string): MarkerRange[] {
		const lines = content.split(/\r?\n/);
		const ranges: MarkerRange[] = [];
		let currentStart = -1;
		const startRegex = /--\s+\[.*?\]\s+\w+\s+Start/i;
		const endRegex = /--\s+\[.*?\]\s+\w+\s+End/i;

		for (let i = 0; i < lines.length; i++) {
			if (startRegex.test(lines[i])) {
				currentStart = i;
			} else if (endRegex.test(lines[i])) {
				if (currentStart !== -1) {
					ranges.push({ start: currentStart, end: i });
					currentStart = -1;
				}
			}
		}
		return ranges;
	}

	private static parseDiffToLineNumbers(diff: string): ChangeBlock[] {
		const blocks: ChangeBlock[] = [];
		const diffLines = diff.split("\n");
		for (const line of diffLines) {
			const match = line.match(/^@@\s-[0-9,]+\s\+(\d+)(?:,(\d+))?\s@@/);
			if (match) {
				const startLine = parseInt(match[1], 10) - 1; // 0-based
				const count = match[2] ? parseInt(match[2], 10) : 1;
				if (count > 0) {
					blocks.push({ startLine, endLine: startLine + count - 1 });
				}
			}
		}
		return blocks;
	}

	private static mergeNearbyChanges(
		blocks: ChangeBlock[],
		tolerance: number
	): ChangeBlock[] {
		if (blocks.length === 0) {
			return [];
		}
		blocks.sort((a, b) => a.startLine - b.startLine);
		const merged: ChangeBlock[] = [];
		let current = blocks[0];
		for (let i = 1; i < blocks.length; i++) {
			const next = blocks[i];
			if (next.startLine - current.endLine <= tolerance) {
				current.endLine = Math.max(current.endLine, next.endLine);
			} else {
				merged.push(current);
				current = next;
			}
		}
		merged.push(current);
		return merged;
	}
}
