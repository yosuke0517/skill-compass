import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import {
  answers,
  conceptTags,
  questions,
  quizDayQuestions,
  quizDays,
  scores,
  tags,
} from "@/db/schema";
import { localDateKey } from "@/lib/datetime/local-date";
import { getLlmProvider } from "@/lib/llm/provider";
import type { LlmProvider } from "@/lib/llm/types";

import { evaluateAnswer, type EvaluatedAnswer, type EvaluatableQuestion } from "./evaluate-answer";

export type SubmitAnswerInput = {
  userId: string;
  today: string;
  quizDayId: string;
  questionId: string;
  selectedChoiceId: string;
  confidence?: number;
  reasoning: string;
};

export type SavedRawAnswer = {
  id: string;
  quizDayId: string;
  questionId: string;
  selectedChoiceId: string;
  confidence: number | null;
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

export type ExpectedRawAnswer = Pick<
  SavedRawAnswer,
  "selectedChoiceId" | "confidence" | "reasoning"
>;

export type FinalizeAnswerInput = {
  userId: string;
  answerId: string;
  expectedRaw: ExpectedRawAnswer;
  evaluation: AnswerEvaluationUpdate;
  conceptId: string;
};

export type SubmitAnswerRepository = {
  getQuestion(input: {
    userId: string;
    quizDayId: string;
    questionId: string;
  }): Promise<(EvaluatableQuestion & { conceptId: string }) | null>;
  findAnswerId(input: {
    userId: string;
    quizDayId: string;
    questionId: string;
  }): Promise<string | null>;
  saveRawAnswer(userId: string, answer: SavedRawAnswer): Promise<void>;
  finalizeAnswer(input: FinalizeAnswerInput): Promise<boolean>;
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
  const question = await repo.getQuestion({
    userId: input.userId,
    quizDayId: input.quizDayId,
    questionId: input.questionId,
  });
  if (!question) throw new Error(`Question ${input.questionId} was not found.`);

  const answerId =
    (await repo.findAnswerId({
      userId: input.userId,
      quizDayId: input.quizDayId,
      questionId: input.questionId,
    })) ?? createAnswerId(input.userId, input.quizDayId, input.questionId);
  await repo.saveRawAnswer(input.userId, {
    id: answerId,
    quizDayId: input.quizDayId,
    questionId: input.questionId,
    selectedChoiceId: input.selectedChoiceId,
    confidence: input.confidence ?? null,
    reasoning: input.reasoning,
    answeredAt: new Date(`${input.today}T12:00:00.000Z`),
  });

  const evaluation = await evaluateAnswer(
    {
      question,
      selectedChoiceId: input.selectedChoiceId,
      reasoning: input.reasoning,
    },
    provider,
  );
  const nextReviewOn = addDays(input.today, evaluation.scoreDelta.nextReviewDays);

  const finalized = await repo.finalizeAnswer({
    userId: input.userId,
    answerId,
    expectedRaw: {
      selectedChoiceId: input.selectedChoiceId,
      confidence: input.confidence ?? null,
      reasoning: input.reasoning,
    },
    evaluation: {
      correct: evaluation.correct,
      reasoningQuality: evaluation.reasoningQuality,
      feedback: evaluation.feedback,
      scoreDelta: evaluation.scoreDelta.delta,
      nextReviewOn,
    },
    conceptId: question.conceptId,
  });
  if (!finalized) throw new Error("today_already_answered");

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
      today: input.today ?? localDateKey(),
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
    async getQuestion(input) {
      const db = await getDbClient();
      const [quizDay] = await db
        .select({ id: quizDays.id })
        .from(quizDays)
        .where(and(eq(quizDays.id, input.quizDayId), eq(quizDays.userId, input.userId)))
        .limit(1);
      if (!quizDay) return null;

      const [assignment] = await db
        .select({ questionId: quizDayQuestions.questionId })
        .from(quizDayQuestions)
        .where(
          and(
            eq(quizDayQuestions.quizDayId, input.quizDayId),
            eq(quizDayQuestions.questionId, input.questionId),
          ),
        )
        .limit(1);
      if (!assignment) return null;

      const [question] = await db
        .select()
        .from(questions)
        .where(eq(questions.id, assignment.questionId))
        .limit(1);
      if (!question) return null;

      return {
        id: question.id,
        conceptId: question.conceptId,
        prompt: question.prompt,
        choices: question.choices,
      };
    },
    async findAnswerId(input) {
      const db = await getDbClient();
      const [answer] = await db
        .select({ id: answers.id })
        .from(answers)
        .where(
          and(
            eq(answers.userId, input.userId),
            eq(answers.quizDayId, input.quizDayId),
            eq(answers.questionId, input.questionId),
          ),
        )
        .limit(1);
      return answer?.id ?? null;
    },
    async saveRawAnswer(userId, answer) {
      const db = await getDbClient();
      await db
        .insert(answers)
        .values({
          id: answer.id,
          userId,
          quizDayId: answer.quizDayId,
          questionId: answer.questionId,
          selectedChoiceId: answer.selectedChoiceId,
          confidence: answer.confidence,
          reasoning: answer.reasoning,
          answeredAt: answer.answeredAt,
        })
        .onConflictDoUpdate({
          target: answers.id,
          set: {
            selectedChoiceId: sql`case when ${answers.correct} is null then ${answer.selectedChoiceId} else ${answers.selectedChoiceId} end`,
            confidence: sql`case when ${answers.correct} is null then ${answer.confidence} else ${answers.confidence} end`,
            reasoning: sql`case when ${answers.correct} is null then ${answer.reasoning} else ${answers.reasoning} end`,
            answeredAt: sql`case when ${answers.correct} is null then ${answer.answeredAt} else ${answers.answeredAt} end`,
          },
        });
    },
    async finalizeAnswer(input) {
      const db = await getDbClient();
      return db.transaction(async (tx) => {
        const confidenceMatches =
          input.expectedRaw.confidence === null
            ? isNull(answers.confidence)
            : eq(answers.confidence, input.expectedRaw.confidence);
        const updated = await tx
          .update(answers)
          .set({
            correct: input.evaluation.correct,
            reasoningQuality: input.evaluation.reasoningQuality,
            feedback: input.evaluation.feedback,
            scoreDelta: input.evaluation.scoreDelta,
            nextReviewOn: new Date(`${input.evaluation.nextReviewOn}T00:00:00.000Z`),
          })
          .where(
            and(
              eq(answers.id, input.answerId),
              eq(answers.userId, input.userId),
              isNull(answers.correct),
              eq(answers.selectedChoiceId, input.expectedRaw.selectedChoiceId),
              confidenceMatches,
              eq(answers.reasoning, input.expectedRaw.reasoning),
            ),
          )
          .returning({ id: answers.id });
        if (updated.length !== 1) return false;

        await bumpScore(
          tx,
          input.userId,
          "concept",
          input.conceptId,
          input.evaluation.scoreDelta,
        );
        const linkedTags = await tx
          .select()
          .from(conceptTags)
          .where(eq(conceptTags.conceptId, input.conceptId));
        for (const linkedTag of linkedTags) {
          await bumpScore(
            tx,
            input.userId,
            "tag",
            linkedTag.tagId,
            input.evaluation.scoreDelta * 0.5,
          );
          const [tag] = await tx
            .select()
            .from(tags)
            .where(eq(tags.id, linkedTag.tagId))
            .limit(1);
          if (tag) {
            await bumpScore(
              tx,
              input.userId,
              "category",
              tag.categoryId,
              input.evaluation.scoreDelta * 0.25,
            );
          }
        }
        return true;
      });
    },
  };
}

