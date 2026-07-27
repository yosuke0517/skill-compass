import { and, eq } from "drizzle-orm";
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
import { getLlmProvider } from "@/lib/llm/provider";
import type { LlmProvider } from "@/lib/llm/types";

import { evaluateAnswer, type EvaluatedAnswer, type EvaluatableQuestion } from "./evaluate-answer";

export type SubmitAnswerInput = {
  userId: string;
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
  updateAnswerEvaluation(
    userId: string,
    answerId: string,
    evaluation: AnswerEvaluationUpdate,
  ): Promise<void>;
  updateConceptScore(update: {
    userId: string;
    subjectType: "concept";
    subjectId: string;
    delta: number;
  }): Promise<void>;
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

  await repo.updateAnswerEvaluation(input.userId, answerId, {
    correct: evaluation.correct,
    reasoningQuality: evaluation.reasoningQuality,
    feedback: evaluation.feedback,
    scoreDelta: evaluation.scoreDelta.delta,
    nextReviewOn,
  });
  await repo.updateConceptScore({
    userId: input.userId,
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
        .onDuplicateKeyUpdate({
          set: {
            selectedChoiceId: answer.selectedChoiceId,
            confidence: answer.confidence,
            reasoning: answer.reasoning,
            answeredAt: answer.answeredAt,
          },
        });
    },
    async updateAnswerEvaluation(userId, answerId, evaluation) {
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
        .where(and(eq(answers.id, answerId), eq(answers.userId, userId)));
    },
    async updateConceptScore(update) {
      const db = await getDbClient();
      await bumpScore(db, update.userId, "concept", update.subjectId, update.delta);

      const linkedTags = await db.select().from(conceptTags).where(eq(conceptTags.conceptId, update.subjectId));
      for (const linkedTag of linkedTags) {
        await bumpScore(db, update.userId, "tag", linkedTag.tagId, update.delta * 0.5);
        const [tag] = await db.select().from(tags).where(eq(tags.id, linkedTag.tagId)).limit(1);
        if (tag) {
          await bumpScore(db, update.userId, "category", tag.categoryId, update.delta * 0.25);
        }
      }
    },
  };
}

type DbClient = Awaited<ReturnType<typeof getDbClient>>;

async function bumpScore(
  db: DbClient,
  userId: string,
  subjectType: "category" | "tag" | "concept",
  subjectId: string,
  delta: number,
) {
  const id = createScoreId(userId, subjectType, subjectId);
  const [current] = await db
    .select()
    .from(scores)
    .where(
      and(
        eq(scores.userId, userId),
        eq(scores.subjectType, subjectType),
        eq(scores.subjectId, subjectId),
      ),
    )
    .limit(1);
  const nextValue = clampScore((current?.value ?? 0.45) + delta);

  if (current) {
    await db
      .update(scores)
      .set({ value: nextValue })
      .where(and(eq(scores.id, current.id), eq(scores.userId, userId)));
    return;
  }

  await db
    .insert(scores)
    .values({ id, userId, subjectType, subjectId, value: nextValue })
    .onDuplicateKeyUpdate({ set: { value: nextValue } });
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
