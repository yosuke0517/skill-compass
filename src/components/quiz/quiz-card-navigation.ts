export type QuizCardNavigationDirection = "next" | "previous";

export type QuizCardQuestionRecord = {
  answer: object | null;
};

export function getClampedQuestionIndex(index: number, total: number): number {
  if (total <= 0) return 0;

  return Math.min(Math.max(index, 0), total - 1);
}

export function getNextQuestionIndex(currentIndex: number, total: number, direction: QuizCardNavigationDirection): number {
  if (total <= 0) return 0;

  const lastIndex = total - 1;
  const boundedCurrentIndex = getClampedQuestionIndex(currentIndex, total);

  return direction === "next"
    ? Math.min(boundedCurrentIndex + 1, lastIndex)
    : Math.max(boundedCurrentIndex - 1, 0);
}

export function getFirstUnansweredIndex(questions: readonly QuizCardQuestionRecord[]): number {
  return questions.findIndex((question) => question.answer === null);
}
