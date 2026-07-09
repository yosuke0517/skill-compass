import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";
import { getTranslationProvider } from "@/lib/translation/provider";
import { translateQuizCard, type TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { createDrizzleTranslationRepository } from "@/lib/translation/translate-text";

export async function translateTodayQuizQuestion(questionId: string): Promise<TranslatedQuizCard | null> {
  const quiz = await getTodayQuiz();
  const item = quiz.questions.find((entry) => entry.question.id === questionId);
  if (!item) return null;

  return translateQuizCard(
    {
      question: item.question,
      feedback: item.answer?.feedback ?? null,
    },
    createDrizzleTranslationRepository(),
    getTranslationProvider(),
  );
}
