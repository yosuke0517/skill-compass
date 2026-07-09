import { buildTodayAssistantPrompt } from "../today-assistant";
import type { AssistantProvider, TodayAssistantInput } from "../types";

type ApiKeyResolver = () => Promise<string | undefined>;
type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<Response>;

export function createGeminiAssistantProvider(options: {
  apiKey: string | ApiKeyResolver | undefined;
  model: string;
  fetch?: FetchLike;
}): AssistantProvider {
  const fetchJson = options.fetch ?? fetch;

  return {
    async ask(input: TodayAssistantInput) {
      const apiKey = typeof options.apiKey === "function" ? await options.apiKey() : options.apiKey;
      if (!apiKey) {
        return { status: "unavailable", provider: "gemini", reason: "Gemini API key is not configured." };
      }

      try {
        const response = await fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildTodayAssistantPrompt(input) }] }],
              generationConfig: { maxOutputTokens: 700, temperature: 0.3 },
            }),
          },
        );

        if (!response.ok) {
          return { status: "unavailable", provider: "gemini", reason: "Gemini assistant request failed." };
        }

        const payload = (await response.json()) as GeminiResponse;
        const answer = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join("").trim();
        if (!answer) {
          return { status: "unavailable", provider: "gemini", reason: "Gemini returned empty output." };
        }

        return { status: "answered", answer, provider: "gemini" };
      } catch {
        return { status: "unavailable", provider: "gemini", reason: "Gemini assistant request failed." };
      }
    },
  };
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};