type DbClient = Awaited<ReturnType<typeof getDbClient>>;
type ScoreWriteClient = Pick<DbClient, "insert">;

async function bumpScore(
  db: ScoreWriteClient,
  userId: string,
  subjectType: "category" | "tag" | "concept",
  subjectId: string,
  delta: number,
) {
  const id = createScoreId(userId, subjectType, subjectId);
  await db
    .insert(scores)
    .values({
      id,
      userId,
      subjectType,
      subjectId,
      value: clampScore(0.45 + delta),
    })
    .onConflictDoUpdate({
      target: [scores.userId, scores.subjectType, scores.subjectId],
      set: {
        value: sql`round(min(1, max(0, ${scores.value} + ${delta})), 3)`,
      },
    });
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function toDateKey(value: Date): string {
  return localDateKey(value);
}

function clampScore(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
}

function createAnswerId(userId: string, quizDayId: string, questionId: string): string {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  const digest = createHash("sha256").update(`${quizDayId}:${questionId}`).digest("hex").slice(0, 24);
  return `answer_${owner}_${digest}`;
}

function createScoreId(
  userId: string,
  subjectType: "category" | "tag" | "concept",
  subjectId: string,
): string {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  const digest = createHash("sha256")
    .update(`${subjectType}:${subjectId}`)
    .digest("hex")
    .slice(0, 24);
  return `score_${owner}_${digest}`;
}
