import { eq } from "drizzle-orm";

import { conceptTags, questions, quizDayQuestions, sources, tags } from "@/db/schema";
import type { QuizSelectionQuestion, QuizSelectionReason, SelectedQuizQuestion } from "./types";

const trustTierRank: Record<NonNullable<QuizSelectionQuestion["sourceTrustTier"]>, number> = {
  tier1: 0,
  tier2: 1,
  tier3: 2,
  tier4: 3,
};

export const DAILY_QUIZ_LIMIT = 30;
export const ADDITIONAL_QUIZ_COUNT = 5;

export type AdditionalQuizSelectionInput = {
  questions: QuizSelectionQuestion[];
  preparedQuestionIds: string[];
  currentTotal: number;
  maxTotal?: number;
  addCount?: number;
};

export function selectAdditionalQuizQuestions(input: AdditionalQuizSelectionInput): SelectedQuizQuestion[] {
  const maxTotal = input.maxTotal ?? DAILY_QUIZ_LIMIT;
  const addCount = input.addCount ?? ADDITIONAL_QUIZ_COUNT;
  const remainingSlots = Math.max(0, Math.min(addCount, maxTotal - input.currentTotal));
  if (remainingSlots === 0) return [];

  const preparedIds = new Set(input.preparedQuestionIds);
  return input.questions
    .filter((question) => question.active !== false)
    .filter((question) => !preparedIds.has(question.id))
    .sort(compareQuestionPriority)
    .slice(0, remainingSlots)
    .map((question, index) => ({
      question,
      slot: input.currentTotal + index + 1,
      reason: "fallback" satisfies QuizSelectionReason,
    }));
}

export async function appendAdditionalQuizQuestions(quizDayId: string) {
  const { db } = await import("@/db/client");
  const preparedRows = await db.select().from(quizDayQuestions).where(eq(quizDayQuestions.quizDayId, quizDayId));
  const currentTotal = preparedRows.length;

  if (currentTotal >= DAILY_QUIZ_LIMIT) {
    return { added: 0, total: currentTotal, limit: DAILY_QUIZ_LIMIT };
  }

  const [questionRows, sourceRows, conceptTagRows, tagRows] = await Promise.all([
    db.select().from(questions),
    db.select().from(sources),
    db.select().from(conceptTags),
    db.select().from(tags),
  ]);
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const tagById = new Map(tagRows.map((tag) => [tag.id, tag]));
  const categoryByConceptId = new Map(
    conceptTagRows
      .map((link) => [link.conceptId, tagById.get(link.tagId)?.categoryId])
      .filter((item): item is [string, string] => Boolean(item[1])),
  );
  const selectionQuestions: QuizSelectionQuestion[] = questionRows.map((question) => ({
    id: question.id,
    conceptId: question.conceptId,
    categoryId: categoryByConceptId.get(question.conceptId) ?? "uncategorized",
    difficulty: question.difficulty,
    sourceTrustTier: question.sourceId ? sourceById.get(question.sourceId)?.trustTier : undefined,
    active: question.active,
    createdAt: question.createdAt,
  }));
  const selected = selectAdditionalQuizQuestions({
    questions: selectionQuestions,
    preparedQuestionIds: preparedRows.map((row) => row.questionId),
    currentTotal,
  });

  if (selected.length > 0) {
    await db
      .insert(quizDayQuestions)
      .ignore()
      .values(
        selected.map((item) => ({
          quizDayId,
          questionId: item.question.id,
          slot: item.slot,
          reason: item.reason,
        })),
      );
  }

  return { added: selected.length, total: currentTotal + selected.length, limit: DAILY_QUIZ_LIMIT };
}

function compareQuestionPriority(left: QuizSelectionQuestion, right: QuizSelectionQuestion): number {
  const byTrust = getTrustRank(left) - getTrustRank(right);
  if (byTrust !== 0) return byTrust;

  const byCreated = getCreatedTime(right) - getCreatedTime(left);
  if (byCreated !== 0) return byCreated;

  return left.id.localeCompare(right.id);
}

function getTrustRank(question: QuizSelectionQuestion): number {
  return question.sourceTrustTier ? trustTierRank[question.sourceTrustTier] : Number.MAX_SAFE_INTEGER;
}

function getCreatedTime(question: QuizSelectionQuestion): number {
  if (!question.createdAt) return 0;
  return new Date(question.createdAt).getTime();
}
