"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { submitTodayAnswer } from "@/lib/quiz/submit-answer";

export async function submitQuizAnswerAction(formData: FormData) {
  const quizDayId = String(formData.get("quizDayId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const selectedChoiceId = String(formData.get("selectedChoiceId") ?? "");
  const confidence = Number(formData.get("confidence") ?? 3);
  const reasoning = String(formData.get("reasoning") ?? "").trim();

  if (!quizDayId || !questionId || !selectedChoiceId || reasoning.length === 0) {
    redirect("/today?error=missing-answer");
  }

  await submitTodayAnswer({
    quizDayId,
    questionId,
    selectedChoiceId,
    confidence,
    reasoning,
  });

  revalidatePath("/today");
  revalidatePath("/dashboard");
  redirect("/today");
}
