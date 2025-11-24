import * as vscode from "vscode";
import { CONFIG } from "../constants";

export function getApiKey(): string | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
	return config.get<string>(CONFIG.KEYS.API_KEY);
}

export async function checkSettingsOnStartup() {
	const apiKey = getApiKey();
	if (!apiKey || apiKey.trim() === "") {
		promptToOpenSettings(
			"Prasasti: Please set your Gemini API Key to enable AI features."
		);
	}
}

export async function promptToOpenSettings(message: string) {
	const selection = await vscode.window.showWarningMessage(
		message,
		"Open Settings"
	);
	if (selection === "Open Settings") {
		vscode.commands.executeCommand(
			"workbench.action.openSettings",
			`@ext:${CONFIG.SECTION}`
		);
	}
}
