export const COMMANDS = {
	REFRESH: "prasasti.refresh",
	GENERATE_ALL_DOCS: "prasasti.generateAll",
	GENERATE_SINGLE_DOC: "prasasti.generateSingle",
	GENERATE_MARKERS: "prasasti.generateMarkers",
	GENERATE_MARKER: "prasasti.generateMarker",
};

export const VIEWS = {
	PROBLEMS: "prasasti.problems",
};

export const CONFIG = {
	SECTION: "prasasti",
	KEYS: {
		API_KEY: "ai.apiKey",
		MODEL: "ai.model",
		INCLUDE_DOCS: "files.include",
		INCLUDE_MARKERS: "files.includeMarkers",
		SKIP_KEYWORDS: "files.gitSkipKeywords",
		AUTO_APPLY: "behavior.autoApply",
		RETRIES: "network.maxRetries",
		MARKER_SCAN: "behavior.markersScan",
	},
};

export const HEADER_REGEX = /--\s+(\d{6})\s+[\w\d]+/;
export const LINE_LIMIT_THRESHOLD = 600;
export const CODE_SEPARATOR = "layer Cust;";
export const MARKER_REGEX = /--\s*(?:20)?(\d{6})/g;
export const CODE_SEPARATOR_REGEX = /layer\s+\w+\s*;/i;
export const OLD_MARKER_REGEX =
	/--\s*(?:Start|End)?\s*\[(?:ADD|MOD)-\d{6}-\d+\]\s*[\w\s]+/i;
