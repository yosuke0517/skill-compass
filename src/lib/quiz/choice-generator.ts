import { createKeychainSecretResolver } from "@/lib/secrets/keychain";
import type { QuestionChoice } from "@/db/schema";

export type ChoiceGenerationInput = {
  prompt: string;
  conceptTitle: string;
  conceptSummary: string;
  rationale: string;
};

export interface ChoiceGenerator {
  generate(input: ChoiceGenerationInput): Promise<QuestionChoice[]>;
}

export function createGeminiChoiceGenerator(options: {
  apiKey: string | (() => Promise<string | undefined>) | undefined;
  model: string;
  fetch?: typeof fetch;
}): ChoiceGenerator {
  const fetchJson = options.fetch ?? fetch;

  return {
    async generate(input) {
      const apiKey = typeof options.apiKey === "function" ? await options.apiKey() : options.apiKey;
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const response = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildChoicePrompt(input) }] }],
            generationConfig: { temperature: 0.35, responseMimeType: "application/json" },
          }),
        },
      );

      if (!response.ok) throw new Error(`Gemini choice generation failed with status ${response.status}.`);
      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty choice set.");

      return parseChoices(text);
    },
  };
}

export function createKeychainGeminiChoiceGenerator(options: {
  service: string;
  account?: string;
  model: string;
}): ChoiceGenerator {
  return createGeminiChoiceGenerator({
    apiKey: createKeychainSecretResolver({ service: options.service, account: options.account }),
    model: options.model,
  });
}

function buildChoicePrompt(input: ChoiceGenerationInput): string {
  return [
    "You create high-quality multiple-choice questions for an engineering learning app.",
    "Return ONLY a JSON array with exactly four objects. Each object must have: id (a, b, c, or d), label (string), correct (boolean).",
    "Exactly one object must have correct=true.",
    "The three incorrect choices must be plausible misconceptions or near-misses, not jokes, trivia, or obviously absurd statements.",
    "Do not use 'all of the above', 'none of the above', or overlapping choices.",
    "Keep each choice concise and make every choice answer the question directly.",
    "Stay strictly within the domain described by the concept summary. Do not reinterpret abbreviations using an unrelated industry meaning.",
    "Use English because the app translates the choices separately.",
    `Concept: ${input.conceptTitle}`,
    `Concept summary: ${input.conceptSummary}`,
    `Question: ${input.prompt}`,
    `Learning rationale: ${input.rationale}`,
  ].join("\n");
}

function parseChoices(text: string): QuestionChoice[] {
  const normalized = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(normalized) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 4) throw new Error("Generated choice set must contain exactly four choices.");

  const choices = parsed.map((choice, index) => {
    if (!choice || typeof choice !== "object") throw new Error("Generated choice is not an object.");
    const candidate = choice as Record<string, unknown>;
    const id = candidate.id;
    const label = candidate.label;
    const correct = candidate.correct;
    if (id !== ["a", "b", "c", "d"][index] || typeof label !== "string" || !label.trim() || typeof correct !== "boolean") {
      throw new Error("Generated choice has an invalid shape.");
    }
    return { id, label: label.trim(), correct };
  });

  if (choices.filter((choice) => choice.correct).length !== 1) throw new Error("Generated choice set must have exactly one correct answer.");
  if (new Set(choices.map((choice) => choice.label.toLowerCase())).size !== 4) throw new Error("Generated choices must be unique.");
  return choices;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};
