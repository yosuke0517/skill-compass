"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/access/current-user";
import { appendAdditionalQuizQuestions } from "@/lib/quiz/extend-daily-quiz";
import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";
import { submitTodayAnswer } from "@/lib/quiz/submit-answer";
import { toWebTodayQuizQuestions, type WebAnsweredQuizQuestion } from "@/lib/quiz/web-today-quiz";
import { getMaintenanceMode } from "@/lib/runtime/maintenance";

export type QuizAnswerActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; item: WebAnsweredQuizQuestion };

export async function submitQuizAnswerAction(
  _previousState: QuizAnswerActionState,
  formData: FormData,
): Promise<QuizAnswerActionState> {
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
    return { status: "error", message: "Choose an answer before submitting." };
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
    return { status: "error", message: "Your answer could not be saved. Please try again." };
  }

  revalidatePath("/today");
  revalidatePath("/dashboard");

  try {
    const today = await getTodayQuiz(user.id);
    const item = toWebTodayQuizQuestions(today.questions).find(
      (candidate) => candidate.question.id === questionId && candidate.status === "answered",
    );
    if (!item || item.status !== "answered") throw new Error("answered question unavailable");
    return { status: "success", item };
  } catch {
    return {
      status: "error",
      message: "Your answer was saved, but the review could not be loaded. Refresh Today to retry.",
    };
  }
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
