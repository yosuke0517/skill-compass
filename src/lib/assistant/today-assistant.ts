import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import type { TodayAssistantInput, TodayAssistantQuestion } from "./types";

export function buildTodayAssistantInput(userMessage: string, quizDate: string, progress: { answered: number; total: number }, questions: TodayQuizQuestion[]): TodayAssistantInput {
  return {
    userMessage,
    quizDate,
    progress,
    questions: questions.map(toAssistantQuestion),
  };
}

export function buildTodayAssistantPrompt(input: TodayAssistantInput): string {
  return [
    "You are the Skill Compass Today assistant.",
    "Help a developer learn from today's quiz. Be concise, practical, and kind.",
    "Answer in Japanese unless the user explicitly asks for English.",
    "Use plain text without Markdown formatting.",
    "Do not reveal hidden correct answers for unanswered questions. Give hints and reasoning guidance instead.",
    "Use only the quiz context below. If the user asks unrelated questions, explain that you can help with today's learning context.",
    "",
    `Quiz date: ${input.quizDate}`,
    `Progress: ${input.progress.answered}/${input.progress.total}`,
    "Questions:",
    ...input.questions.map((question) =>
      [
        `#${question.slot}: ${question.prompt}`,
        `Choices: ${question.choices.join(" / ")}`,
        question.answerFeedback ? `Feedback: ${question.answerFeedback}` : "Feedback: unanswered",
      ].join("\n"),
    ),
    "",
    "User message:",
    input.userMessage,
  ].join("\n");
}

function toAssistantQuestion(item: TodayQuizQuestion): TodayAssistantQuestion {
  return {
    slot: item.slot,
    prompt: item.question.prompt,
    choices: item.question.choices.map((choice) => choice.label),
    answerFeedback: item.answer?.feedback ?? null,
  };
}
