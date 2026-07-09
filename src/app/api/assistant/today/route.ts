import { NextResponse } from "next/server";

import { getAssistantProvider } from "@/lib/assistant/provider";
import { buildTodayAssistantInput } from "@/lib/assistant/today-assistant";
import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const quiz = await getTodayQuiz();
  const result = await getAssistantProvider().ask(
    buildTodayAssistantInput(message, quiz.quizDate, quiz.progress, quiz.questions),
  );

  if (result.status === "unavailable") {
    return NextResponse.json({ error: result.reason, provider: result.provider }, { status: 503 });
  }

  return NextResponse.json({ answer: result.answer, provider: result.provider });
}
