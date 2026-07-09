import { describe, expect, it } from "vitest";
import { createTranslationCacheKey } from "@/lib/translation/cache-key";
import { TRANSLATION_GLOSSARY_VERSION } from "@/lib/translation/glossary";
import { getCachedTranslatedQuizCard, translateQuizCard } from "@/lib/translation/translate-quiz-card";
import type { TranslationRepository } from "@/lib/translation/translate-text";
import type { TranslationProvider } from "@/lib/translation/types";

describe("translateQuizCard", () => {
  it("translates prompt, choices, and feedback", async () => {
    const repo: TranslationRepository = {
      async findBySourceHash() {
        return null;
      },
      async saveTranslation() {},
      async touchCache() {},
    };
    const provider: TranslationProvider = {
      async translate(input) {
        return { translatedText: `日本語訳: ${input.sourceText}`, provider: "deterministic" };
      },
    };

    const result = await translateQuizCard(
      {
        question: {
          id: "q1",
          prompt: "What does a reverse proxy usually do?",
          choices: [
            { id: "a", label: "Forwards client requests.", correct: true },
            { id: "b", label: "Compiles frontend assets.", correct: false },
          ],
        },
        feedback: "Review the linked source.",
      },
      repo,
      provider,
    );

    expect(result.prompt).toBe("日本語訳: What does a reverse proxy usually do?");
    expect(result.choices[0]).toEqual({ id: "a", label: "日本語訳: Forwards client requests." });
    expect(result.feedback).toBe("日本語訳: Review the linked source.");
  });

  it("rebuilds a translated card from cached rows", async () => {
    const records = new Map(
      [
        ["What does a reverse proxy usually do?", "quiz_prompt", "リバースプロキシは通常何をしますか。"],
        ["Forwards client requests.", "quiz_choice", "クライアントのリクエストを転送します。"],
        ["Compiles frontend assets.", "quiz_choice", "フロントエンド資産をコンパイルします。"],
        ["Review the linked source.", "quiz_feedback", "リンク先のソースを見直してください。"],
      ].map(([sourceText, purpose, translatedText]) => {
        const key = createTranslationCacheKey({
          sourceText,
          sourceLocale: "en",
          targetLocale: "ja",
          purpose: purpose as "quiz_prompt" | "quiz_choice" | "quiz_feedback",
          glossaryVersion: TRANSLATION_GLOSSARY_VERSION,
          providerCacheScope: "gemini:gemini-2.5-flash-lite",
        });

        return [key.sourceHash, { translatedText, provider: "deterministic" }] as const;
      }),
    );

    const repo: TranslationRepository = {
      async findBySourceHash(sourceHash) {
        return records.get(sourceHash) ?? null;
      },
      async saveTranslation() {
        throw new Error("cache hydration must not write");
      },
      async touchCache() {},
    };

    const result = await getCachedTranslatedQuizCard(
      {
        question: {
          id: "q1",
          prompt: "What does a reverse proxy usually do?",
          choices: [
            { id: "a", label: "Forwards client requests.", correct: true },
            { id: "b", label: "Compiles frontend assets.", correct: false },
          ],
        },
        feedback: "Review the linked source.",
      },
      repo,
      "gemini:gemini-2.5-flash-lite",
    );

    expect(result).toEqual({
      questionId: "q1",
      prompt: "リバースプロキシは通常何をしますか。",
      feedback: "リンク先のソースを見直してください。",
      unavailable: false,
      choices: [
        { id: "a", label: "クライアントのリクエストを転送します。" },
        { id: "b", label: "フロントエンド資産をコンパイルします。" },
      ],
    });
  });
});
