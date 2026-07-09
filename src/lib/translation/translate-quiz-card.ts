import { createTranslationCacheKey } from "./cache-key";
import { TRANSLATION_GLOSSARY_VERSION } from "./glossary";
import { translateText, type TranslationRepository } from "./translate-text";
import type { TranslationProvider } from "./types";

export type TranslateQuizCardInput = {
  question: {
    id: string;
    prompt: string;
    choices: Array<{ id: string; label: string; correct: boolean }>;
  };
  feedback?: string | null;
};

export type TranslatedQuizCard = {
  questionId: string;
  prompt: string | null;
  choices: Array<{ id: string; label: string | null }>;
  feedback: string | null;
  unavailable: boolean;
};

export async function translateQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  provider: TranslationProvider,
): Promise<TranslatedQuizCard> {
  const prompt = await translateText(
    { sourceText: input.question.prompt, sourceLocale: "en", targetLocale: "ja", purpose: "quiz_prompt" },
    repo,
    provider,
  );
  const choices = await Promise.all(
    input.question.choices.map(async (choice) => {
      const result = await translateText(
        { sourceText: choice.label, sourceLocale: "en", targetLocale: "ja", purpose: "quiz_choice" },
        repo,
        provider,
      );
      return { id: choice.id, label: result.status === "translated" ? result.translatedText : null };
    }),
  );
  const feedback = input.feedback
    ? await translateText(
        { sourceText: input.feedback, sourceLocale: "en", targetLocale: "ja", purpose: "quiz_feedback" },
        repo,
        provider,
      )
    : null;

  return {
    questionId: input.question.id,
    prompt: prompt.status === "translated" ? prompt.translatedText : null,
    choices,
    feedback: feedback?.status === "translated" ? feedback.translatedText : null,
    unavailable: prompt.status === "unavailable" || choices.some((choice) => choice.label === null),
  };
}

export async function getCachedTranslatedQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  providerCacheScope?: string,
): Promise<TranslatedQuizCard> {
  const [prompt, choices, feedback] = await Promise.all([
    getCachedTranslation(input.question.prompt, "quiz_prompt", repo, providerCacheScope),
    Promise.all(
      input.question.choices.map(async (choice) => ({
        id: choice.id,
        label: await getCachedTranslation(choice.label, "quiz_choice", repo, providerCacheScope),
      })),
    ),
    input.feedback ? getCachedTranslation(input.feedback, "quiz_feedback", repo, providerCacheScope) : Promise.resolve(null),
  ]);

  return {
    questionId: input.question.id,
    prompt,
    choices,
    feedback,
    unavailable: prompt === null || choices.some((choice) => choice.label === null),
  };
}

async function getCachedTranslation(
  sourceText: string,
  purpose: "quiz_prompt" | "quiz_choice" | "quiz_feedback",
  repo: TranslationRepository,
  providerCacheScope?: string,
): Promise<string | null> {
  const key = createTranslationCacheKey({
    sourceText,
    sourceLocale: "en",
    targetLocale: "ja",
    purpose,
    glossaryVersion: TRANSLATION_GLOSSARY_VERSION,
    providerCacheScope,
  });

  const cached = await repo.findBySourceHash(key.sourceHash);
  return cached?.translatedText ?? null;
}
