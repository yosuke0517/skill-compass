import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";
import { getTranslationProvider } from "@/lib/translation/provider";
import { translateQuizCard, type TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { createDrizzleTranslationRepository } from "@/lib/translation/translate-text";

export async function translateTodayQuizQuestion(
  userId: string,
  questionId: string,
): Promise<TranslatedQuizCard | null> {
  const quiz = await getTodayQuiz(userId);
  const item = quiz.questions.find((entry) => entry.question.id === questionId);
  if (!item) return null;

  return translateQuizCard(
    {
      question: item.question,
      feedback: item.answer?.feedback ?? null,
      revealReview: item.answer !== null,
    },
    createDrizzleTranslationRepository(),
    getTranslationProvider(),
  );
}
