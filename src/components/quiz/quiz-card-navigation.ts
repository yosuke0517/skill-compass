export type QuizCardQuestionRecord = {
  answer: object | null;
};

export function getClampedQuestionIndex(index: number, total: number): number {
  if (total <= 0) return 0;

  return Math.min(Math.max(index, 0), total - 1);
}

export function getNextQuestionIndex(
  currentIndex: number,
  questions: readonly QuizCardQuestionRecord[],
): number {
  if (questions.length === 0) return 0;

  const lastIndex = questions.length - 1;
  const boundedCurrentIndex = getClampedQuestionIndex(currentIndex, questions.length);

  if (boundedCurrentIndex < lastIndex) return boundedCurrentIndex + 1;

  const firstUnansweredIndex = getFirstUnansweredIndex(questions);

  return firstUnansweredIndex >= 0 && firstUnansweredIndex !== boundedCurrentIndex
    ? firstUnansweredIndex
    : boundedCurrentIndex;
}

export function getFirstUnansweredIndex(questions: readonly QuizCardQuestionRecord[]): number {
  return questions.findIndex((question) => question.answer === null);
}
