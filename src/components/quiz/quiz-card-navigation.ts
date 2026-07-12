export type QuizCardNavigationDirection = "next" | "previous";

export type QuizCardQuestionRecord = {
  answer: object | null;
};

export function getNextQuestionIndex(currentIndex: number, total: number, direction: QuizCardNavigationDirection): number {
  if (total <= 0) return 0;

  const lastIndex = total - 1;
  const boundedCurrentIndex = Math.min(Math.max(currentIndex, 0), lastIndex);

  return direction === "next"
    ? Math.min(boundedCurrentIndex + 1, lastIndex)
    : Math.max(boundedCurrentIndex - 1, 0);
}

export function getFirstUnansweredIndex(questions: readonly QuizCardQuestionRecord[]): number {
  return questions.findIndex((question) => question.answer === null);
}
