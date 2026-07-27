import { and, desc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";

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
    active?: boolean;
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

export async function getTodayQuiz(userId: string, today = toDateKey(new Date())): Promise<TodayQuiz> {
  const { db } = await import("@/db/client");
  const generatedQuizDayId = createQuizDayId(userId, today);
  const quizDate = new Date(`${today}T00:00:00.000Z`);

  await db
    .insert(quizDays)
    .ignore()
    .values({
      id: generatedQuizDayId,
      userId,
      quizDate,
      preparedAt: new Date(),
    });

  const [ownedQuizDay] = await db
    .select({ id: quizDays.id })
    .from(quizDays)
    .where(and(eq(quizDays.userId, userId), eq(quizDays.quizDate, quizDate)))
    .limit(1);
  if (!ownedQuizDay) throw new Error("today_quiz_not_found");
  const quizDayId = resolveQuizDayId(userId, today, ownedQuizDay.id);

  let preparedRows = await loadPreparedQuestions(db, userId, quizDayId);

  if (preparedRows.length === 0) {
    const [questionRows, sourceRows, conceptTagRows, tagRows, scoreRows, answerRows, recentQuizDayRows] = await Promise.all([
      db.select().from(questions),
      db.select().from(sources),
      db.select().from(conceptTags),
      db.select().from(tags),
      db.select().from(scores).where(eq(scores.userId, userId)),
      db.select().from(answers).where(eq(answers.userId, userId)).orderBy(desc(answers.answeredAt)),
      db
        .select({ id: quizDays.id })
        .from(quizDays)
        .where(eq(quizDays.userId, userId))
        .orderBy(desc(quizDays.quizDate))
        .limit(7),
    ]);
    const recentQuizDayIds = recentQuizDayRows
      .map((quizDay) => quizDay.id)
      .filter((id) => id !== quizDayId);
    const recentAssignmentRows =
      recentQuizDayIds.length > 0
        ? await db
            .select({ questionId: quizDayQuestions.questionId })
            .from(quizDayQuestions)
            .where(inArray(quizDayQuestions.quizDayId, recentQuizDayIds))
        : [];
    const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
    const tagById = new Map(tagRows.map((tag) => [tag.id, tag]));
    const categoryByConceptId = new Map(
      conceptTagRows
        .map((link) => [link.conceptId, tagById.get(link.tagId)?.categoryId])
        .filter((item): item is [string, string] => Boolean(item[1])),
    );
    const recentQuestionIds = answerRows.slice(0, 10).map((answer) => answer.questionId);
    const dueQuestionIds = getDueQuestionIds(answerRows, today);
    const conceptScores = scoreRows.filter((score) => score.subjectType === "concept");
    const weakConceptIds = conceptScores.filter((score) => score.value <= 0.5).map((score) => score.subjectId);
    const strongConceptIds = conceptScores.filter((score) => score.value >= 0.6).map((score) => score.subjectId);
    const selectionQuestions: QuizSelectionQuestion[] = questionRows.map((question) => ({
      id: question.id,
      conceptId: question.conceptId,
      categoryId: categoryByConceptId.get(question.conceptId) ?? "uncategorized",
      caseType: question.caseType,
      correctChoiceId: question.choices.find((choice) => choice.correct)?.id ?? "",
      difficulty: question.difficulty,
      sourceTrustTier: question.sourceId ? sourceById.get(question.sourceId)?.trustTier : undefined,
      active: question.active,
      createdAt: question.createdAt,
    }));

    const selected = selectDailyQuiz({
      userId,
      today,
      questions: selectionQuestions,
      weakConceptIds,
      strongConceptIds,
      underrepresentedCategoryIds: [],
      gapCategoryIds: [],
      recentlyAnsweredQuestionIds: recentQuestionIds,
      recentlyAssignedQuestionIds: recentAssignmentRows.map((assignment) => assignment.questionId),
      dueQuestionIds,
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

    preparedRows = await loadPreparedQuestions(db, userId, quizDayId);
  }

  const questionIds = preparedRows.map((item) => item.questionId);
  const [questionRows, answerRows] = await Promise.all([
    questionIds.length > 0 ? db.select().from(questions).where(inArray(questions.id, questionIds)) : [],
    db
      .select()
      .from(answers)
      .where(and(eq(answers.userId, userId), eq(answers.quizDayId, quizDayId))),
  ]);

  return buildTodayQuiz({
    quizDay: { id: quizDayId, quizDate: today },
    preparedQuestions: preparedRows,
    questions: questionRows,
    answers: answerRows,
  });
}

type DbClient = Awaited<typeof import("@/db/client")>["db"];

async function loadPreparedQuestions(db: DbClient, userId: string, quizDayId: string) {
  return db
    .select({
      quizDayId: quizDayQuestions.quizDayId,
      questionId: quizDayQuestions.questionId,
      slot: quizDayQuestions.slot,
      reason: quizDayQuestions.reason,
    })
    .from(quizDayQuestions)
    .innerJoin(
      quizDays,
      and(eq(quizDays.id, quizDayQuestions.quizDayId), eq(quizDays.userId, userId)),
    )
    .where(eq(quizDayQuestions.quizDayId, quizDayId));
}

export function createQuizDayId(userId: string, today: string): string {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  return `quiz_${owner}_${today.replaceAll("-", "")}`;
}

export function resolveQuizDayId(
  userId: string,
  today: string,
  persistedQuizDayId?: string,
): string {
  return persistedQuizDayId ?? createQuizDayId(userId, today);
}

export function buildTodayQuiz(input: BuildTodayQuizInput): TodayQuiz {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const answerByQuestionId = new Map(input.answers.map((answer) => [answer.questionId, answer]));
  const items: TodayQuizQuestion[] = [];

  for (const prepared of input.preparedQuestions.slice().sort((left, right) => left.slot - right.slot)) {
    const question = questionById.get(prepared.questionId);
    if (!question || question.active === false) continue;

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

export function getDueQuestionIds(
  answerRows: Array<{ id: string; questionId: string; answeredAt: string | Date; nextReviewOn: string | Date | null }>,
  today: string,
): string[] {
  const latestByQuestionId = new Map<string, (typeof answerRows)[number]>();

  for (const answer of answerRows) {
    const current = latestByQuestionId.get(answer.questionId);
    if (!current || isLaterAnswer(answer, current)) latestByQuestionId.set(answer.questionId, answer);
  }

  return Array.from(latestByQuestionId.values())
    .filter((answer) => answer.nextReviewOn !== null && toDateKey(answer.nextReviewOn) <= today)
    .map((answer) => answer.questionId)
    .sort();
}

function isLaterAnswer(
  candidate: { id: string; answeredAt: string | Date },
  current: { id: string; answeredAt: string | Date },
): boolean {
  const byAnsweredAt = new Date(candidate.answeredAt).getTime() - new Date(current.answeredAt).getTime();
  return byAnsweredAt > 0 || (byAnsweredAt === 0 && candidate.id.localeCompare(current.id) > 0);
}

function toDateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
