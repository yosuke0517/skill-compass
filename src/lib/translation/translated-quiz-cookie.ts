export const TRANSLATED_QUIZ_COOKIE = "skill_compass_translated_quiz";

export function parseTranslatedQuizCookie(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((questionId): questionId is string => typeof questionId === "string" && questionId.length > 0))];
  } catch {
    return [];
  }
}

export function addTranslatedQuizQuestionId(value: string | undefined, questionId: string): string {
  const visibleQuestionIds = parseTranslatedQuizCookie(value);
  return JSON.stringify([...new Set([...visibleQuestionIds, questionId])]);
}
