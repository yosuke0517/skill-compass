import { NextResponse } from "next/server";

import { getAssistantProvider } from "@/lib/assistant/provider";
import { buildTodayAssistantInput } from "@/lib/assistant/today-assistant";
import type { TodayAssistantMessage } from "@/lib/assistant/types";
import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";

const maxMessageLength = 1200;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: unknown; messages?: unknown; questionId?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  const conversation = parseConversation(body?.messages);

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }

  const quiz = await getTodayQuiz();
  const activeQuestion = quiz.questions.find((item) => item.question.id === questionId);
  if (!activeQuestion) {
    return NextResponse.json({ error: "question not found" }, { status: 404 });
  }

  const result = await getAssistantProvider().ask(
    buildTodayAssistantInput(message, quiz.quizDate, quiz.progress, [activeQuestion], conversation),
  );

  if (result.status === "unavailable") {
    return NextResponse.json({ error: result.reason, provider: result.provider }, { status: 503 });
  }

  return NextResponse.json({ answer: result.answer, provider: result.provider });
}

function parseConversation(value: unknown): TodayAssistantMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = "role" in item ? item.role : null;
      const text = "text" in item && typeof item.text === "string" ? item.text.trim() : "";
      if ((role !== "user" && role !== "assistant") || !text) return null;

      return {
        role,
        text: text.slice(0, maxMessageLength),
      } satisfies TodayAssistantMessage;
    })
    .filter((item): item is TodayAssistantMessage => item !== null);
}
