"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getTodayQuiz, type TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import { getTranslationProvider } from "@/lib/translation/provider";
import { getCachedTranslatedQuizCard, translateQuizCard, type TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { createDrizzleTranslationRepository, type TranslationRepository } from "@/lib/translation/translate-text";

const TRANSLATED_QUIZ_COOKIE = "skill_compass_translated_quiz";

export async function translateQuizCardAction(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) redirect("/today");

  const quiz = await getTodayQuiz();
  const item = quiz.questions.find((entry) => entry.question.id === questionId);
  if (!item) redirect("/today");

  await translateQuizCard(
    {
      question: item.question,
      feedback: item.answer?.feedback ?? null,
    },
    createDrizzleTranslationRepository(),
    getTranslationProvider(),
  );

  const cookieStore = await cookies();
  const visibleQuestionIds = parseTranslatedCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
  cookieStore.set(TRANSLATED_QUIZ_COOKIE, JSON.stringify([...new Set([...visibleQuestionIds, questionId])]), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  revalidatePath("/today");
  redirect("/today");
}

export async function getTranslatedQuizCards(
  questions: TodayQuizQuestion[],
  repo: TranslationRepository = createDrizzleTranslationRepository(),
): Promise<Record<string, TranslatedQuizCard>> {
  const cookieStore = await cookies();
  const visibleQuestionIds = parseTranslatedCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
  if (visibleQuestionIds.length === 0) return {};

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
      );

      return [questionId, translated] as const;
    }),
  );

  return Object.fromEntries(
    translations.filter((entry): entry is readonly [string, TranslatedQuizCard] => entry !== null),
  );
}

function parseTranslatedCookie(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((questionId): questionId is string => typeof questionId === "string" && questionId.length > 0))];
  } catch {
    return [];
  }
}
