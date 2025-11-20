import * as vscode from "vscode";

export class Logger {
	private static _outputChannel: vscode.OutputChannel;

	public static get channel(): vscode.OutputChannel {
		if (!this._outputChannel) {
			this._outputChannel =
				vscode.window.createOutputChannel("Prasasti Debug");
		}
		return this._outputChannel;
	}

	public static info(message: string, component: string = "General") {
		this.log("INFO", component, message);
	}

	public static error(
		message: string,
		component: string = "General",
		error?: any
	) {
		const errMsg = error instanceof Error ? error.message : String(error);
		this.log("ERROR", component, `${message} | Details: ${errMsg}`);
	}

	public static warn(message: string, component: string = "General") {
		this.log("WARN", component, message);
	}

	private static log(level: string, component: string, message: string) {
		const time = new Date().toLocaleTimeString();
		this.channel.appendLine(
			`[${time}] [${component}] [${level}] ${message}`
		);
	}
}
