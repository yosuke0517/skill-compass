"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";
import { getTranslationProvider } from "@/lib/translation/provider";
import { translateQuizCard, type TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { createDrizzleTranslationRepository } from "@/lib/translation/translate-text";

const TRANSLATED_QUIZ_COOKIE = "skill_compass_translated_quiz";

export async function translateQuizCardAction(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) redirect("/today");

  const quiz = await getTodayQuiz();
  const item = quiz.questions.find((entry) => entry.question.id === questionId);
  if (!item) redirect("/today");

  const translated = await translateQuizCard(
    {
      question: item.question,
      feedback: item.answer?.feedback ?? null,
    },
    createDrizzleTranslationRepository(),
    getTranslationProvider(),
  );

  const cookieStore = await cookies();
  const existing = parseTranslatedCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
  existing[questionId] = translated;
  cookieStore.set(TRANSLATED_QUIZ_COOKIE, JSON.stringify(existing), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  revalidatePath("/today");
  redirect("/today");
}

export async function getTranslatedQuizCards(): Promise<Record<string, TranslatedQuizCard>> {
  const cookieStore = await cookies();
  return parseTranslatedCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
}

function parseTranslatedCookie(value: string | undefined): Record<string, TranslatedQuizCard> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
