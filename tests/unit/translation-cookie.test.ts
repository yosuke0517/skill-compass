import { describe, expect, it, vi } from "vitest";

import { getTranslatedQuizCards } from "@/app/actions/translation";
import { createTranslationCacheKey } from "@/lib/translation/cache-key";
import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import { TRANSLATION_GLOSSARY_VERSION } from "@/lib/translation/glossary";
import type { TranslationRepository } from "@/lib/translation/translate-text";

const mockCookieValue = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => mockCookieValue }),
}));

const quizQuestions: TodayQuizQuestion[] = [
  {
    slot: 1,
    reason: "weakness",
    question: {
      id: "q1",
      conceptId: "concept-1",
      prompt: "What does a reverse proxy usually do?",
      choices: [
        { id: "a", label: "Forwards client requests.", correct: true },
        { id: "b", label: "Compiles frontend assets.", correct: false },
      ],
      rationale: "It sits in front of upstream services.",
    },
    answer: {
      selectedChoiceId: "a",
      correct: true,
      feedback: "Review the linked source.",
      scoreDelta: 0.2,
    },
  },
  {
    slot: 2,
    reason: "fallback",
    question: {
      id: "q2",
      conceptId: "concept-2",
      prompt: "What does a cache key include?",
      choices: [
        { id: "a", label: "Only the translated text.", correct: false },
        { id: "b", label: "The source text and translation context.", correct: true },
      ],
      rationale: "The context matters for correctness.",
    },
    answer: null,
  },
];

function createCacheRecord(sourceText: string, purpose: "quiz_prompt" | "quiz_choice" | "quiz_feedback", translatedText: string) {
  const key = createTranslationCacheKey({
    sourceText,
    sourceLocale: "en",
    targetLocale: "ja",
    purpose,
    glossaryVersion: TRANSLATION_GLOSSARY_VERSION,
  });

  return [key.sourceHash, { translatedText, provider: "deterministic" }] as const;
}

function createRepo(
  records: ReadonlyArray<readonly [string, { translatedText: string; provider: string }]>,
): TranslationRepository {
  const cache = new Map(records);

  return {
    async findBySourceHash(sourceHash) {
      return cache.get(sourceHash) ?? null;
    },
    async saveTranslation() {
      throw new Error("render helper must not write translations");
    },
    async touchCache() {},
  };
}

describe("getTranslatedQuizCards", () => {
  it("returns {} for malformed JSON", async () => {
    mockCookieValue.value = "{\"questionId\": ";
    expect(await getTranslatedQuizCards(quizQuestions, createRepo([]))).toEqual({});
  });

  it("returns {} for non-array cookie payloads", async () => {
    mockCookieValue.value = '"not-an-array"';
    expect(await getTranslatedQuizCards(quizQuestions, createRepo([]))).toEqual({});

    mockCookieValue.value = '{"q1":true}';
    expect(await getTranslatedQuizCards(quizQuestions, createRepo([]))).toEqual({});

    mockCookieValue.value = "123";
    expect(await getTranslatedQuizCards(quizQuestions, createRepo([]))).toEqual({});
  });

  it("reconstructs visible translations from cached rows only", async () => {
    mockCookieValue.value = JSON.stringify(["q1", "q1", 7, "q_missing"]);
    const repo = createRepo([
      createCacheRecord("What does a reverse proxy usually do?", "quiz_prompt", "リバースプロキシは通常何をしますか。"),
      createCacheRecord("Forwards client requests.", "quiz_choice", "クライアントのリクエストを転送します。"),
      createCacheRecord("Compiles frontend assets.", "quiz_choice", "フロントエンド資産をコンパイルします。"),
      createCacheRecord("Review the linked source.", "quiz_feedback", "リンク先のソースを見直してください。"),
    ]);

    expect(await getTranslatedQuizCards(quizQuestions, repo)).toEqual({
      q1: {
        questionId: "q1",
        prompt: "リバースプロキシは通常何をしますか。",
        feedback: "リンク先のソースを見直してください。",
        unavailable: false,
        choices: [
          { id: "a", label: "クライアントのリクエストを転送します。" },
          { id: "b", label: "フロントエンド資産をコンパイルします。" },
        ],
      },
    });
  });

  it("keeps a visible question unavailable when cached rows are missing", async () => {
    mockCookieValue.value = JSON.stringify(["q2"]);

    expect(await getTranslatedQuizCards(quizQuestions, createRepo([]))).toEqual({
      q2: {
        questionId: "q2",
        prompt: null,
        feedback: null,
        unavailable: true,
        choices: [
          { id: "a", label: null },
          { id: "b", label: null },
        ],
      },
    });
  });
});
