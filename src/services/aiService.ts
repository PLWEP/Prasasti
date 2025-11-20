import * as vscode from "vscode";
import { CONFIG } from "../constants";
import { Logger } from "../utils/logger";

export class AiService {
	static async generateDocs(
		prompt: string,
		apiKey: string
	): Promise<string | null> {
		const config = vscode.workspace.getConfiguration(CONFIG.SECTION);
		const model =
			config.get<string>(CONFIG.KEYS.MODEL) || "gemini-2.5-flash";
		const retries = config.get<number>(CONFIG.KEYS.RETRIES) || 3;

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

		let attempt = 0;
		while (attempt < retries) {
			try {
				Logger.info(
					`[AI] Sending ${
						prompt.length
					} chars to (${model}). Attempt ${attempt + 1}`,
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
					const errorText = await response.text();
					Logger.error(
						`HTTP Error ${response.status}`,
						"AI",
						errorText
					);
					throw new Error(`HTTP ${response.status}: ${errorText}`);
				}

				const json: any = await response.json();

				if (json.promptFeedback && json.promptFeedback.blockReason) {
					Logger.error(
						`BLOCKED BY FILTER: ${json.promptFeedback.blockReason}`,
						"AI"
					);
					return null;
				}

				if (!json.candidates || json.candidates.length === 0) {
					Logger.error(
						"AI Response OK but Candidates Empty. (Possible content filter)",
						"AI"
					);
					Logger.warn(
						JSON.stringify(json).substring(0, 500),
						"AI-Debug"
					);
					return null;
				}

				const candidate = json.candidates[0];

				if (
					candidate.finishReason &&
					candidate.finishReason !== "STOP"
				) {
					Logger.warn(
						`AI stopped abnormally. Reason: ${candidate.finishReason}`,
						"AI"
					);

					if (candidate.finishReason === "SAFETY") {
						Logger.error(
							"SAFETY TRIGGERED: Code contains SQL commands considered malicious.",
							"AI"
						);
						return null; // Batal
					}

					if (candidate.finishReason === "MAX_TOKENS") {
						Logger.error(
							"FILE TOO LARGE: The file exceeds the AI's output limit (approx 8000 tokens).",
							"AI"
						);
						// PENTING: Return NULL agar file asli tidak ditimpa dengan kode setengah jadi!
						return null;
					}
				}

				if (
					!candidate.content ||
					!candidate.content.parts ||
					candidate.content.parts.length === 0
				) {
					Logger.error(
						"Candidate exists but content text is empty.",
						"AI"
					);
					return null;
				}

				const resultText = candidate.content.parts[0].text;
				Logger.info(
					`[AI] Success! Received ${resultText.length} chars.`,
					"AI"
				);

				return resultText;
			} catch (e) {
				attempt++;
				Logger.error("API Call Exception", "AI", e);
				if (attempt >= retries) {
					return null;
				}
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
		return null;
	}
}
