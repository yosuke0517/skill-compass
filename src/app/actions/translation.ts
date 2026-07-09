"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import { getTranslationProvider } from "@/lib/translation/provider";
import { getCachedTranslatedQuizCard, type TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { addTranslatedQuizQuestionId, parseTranslatedQuizCookie, TRANSLATED_QUIZ_COOKIE } from "@/lib/translation/translated-quiz-cookie";
import { translateTodayQuizQuestion } from "@/lib/translation/translate-today-question";
import { createDrizzleTranslationRepository, type TranslationRepository } from "@/lib/translation/translate-text";

export async function translateQuizCardAction(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) redirect("/today");

  const translated = await translateTodayQuizQuestion(questionId);
  if (!translated) redirect("/today");
  await markQuestionAsTranslated(questionId);

  revalidatePath("/today");
  redirect("/today");
}

export async function translateQuizCardInlineAction(questionId: string): Promise<TranslatedQuizCard> {
  const translated = await translateTodayQuizQuestion(questionId);
  if (!translated) redirect("/today");
  await markQuestionAsTranslated(questionId);
  return translated;
}

async function markQuestionAsTranslated(questionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TRANSLATED_QUIZ_COOKIE, addTranslatedQuizQuestionId(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value, questionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function getTranslatedQuizCards(
  questions: TodayQuizQuestion[],
  repo: TranslationRepository = createDrizzleTranslationRepository(),
  providerCacheScope?: string,
): Promise<Record<string, TranslatedQuizCard>> {
  const cookieStore = await cookies();
  const visibleQuestionIds = parseTranslatedQuizCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
  if (visibleQuestionIds.length === 0) return {};

  const cacheScope = providerCacheScope ?? getTranslationProvider().cacheScope;
  const questionById = new Map(questions.map((item) => [item.question.id, item]));
  const translations = await Promise.all(
    visibleQuestionIds.map(async (questionId) => {
      const item = questionById.get(questionId);
      if (!item) return null;

      const translated = await getCachedTranslatedQuizCard(
        {
          question: item.question,
          feedback: item.answer?.feedback ?? null,
        },
        repo,
        cacheScope,
      );

      return [questionId, translated] as const;
    }),
  );

  return Object.fromEntries(
    translations.filter((entry): entry is readonly [string, TranslatedQuizCard] => entry !== null),
  );
}
