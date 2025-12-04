import { Uri } from "vscode";

export interface HistoryEntry {
	date: string;
	sign: string;
	id: string;
	desc: string;
}

export interface ChangeBlock {
	startLine: number;
	endLine: number;
}

export interface MarkerRange {
	start: number;
	end: number;
}

export interface FileResult {
	reason: string;
	resourceUri: Uri;
}

export interface CommitInfo {
	hash: string;
	date: string;
	author: string;
	type: "ADD" | "MOD";
}

export interface BlameInfo {
	hash?: string;
	blameAuthor?: string;
	content?: string;
}

export interface ListItem {
	resourceUri: Uri;
	label: string;
	reason: string;
	contextType: "marker" | "documentation";
}

export interface MarkerRule {
	filePattern: string;
	startRegex: string;
	skipKeywords?: string[];
	message?: string;
	color?: string;
}
