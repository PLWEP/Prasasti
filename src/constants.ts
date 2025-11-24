export const COMMANDS = {
	REFRESH: "prasasti.refresh",
	GENERATE_ALL: "prasasti.generateAll",
	GENERATE_SINGLE: "prasasti.generateSingle",
};

export const VIEWS = {
	PROBLEMS: "prasasti.problems",
};

export const CONFIG = {
	SECTION: "prasasti",
	KEYS: {
		API_KEY: "ai.apiKey",
		MODEL: "ai.model",
		INCLUDE: "files.include",
		SKIP_KEYWORDS: "files.gitSkipKeywords",
		AUTO_APPLY: "behavior.autoApply",
		RETRIES: "network.maxRetries",
	},
};

export const HEADER_REGEX = /--\s+(\d{6})\s+[\w\d]+/;

export const LINE_LIMIT_THRESHOLD = 600;
