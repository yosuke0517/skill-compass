import { eq, inArray } from "drizzle-orm";

import {
  answers,
  conceptTags,
  questions,
  quizDayQuestions,
  quizDays,
  scores,
  sources,
  tags,
} from "@/db/schema";

import { selectDailyQuiz } from "./select-daily-quiz";
import type { QuizSelectionQuestion, QuizSelectionReason } from "./types";

export type TodayQuizQuestion = {
  slot: number;
  reason: string;
  question: {
    id: string;
    conceptId: string;
    prompt: string;
    choices: Array<{ id: string; label: string; correct: boolean }>;
    rationale: string;
  };
  answer: {
    selectedChoiceId: string;
    correct: boolean | null;
    feedback: string | null;
    scoreDelta: number | null;
  } | null;
};

export type TodayQuiz = {
  quizDayId: string;
  quizDate: string;
  progress: { answered: number; total: number };
  questions: TodayQuizQuestion[];
};

export type BuildTodayQuizInput = {
  quizDay: { id: string; quizDate: string | Date };
  preparedQuestions: Array<{ quizDayId: string; questionId: string; slot: number; reason: string }>;
  questions: Array<{
    id: string;
    conceptId: string;
    prompt: string;
    choices: Array<{ id: string; label: string; correct: boolean }>;
    rationale: string;
  }>;
  answers: Array<{
    quizDayId: string;
    questionId: string;
    selectedChoiceId: string;
    correct: boolean | null;
    feedback: string | null;
    scoreDelta: number | null;
  }>;
};

export async function getTodayQuiz(today = toDateKey(new Date())): Promise<TodayQuiz> {
  const { db } = await import("@/db/client");
  const quizDayId = `quiz_${today}`;

  await db
    .insert(quizDays)
    .ignore()
    .values({
      id: quizDayId,
      quizDate: new Date(`${today}T00:00:00.000Z`),
      preparedAt: new Date(),
    });

  let preparedRows = await db.select().from(quizDayQuestions).where(eq(quizDayQuestions.quizDayId, quizDayId));

  if (preparedRows.length === 0) {
    const [questionRows, sourceRows, conceptTagRows, tagRows, scoreRows, answerRows] = await Promise.all([
      db.select().from(questions),
      db.select().from(sources),
      db.select().from(conceptTags),
      db.select().from(tags),
      db.select().from(scores),
      db.select().from(answers),
    ]);
    const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
    const tagById = new Map(tagRows.map((tag) => [tag.id, tag]));
    const categoryByConceptId = new Map(
      conceptTagRows
        .map((link) => [link.conceptId, tagById.get(link.tagId)?.categoryId])
        .filter((item): item is [string, string] => Boolean(item[1])),
    );
    const recentQuestionIds = answerRows.slice(-10).map((answer) => answer.questionId);
    const conceptScores = scoreRows.filter((score) => score.subjectType === "concept");
    const weakConceptIds = conceptScores.filter((score) => score.value <= 0.5).map((score) => score.subjectId);
    const strongConceptIds = conceptScores.filter((score) => score.value >= 0.6).map((score) => score.subjectId);
    const selectionQuestions: QuizSelectionQuestion[] = questionRows.map((question) => ({
      id: question.id,
      conceptId: question.conceptId,
      categoryId: categoryByConceptId.get(question.conceptId) ?? "uncategorized",
      difficulty: question.difficulty,
      sourceTrustTier: question.sourceId ? sourceById.get(question.sourceId)?.trustTier : undefined,
      active: question.active,
      createdAt: question.createdAt,
    }));

    const selected = selectDailyQuiz({
      today,
      questions: selectionQuestions,
      weakConceptIds,
      strongConceptIds,
      underrepresentedCategoryIds: [],
      gapCategoryIds: [],
      recentlyAnsweredQuestionIds: recentQuestionIds,
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

    preparedRows = await db.select().from(quizDayQuestions).where(eq(quizDayQuestions.quizDayId, quizDayId));
  }

  const questionIds = preparedRows.map((item) => item.questionId);
  const [questionRows, answerRows] = await Promise.all([
    questionIds.length > 0 ? db.select().from(questions).where(inArray(questions.id, questionIds)) : [],
    db.select().from(answers).where(eq(answers.quizDayId, quizDayId)),
  ]);

  return buildTodayQuiz({
    quizDay: { id: quizDayId, quizDate: today },
    preparedQuestions: preparedRows,
    questions: questionRows,
    answers: answerRows,
  });
}

export function buildTodayQuiz(input: BuildTodayQuizInput): TodayQuiz {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const answerByQuestionId = new Map(input.answers.map((answer) => [answer.questionId, answer]));
  const items: TodayQuizQuestion[] = [];

  for (const prepared of input.preparedQuestions.slice().sort((left, right) => left.slot - right.slot)) {
    const question = questionById.get(prepared.questionId);
    if (!question) continue;

    const savedAnswer = answerByQuestionId.get(prepared.questionId);
    const answer = savedAnswer?.correct === null ? undefined : savedAnswer;
    items.push({
      slot: prepared.slot,
      reason: prepared.reason as QuizSelectionReason,
      question,
      answer: answer
        ? {
            selectedChoiceId: answer.selectedChoiceId,
            correct: answer.correct,
            feedback: answer.feedback,
            scoreDelta: answer.scoreDelta,
          }
        : null,
    });
  }

  return {
    quizDayId: input.quizDay.id,
    quizDate: toDateKey(input.quizDay.quizDate),
    progress: {
      answered: items.filter((item) => item.answer !== null).length,
      total: items.length,
    },
    questions: items,
  };
}

function toDateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
