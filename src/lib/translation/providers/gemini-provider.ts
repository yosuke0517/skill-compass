import { createKeychainSecretResolver, type ExecFile } from "@/lib/secrets/keychain";
import type { TranslationProvider } from "../types";

type ApiKeyResolver = () => Promise<string | undefined>;
type FetchLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<Response>;

export function createGeminiTranslationProvider(options: {
  apiKey: string | ApiKeyResolver | undefined;
  model: string;
  fetch?: FetchLike;
}): TranslationProvider {
  const fetchJson = options.fetch ?? fetch;

  return {
    cacheScope: `gemini:${options.model}`,
    async translate(input) {
      const apiKey = typeof options.apiKey === "function" ? await options.apiKey() : options.apiKey;

      if (!apiKey) {
        return { unavailable: true, provider: "gemini", reason: "Gemini API key is not configured." };
      }

      try {
        const response = await fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildPrompt(input) }] }],
              generationConfig: { temperature: 0.1 },
            }),
          },
        );

        if (!response.ok) {
          return { unavailable: true, provider: "gemini", reason: "Gemini translation failed." };
        }

        const payload = (await response.json()) as GeminiResponse;
        const translatedText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join("").trim();

        if (!translatedText) {
          return { unavailable: true, provider: "gemini", reason: "Gemini returned empty output." };
        }

        return { translatedText, provider: "gemini" };
      } catch {
        return { unavailable: true, provider: "gemini", reason: "Gemini translation failed." };
      }
    },
  };
}

export function createKeychainApiKeyResolver(options: {
  service: string;
  account?: string;
  execFile?: ExecFile;
}): ApiKeyResolver {
  return createKeychainSecretResolver(options);
}

function buildPrompt(input: Parameters<TranslationProvider["translate"]>[0]): string {
  const glossary = (input.glossary ?? [])
    .map((entry) => `${entry.source} => ${entry.target}`)
    .join("\n");

  return [
    "Translate the following English engineering learning text into natural Japanese.",
    "Translate only the content inside <source_text>.",
    "Return only the translated Japanese text. Do not include tags, labels, purpose, or explanations.",
    "Preserve technical terms according to this glossary:",
    glossary || "No glossary entries",
    `<purpose>${input.purpose}</purpose>`,
    "<source_text>",
    input.sourceText,
    "</source_text>",
  ].join("\n");
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};
