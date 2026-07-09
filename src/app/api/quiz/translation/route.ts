import { NextResponse, type NextRequest } from "next/server";

import { addTranslatedQuizQuestionId, TRANSLATED_QUIZ_COOKIE } from "@/lib/translation/translated-quiz-cookie";
import { translateTodayQuizQuestion } from "@/lib/translation/translate-today-question";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { questionId?: unknown } | null;
  const questionId = typeof body?.questionId === "string" ? body.questionId : "";

  if (!questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }

  const translated = await translateTodayQuizQuestion(questionId);
  if (!translated) {
    return NextResponse.json({ error: "question not found" }, { status: 404 });
  }

  const response = NextResponse.json(translated);
  response.cookies.set(TRANSLATED_QUIZ_COOKIE, addTranslatedQuizQuestionId(request.cookies.get(TRANSLATED_QUIZ_COOKIE)?.value, questionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return response;
}
