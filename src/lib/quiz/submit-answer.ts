import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";

import { answers, conceptTags, questions, scores, tags } from "@/db/schema";
import { getLlmProvider } from "@/lib/llm/provider";
import type { LlmProvider } from "@/lib/llm/types";

import { evaluateAnswer, type EvaluatedAnswer, type EvaluatableQuestion } from "./evaluate-answer";

export type SubmitAnswerInput = {
  today: string;
  quizDayId: string;
  questionId: string;
  selectedChoiceId: string;
  confidence: number;
  reasoning: string;
};

export type SavedRawAnswer = {
  id: string;
  quizDayId: string;
  questionId: string;
  selectedChoiceId: string;
  confidence: number;
  reasoning: string;
  answeredAt: Date;
};

export type AnswerEvaluationUpdate = {
  correct: boolean;
  reasoningQuality: string;
  feedback: string;
  scoreDelta: number;
  nextReviewOn: string;
};

export type SubmitAnswerRepository = {
  getQuestion(questionId: string): Promise<(EvaluatableQuestion & { conceptId: string }) | null>;
  saveRawAnswer(answer: SavedRawAnswer): Promise<void>;
  updateAnswerEvaluation(answerId: string, evaluation: AnswerEvaluationUpdate): Promise<void>;
  updateConceptScore(update: { subjectType: "concept"; subjectId: string; delta: number }): Promise<void>;
};

export type SubmitAnswerResult = EvaluatedAnswer & {
  answerId: string;
  nextReviewOn: string;
};

export async function submitAnswer(
  input: SubmitAnswerInput,
  repo: SubmitAnswerRepository,
  provider: LlmProvider,
): Promise<SubmitAnswerResult> {
  const question = await repo.getQuestion(input.questionId);
  if (!question) throw new Error(`Question ${input.questionId} was not found.`);

  const answerId = createAnswerId(input.quizDayId, input.questionId);
  await repo.saveRawAnswer({
    id: answerId,
    quizDayId: input.quizDayId,
    questionId: input.questionId,
    selectedChoiceId: input.selectedChoiceId,
    confidence: input.confidence,
    reasoning: input.reasoning,
    answeredAt: new Date(`${input.today}T12:00:00.000Z`),
  });

  const evaluation = await evaluateAnswer(
    {
      question,
      selectedChoiceId: input.selectedChoiceId,
      confidence: input.confidence,
      reasoning: input.reasoning,
    },
    provider,
  );
  const nextReviewOn = addDays(input.today, evaluation.scoreDelta.nextReviewDays);

  await repo.updateAnswerEvaluation(answerId, {
    correct: evaluation.correct,
    reasoningQuality: evaluation.reasoningQuality,
    feedback: evaluation.feedback,
    scoreDelta: evaluation.scoreDelta.delta,
    nextReviewOn,
  });
  await repo.updateConceptScore({
    subjectType: "concept",
    subjectId: question.conceptId,
    delta: evaluation.scoreDelta.delta,
  });

  return {
    ...evaluation,
    answerId,
    nextReviewOn,
  };
}

export async function submitTodayAnswer(input: Omit<SubmitAnswerInput, "today"> & { today?: string }) {
  return submitAnswer(
    {
      ...input,
      today: input.today ?? toDateKey(new Date()),
    },
    createDrizzleSubmitAnswerRepository(),
    getLlmProvider(),
  );
}

async function getDbClient() {
  const { db } = await import("@/db/client");
  return db;
}

export function createDrizzleSubmitAnswerRepository(): SubmitAnswerRepository {
  return {
    async getQuestion(questionId) {
      const db = await getDbClient();
      const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
      if (!question) return null;

      return {
        id: question.id,
        conceptId: question.conceptId,
        prompt: question.prompt,
        choices: question.choices,
      };
    },
    async saveRawAnswer(answer) {
      const db = await getDbClient();
      await db
        .insert(answers)
        .values({
          id: answer.id,
          quizDayId: answer.quizDayId,
          questionId: answer.questionId,
          selectedChoiceId: answer.selectedChoiceId,
          confidence: answer.confidence,
          reasoning: answer.reasoning,
          answeredAt: answer.answeredAt,
        })
        .$returningId()
        .catch(async () => {
          await db
            .update(answers)
            .set({
              selectedChoiceId: answer.selectedChoiceId,
              confidence: answer.confidence,
              reasoning: answer.reasoning,
              answeredAt: answer.answeredAt,
            })
            .where(and(eq(answers.quizDayId, answer.quizDayId), eq(answers.questionId, answer.questionId)));
        });
    },
    async updateAnswerEvaluation(answerId, evaluation) {
      const db = await getDbClient();
      await db
        .update(answers)
        .set({
          correct: evaluation.correct,
          reasoningQuality: evaluation.reasoningQuality,
          feedback: evaluation.feedback,
          scoreDelta: evaluation.scoreDelta,
          nextReviewOn: new Date(`${evaluation.nextReviewOn}T00:00:00.000Z`),
        })
        .where(eq(answers.id, answerId));
    },
    async updateConceptScore(update) {
      const db = await getDbClient();
      await bumpScore(db, "concept", update.subjectId, update.delta);

      const linkedTags = await db.select().from(conceptTags).where(eq(conceptTags.conceptId, update.subjectId));
      for (const linkedTag of linkedTags) {
        await bumpScore(db, "tag", linkedTag.tagId, update.delta * 0.5);
        const [tag] = await db.select().from(tags).where(eq(tags.id, linkedTag.tagId)).limit(1);
        if (tag) await bumpScore(db, "category", tag.categoryId, update.delta * 0.25);
      }
    },
  };
}

type DbClient = Awaited<ReturnType<typeof getDbClient>>;

async function bumpScore(
  db: DbClient,
  subjectType: "category" | "tag" | "concept",
  subjectId: string,
  delta: number,
) {
  const id = `score_${subjectId}`;
  const [current] = await db
    .select()
    .from(scores)
    .where(and(eq(scores.subjectType, subjectType), eq(scores.subjectId, subjectId)))
    .limit(1);
  const nextValue = clampScore((current?.value ?? 0.45) + delta);

  if (current) {
    await db.update(scores).set({ value: nextValue }).where(eq(scores.id, current.id));
    return;
  }

  await db.insert(scores).values({ id, subjectType, subjectId, value: nextValue });
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function clampScore(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
}

function createAnswerId(quizDayId: string, questionId: string): string {
  const digest = createHash("sha256").update(`${quizDayId}:${questionId}`).digest("hex").slice(0, 24);
  return `answer_${digest}`;
}
