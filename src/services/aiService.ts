import * as vscode from "vscode";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";

export class AiService {
	static async generateDocs(
		prompt: string,
		apiKey: string,
		isJsonMode: boolean = false
	): Promise<string | null> {
		const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
		const model =
			config.get<string>(CONFIG.KEYS.MODEL) || "gemini-1.5-flash";
		const retries = config.get<number>(CONFIG.KEYS.RETRIES) || 3;

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

		let attempt = 0;
		while (attempt < retries) {
			try {
				Logger.info(
					`[AI] Sending ${
						prompt.length
					} chars to (${model}). JsonMode: ${isJsonMode}. Attempt ${
						attempt + 1
					}`,
					"AI"
				);

				const response = await fetch(url, {
					method: "POST",
					headers: {
						"x-goog-api-key": apiKey,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						contents: [{ parts: [{ text: prompt }] }],
						safetySettings: [
							{
								category: "HARM_CATEGORY_HARASSMENT",
								threshold: "BLOCK_NONE",
							},
							{
								category: "HARM_CATEGORY_HATE_SPEECH",
								threshold: "BLOCK_NONE",
							},
							{
								category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
								threshold: "BLOCK_NONE",
							},
							{
								category: "HARM_CATEGORY_DANGEROUS_CONTENT",
								threshold: "BLOCK_NONE",
							},
						],
						generationConfig: {
							temperature: 0.2,
							maxOutputTokens: 8192,
							responseMimeType: isJsonMode
								? "application/json"
								: "text/plain",
						},
					}),
				});

				if (response.status === 429) {
					const delay = Math.pow(2, attempt) * 2000;
					Logger.warn(`Rate limit hit. Retrying in ${delay}ms`, "AI");
					await new Promise((r) => setTimeout(r, delay));
					attempt++;
					continue;
				}

				if (!response.ok) {
					const errText = await response.text();
					throw new Error(`HTTP ${response.status}: ${errText}`);
				}

				const json: any = await response.json();

				if (json.promptFeedback?.blockReason) {
					Logger.error(
						`BLOCKED: ${json.promptFeedback.blockReason}`,
						"AI"
					);
					return null;
				}

				if (!json.candidates || json.candidates.length === 0) {
					Logger.error("Empty candidates.", "AI");
					return null;
				}

				const candidate = json.candidates[0];

				// MAX_TOKENS handler
				if (candidate.finishReason === "MAX_TOKENS") {
					Logger.error("FILE TOO LARGE (MAX_TOKENS).", "AI");
					return null;
				}

				// Pastikan konten ada
				if (!candidate.content?.parts?.[0]?.text) {
					return null;
				}

				return candidate.content.parts[0].text;
			} catch (e: any) {
				attempt++;
				Logger.error("API Call Error", "AI", e.message);
				if (attempt >= retries) {
					return null;
				}
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
		return null;
	}
}
