import { describe, expect, it } from "vitest";
import { translateQuizCard } from "@/lib/translation/translate-quiz-card";
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
});
