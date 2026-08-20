"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/access/current-user";
import { appendAdditionalQuizQuestions } from "@/lib/quiz/extend-daily-quiz";
import { submitTodayAnswer } from "@/lib/quiz/submit-answer";
import { getMaintenanceMode } from "@/lib/runtime/maintenance";

export async function submitQuizAnswerAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (getMaintenanceMode() === "read_only") redirect("/maintenance");
  const quizDayId = String(formData.get("quizDayId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const selectedChoiceId = String(formData.get("selectedChoiceId") ?? "");
  const rawConfidence = String(formData.get("confidence") ?? "").trim();
  const confidence = rawConfidence ? Number(rawConfidence) : undefined;
  const reasoning = String(formData.get("reasoning") ?? "").trim();

  if (
    !quizDayId ||
    !questionId ||
    !selectedChoiceId ||
    (confidence !== undefined &&
      (!Number.isInteger(confidence) || confidence < 1 || confidence > 5))
  ) {
    redirect("/today?error=missing-answer");
  }

  try {
    await submitTodayAnswer({
      userId: user.id,
      quizDayId,
      questionId,
      selectedChoiceId,
      reasoning,
      ...(confidence === undefined ? {} : { confidence }),
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
  if (getMaintenanceMode() === "read_only") redirect("/maintenance");
  const quizDayId = String(formData.get("quizDayId") ?? "");
  if (!quizDayId) redirect("/today");

  await appendAdditionalQuizQuestions(user.id, quizDayId);

  revalidatePath("/today");
  redirect("/today");
}
