import { describe, expect, it } from "vitest";
import { createTranslationCacheKey } from "@/lib/translation/cache-key";
import { TRANSLATION_GLOSSARY_VERSION } from "@/lib/translation/glossary";
import { getCachedTranslatedQuizCard, translateQuizCard } from "@/lib/translation/translate-quiz-card";
import type { TranslationRepository } from "@/lib/translation/translate-text";
import type { TranslationProvider } from "@/lib/translation/types";

describe("translateQuizCard", () => {
  it("translates public and answered-review prose while preserving artifact source", async () => {
    const purposes = new Set<string>();
    const repo: TranslationRepository = {
      async findBySourceHash() {
        return null;
      },
      async saveTranslation() {},
      async touchCache() {},
    };
    const provider: TranslationProvider = {
      async translate(input) {
        purposes.add(input.purpose);
        return { translatedText: `日本語訳: ${input.sourceText}`, provider: "deterministic" };
      },
    };

    const result = await translateQuizCard(
      {
        question: {
          id: "q1",
          scenario: "Two teams need to develop in parallel.",
          artifacts: [
            {
              kind: "api",
              title: "Contract requirement",
              language: "yaml",
              content: "POST /v1/invoices\nresponses:\n  201: Invoice",
            },
          ],
          prompt: "What does a reverse proxy usually do?",
          choices: [
            {
              id: "a",
              label: "Forwards client requests.",
              correct: true,
              explanation: "It sits before the upstream.",
              consequence: "The upstream stays private.",
            },
            {
              id: "b",
              label: "Compiles frontend assets.",
              correct: false,
              explanation: "Compilation is a build concern.",
              consequence: "Requests are not routed.",
            },
          ],
          decisionCriteria: ["Route requests to a private upstream."],
          rationale: "The proxy owns the public request boundary.",
          practicalNotes: ["Forward trusted client headers explicitly."],
          checkQuestion: "Where does TLS termination happen?",
        },
        feedback: "Review the linked source.",
        revealReview: true,
      },
      repo,
      provider,
    );

    expect(result.scenario).toBe("日本語訳: Two teams need to develop in parallel.");
    expect(result.artifacts).toEqual([
      {
        kind: "api",
        title: "日本語訳: Contract requirement",
        language: "yaml",
        content: "POST /v1/invoices\nresponses:\n  201: Invoice",
      },
    ]);
    expect(result.prompt).toBe("日本語訳: What does a reverse proxy usually do?");
    expect(result.choices[0]).toEqual({
      id: "a",
      label: "日本語訳: Forwards client requests.",
      explanation: "日本語訳: It sits before the upstream.",
      consequence: "日本語訳: The upstream stays private.",
    });
    expect(result.decisionCriteria).toEqual([
      "日本語訳: Route requests to a private upstream.",
    ]);
    expect(result.rationale).toBe(
      "日本語訳: The proxy owns the public request boundary.",
    );
    expect(result.practicalNotes).toEqual([
      "日本語訳: Forward trusted client headers explicitly.",
    ]);
    expect(result.checkQuestion).toBe(
      "日本語訳: Where does TLS termination happen?",
    );
    expect(result.feedback).toBe("日本語訳: Review the linked source.");
    expect(JSON.stringify(result)).not.toContain('"correct"');
    expect(purposes).toEqual(
      new Set([
        "quiz_scenario",
        "quiz_artifact_title",
        "quiz_prompt",
        "quiz_choice",
        "quiz_decision_criterion",
        "quiz_rationale",
        "quiz_choice_explanation",
        "quiz_choice_consequence",
        "quiz_practical_note",
        "quiz_check_question",
        "quiz_feedback",
      ]),
    );
  });

  it("does not translate or return hidden review prose before an answer", async () => {
    const translatedSources: string[] = [];
    const repo: TranslationRepository = {
      async findBySourceHash() {
        return null;
      },
      async saveTranslation() {},
      async touchCache() {},
    };
    const provider: TranslationProvider = {
      async translate(input) {
        translatedSources.push(input.sourceText);
        return { translatedText: `日本語訳: ${input.sourceText}`, provider: "deterministic" };
      },
    };

    const result = await translateQuizCard(
      {
        question: {
          id: "q1",
          scenario: "A public scenario.",
          artifacts: [],
          prompt: "Choose one.",
          choices: [
            {
              id: "a",
              label: "Choice A",
              correct: true,
              explanation: "Hidden explanation.",
              consequence: "Hidden consequence.",
            },
          ],
          decisionCriteria: ["Hidden criterion."],
          rationale: "Hidden rationale.",
          practicalNotes: ["Hidden note."],
          checkQuestion: "Hidden check.",
        },
        feedback: null,
        revealReview: false,
      },
      repo,
      provider,
    );

    expect(result.decisionCriteria).toBeNull();
    expect(result.rationale).toBeNull();
    expect(result.practicalNotes).toBeNull();
    expect(result.checkQuestion).toBeNull();
    expect(result.choices).toEqual([
      {
        id: "a",
        label: "日本語訳: Choice A",
        explanation: null,
        consequence: null,
      },
    ]);
    expect(translatedSources).not.toContain("Hidden explanation.");
    expect(translatedSources).not.toContain("Hidden criterion.");
    expect(JSON.stringify(result)).not.toContain("Hidden");
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
          scenario: "",
          artifacts: [],
          prompt: "What does a reverse proxy usually do?",
          choices: [
            {
              id: "a",
              label: "Forwards client requests.",
              correct: true,
              explanation: "",
              consequence: "",
            },
            {
              id: "b",
              label: "Compiles frontend assets.",
              correct: false,
              explanation: "",
              consequence: "",
            },
          ],
          decisionCriteria: [],
          rationale: "",
          practicalNotes: [],
          checkQuestion: "",
        },
        feedback: "Review the linked source.",
        revealReview: true,
      },
      repo,
      "gemini:gemini-2.5-flash-lite",
    );

    expect(result).toEqual({
      questionId: "q1",
      scenario: null,
      artifacts: [],
      prompt: "リバースプロキシは通常何をしますか。",
      feedback: "リンク先のソースを見直してください。",
      decisionCriteria: [],
      rationale: null,
      practicalNotes: [],
      checkQuestion: null,
      unavailable: false,
      choices: [
        {
          id: "a",
          label: "クライアントのリクエストを転送します。",
          explanation: null,
          consequence: null,
        },
        {
          id: "b",
          label: "フロントエンド資産をコンパイルします。",
          explanation: null,
          consequence: null,
        },
      ],
    });
  });
});
