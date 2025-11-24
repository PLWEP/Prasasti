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
	private static MARKER_REGEX = /^\s*--\s+\[.*?\]\s+\w+\s+(Start|End)/i;

	static validateMarkers(content: string, diffOutput: string): boolean {
		const lines = content.split(/\r?\n/);

		const changes = this.parseDiffToLineNumbers(diffOutput).filter(
			(block) => !this.isInsideHeaderOrComment(lines, block)
		);

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

	static ensureMarkers(
		originalContent: string,
		diffOutput: string,
		ticketId: string,
		sign: string
	): string {
		const lines = originalContent.split(/\r?\n/);
		const rawChanges = this.parseDiffToLineNumbers(diffOutput);

		if (rawChanges.length === 0) {
			return originalContent;
		}

		const validChanges = rawChanges.filter(
			(block) => !this.isInsideHeaderOrComment(lines, block)
		);

		const changes = this.mergeNearbyChanges(validChanges, 2);

		Logger.info(
			`Processing ${changes.length} logic blocks for markers.`,
			"MarkerService"
		);

		for (let i = changes.length - 1; i >= 0; i--) {
			const block = changes[i];

			if (this.hasValidMarkers(lines, block)) {
				continue;
			}

			this.applyMarkerBlock(lines, block, ticketId, sign);
		}

		return lines.join("\n");
	}

	private static isInsideHeaderOrComment(
		lines: string[],
		block: ChangeBlock
	): boolean {
		const firstLine = lines[block.startLine];
		if (!firstLine) {
			return false;
		}

		if (firstLine.trim().startsWith("--")) {
			return true;
		}
		return false;
	}

	private static hasValidMarkers(
		lines: string[],
		block: ChangeBlock
	): boolean {
		const lineBeforeIndex = block.startLine - 1;
		const lineAfterIndex = block.endLine + 1;
		if (lineBeforeIndex < 0 || lineAfterIndex >= lines.length) {
			return false;
		}
		const lineBefore = lines[lineBeforeIndex];
		const lineAfter = lines[lineAfterIndex];
		return (
			this.MARKER_REGEX.test(lineBefore) &&
			/Start/i.test(lineBefore) &&
			this.MARKER_REGEX.test(lineAfter) &&
			/End/i.test(lineAfter)
		);
	}

	private static applyMarkerBlock(
		lines: string[],
		block: ChangeBlock,
		ticketId: string,
		sign: string
	) {
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

	private static findExistingMarkerRanges(content: string): MarkerRange[] {
		const lines = content.split(/\r?\n/);
		const ranges: MarkerRange[] = [];
		let currentStart = -1;
		const startRegex = /--\s+\[.*?\]\s+\w+\s+Start/i;
		const endRegex = /--\s+\[.*?\]\s+\w+\s+End/i;
		for (let i = 0; i < lines.length; i++) {
			if (startRegex.test(lines[i])) {
				currentStart = i;
			} else if (endRegex.test(lines[i]) && currentStart !== -1) {
				ranges.push({ start: currentStart, end: i });
				currentStart = -1;
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
				const startLine = parseInt(match[1], 10) - 1;
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
