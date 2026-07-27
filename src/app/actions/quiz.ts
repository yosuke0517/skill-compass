"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/access/current-user";
import { appendAdditionalQuizQuestions } from "@/lib/quiz/extend-daily-quiz";
import { submitTodayAnswer } from "@/lib/quiz/submit-answer";

export async function submitQuizAnswerAction(formData: FormData) {
  const user = await requireCurrentUser();
  const quizDayId = String(formData.get("quizDayId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const selectedChoiceId = String(formData.get("selectedChoiceId") ?? "");
  const confidence = Number(formData.get("confidence") ?? 3);
  const reasoning = String(formData.get("reasoning") ?? "").trim();

  if (!quizDayId || !questionId || !selectedChoiceId) {
    redirect("/today?error=missing-answer");
  }

  try {
    await submitTodayAnswer({
      userId: user.id,
      quizDayId,
      questionId,
      selectedChoiceId,
      confidence,
      reasoning,
    });
  } catch {
    redirect("/today?error=submit-failed");
  }

  revalidatePath("/today");
  revalidatePath("/dashboard");
  redirect("/today");
}

export async function addMoreQuizQuestionsAction(formData: FormData) {
  const user = await requireCurrentUser();
  const quizDayId = String(formData.get("quizDayId") ?? "");
  if (!quizDayId) redirect("/today");

  await appendAdditionalQuizQuestions(user.id, quizDayId);

  revalidatePath("/today");
  redirect("/today");
}
