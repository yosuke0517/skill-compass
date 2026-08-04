import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";

import { answers, conceptTags, scores } from "@/db/schema";
import { deterministicLlmProvider } from "@/lib/llm/deterministic-provider";
import type { LlmProvider } from "@/lib/llm/types";
import {
  createDrizzleSubmitAnswerRepository,
  submitAnswer,
  type AnswerEvaluationUpdate,
  type SavedRawAnswer,
  type SubmitAnswerRepository,
} from "@/lib/quiz/submit-answer";

const dbModule = vi.hoisted(() => ({
  current: undefined as unknown,
}));

vi.mock("@/db/client", () => ({
  get db() {
    return dbModule.current;
  },
}));

describe("submitAnswer", () => {
  it("saves raw answer, evaluation feedback, score delta, and next review date", async () => {
    const savedAnswers: Array<{
      id: string;
      correct: boolean | null;
      confidence: number | null;
      feedback: string | null;
      scoreDelta: number | null;
      nextReviewOn: string | null;
    }> = [];
    const repositoryUsers: string[] = [];
    const scoreUpdates: Array<{ userId: string; subjectType: "concept"; subjectId: string; delta: number }> = [];

    const repo: SubmitAnswerRepository = {
      async getQuestion(input) {
        repositoryUsers.push(input.userId);
        expect(input).toEqual({
          userId: "user_a",
          quizDayId: "quiz_user_a_20260709",
          questionId: "question_typescript",
        });
        return {
          id: "question_typescript",
          conceptId: "concept_typescript",
          prompt: "Which answer matches the source?",
          choices: [
            { id: "a", label: "A", correct: false },
            { id: "b", label: "B", correct: true },
          ],
        };
      },
      async findAnswerId(input) {
        repositoryUsers.push(input.userId);
        expect(input).toEqual({
          userId: "user_a",
          quizDayId: "quiz_user_a_20260709",
          questionId: "question_typescript",
        });
        return null;
      },
      async saveRawAnswer(userId, answer) {
        repositoryUsers.push(userId);
        savedAnswers.push({
          id: answer.id,
          correct: null,
          confidence: answer.confidence,
          feedback: null,
          scoreDelta: null,
          nextReviewOn: null,
        });
      },
      async finalizeAnswer(input) {
        repositoryUsers.push(input.userId);
        const saved = savedAnswers.find((answer) => answer.id === input.answerId);
        if (!saved) throw new Error("answer was not saved first");
        saved.correct = input.evaluation.correct;
        saved.feedback = input.evaluation.feedback;
        saved.scoreDelta = input.evaluation.scoreDelta;
        saved.nextReviewOn = input.evaluation.nextReviewOn;
        scoreUpdates.push({
          userId: input.userId,
          subjectType: "concept",
          subjectId: input.conceptId,
          delta: input.evaluation.scoreDelta,
        });
        return true;
      },
    };

    const result = await submitAnswer(
      {
        userId: "user_a",
        today: "2026-07-09",
        quizDayId: "quiz_user_a_20260709",
        questionId: "question_typescript",
        selectedChoiceId: "b",
        reasoning: "The official source describes this exact behavior.",
      },
      repo,
      deterministicLlmProvider,
    );

    expect(savedAnswers).toHaveLength(1);
    expect(savedAnswers[0]?.correct).toBe(true);
    expect(savedAnswers[0]?.confidence).toBeNull();
    expect(savedAnswers[0]?.feedback).toContain("Correct");
    expect(savedAnswers[0]?.scoreDelta).toBeGreaterThan(0);
    expect(savedAnswers[0]?.nextReviewOn).toBe("2026-07-23");
    expect(scoreUpdates).toEqual([
      {
        userId: "user_a",
        subjectType: "concept",
        subjectId: "concept_typescript",
        delta: result.scoreDelta.delta,
      },
    ]);
    expect(repositoryUsers).toEqual(["user_a", "user_a", "user_a", "user_a"]);
  });

  it("creates different answer IDs for different owners", async () => {
    const answerIds: string[] = [];
    const repo: SubmitAnswerRepository = {
      async getQuestion() {
        return {
          id: "question_typescript",
          conceptId: "concept_typescript",
          prompt: "Which answer matches the source?",
          choices: [{ id: "b", label: "B", correct: true }],
        };
      },
      async findAnswerId() {
        return null;
      },
      async saveRawAnswer(_userId, answer) {
        answerIds.push(answer.id);
      },
      async finalizeAnswer() {
        return true;
      },
    };
    const common = {
      today: "2026-07-09",
      quizDayId: "quiz_shared_fixture",
      questionId: "question_typescript",
      selectedChoiceId: "b",
      confidence: 5,
      reasoning: "The source says so.",
    };

    await submitAnswer({ ...common, userId: "user_a" }, repo, deterministicLlmProvider);
    await submitAnswer({ ...common, userId: "user_b" }, repo, deterministicLlmProvider);

    expect(answerIds).toHaveLength(2);
    expect(answerIds[0]).toMatch(/^answer_[a-f0-9]{12}_[a-f0-9]{24}$/);
    expect(answerIds[0]).not.toBe(answerIds[1]);
  });

  it("reuses an owned legacy answer ID when recovering an interrupted submission", async () => {
    const savedAnswerIds: string[] = [];
    const repo: SubmitAnswerRepository = {
      async getQuestion() {
        return {
          id: "question_typescript",
          conceptId: "concept_typescript",
          prompt: "Which answer matches the source?",
          choices: [{ id: "b", label: "B", correct: true }],
        };
      },
      async findAnswerId(input) {
        expect(input).toEqual({
          userId: "user_local",
          quizDayId: "quiz_2026-07-09",
          questionId: "question_typescript",
        });
        return "answer_legacy_digest";
      },
      async saveRawAnswer(_userId, answer) {
        savedAnswerIds.push(answer.id);
      },
      async finalizeAnswer() {
        return true;
      },
    };

    const result = await submitAnswer(
      {
        userId: "user_local",
        today: "2026-07-09",
        quizDayId: "quiz_2026-07-09",
        questionId: "question_typescript",
        selectedChoiceId: "b",
        confidence: 4,
        reasoning: "Retry the interrupted evaluation.",
      },
      repo,
      deterministicLlmProvider,
    );

    expect(savedAnswerIds).toEqual(["answer_legacy_digest"]);
    expect(result.answerId).toBe("answer_legacy_digest");
  });

  it("applies a score delta only once when a completed answer is resent", async () => {
    const { repo, scoreDeltas } = createStatefulRepository();
    const input = answerInput();

    await submitAnswer(input, repo, deterministicLlmProvider);
    await expect(
      submitAnswer(input, repo, deterministicLlmProvider),
    ).rejects.toThrow("today_already_answered");

    expect(scoreDeltas).toHaveLength(1);
  });

  it("allows only one concurrent completion to finalize and score an answer", async () => {
    const { repo, scoreDeltas } = createStatefulRepository();
    let releaseEvaluations: (() => void) | undefined;
    const evaluationsReady = new Promise<void>((resolve) => {
      releaseEvaluations = resolve;
    });
    let evaluationCount = 0;
    const provider: LlmProvider = {
      async evaluateReasoning() {
        evaluationCount += 1;
        if (evaluationCount === 2) releaseEvaluations?.();
        await evaluationsReady;
        return {
          reasoningQuality: "good",
          misconceptionSeverity: "none",
          feedback: "Concurrent evaluation.",
        };
      },
    };

    const outcomes = await Promise.allSettled([
      submitAnswer(answerInput(), repo, provider),
      submitAnswer(answerInput(), repo, provider),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({ message: "today_already_answered" });
    expect(scoreDeltas).toHaveLength(1);
  });

  it("does not attach an evaluation when the saved raw answer changed concurrently", async () => {
    const stateful = createStatefulRepository();
    const provider: LlmProvider = {
      async evaluateReasoning() {
        stateful.overwriteRaw({
          selectedChoiceId: "a",
          confidence: 1,
          reasoning: "A different concurrent submission.",
        });
        return {
          reasoningQuality: "good",
          misconceptionSeverity: "none",
          feedback: "Evaluation for the stale raw answer.",
        };
      },
    };

    await expect(
      submitAnswer(answerInput(), stateful.repo, provider),
    ).rejects.toThrow("today_already_answered");

    expect(stateful.evaluationAttached()).toBe(false);
    expect(stateful.scoreDeltas).toHaveLength(0);
  });
});

type QueryCapture = {
  operation: "select" | "update" | "insert";
  table: "answers" | "scores" | "concept_tags" | "other";
  where?: unknown;
  set?: Record<string, unknown>;
  values?: Record<string, unknown>;
  upsert?: boolean;
  upsertSet?: Record<string, unknown>;
  inTransaction?: boolean;
};

describe("createDrizzleSubmitAnswerRepository user isolation", () => {
  it("includes the owner in every answer condition and score write", async () => {
    const { db, captures } = createRepositoryDb({
      answerId: "answer_existing",
      score: { id: "score_existing", value: 0.45 },
      finalizationAffectedRows: 1,
    });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    await expect(
      repo.findAnswerId({
        userId: "user_a",
        quizDayId: "quiz_a",
        questionId: "question_a",
      }),
    ).resolves.toBe("answer_existing");
    await repo.saveRawAnswer("user_a", {
      id: "answer_existing",
      quizDayId: "quiz_a",
      questionId: "question_a",
      selectedChoiceId: "b",
      confidence: 4,
      reasoning: "Owned answer.",
      answeredAt: new Date("2026-07-09T12:00:00.000Z"),
    });
    await repo.finalizeAnswer({
      userId: "user_a",
      answerId: "answer_existing",
      expectedRaw: {
        selectedChoiceId: "b",
        confidence: 4,
        reasoning: "Owned answer.",
      },
      evaluation: {
        correct: true,
        reasoningQuality: "strong",
        feedback: "Correct.",
        scoreDelta: 0.1,
        nextReviewOn: "2026-07-16",
      },
      conceptId: "concept_a",
    });

    const answerQueries = captures.filter(
      (capture) =>
        capture.table === "answers" &&
        (capture.operation === "select" || capture.operation === "update"),
    );
    expect(answerQueries).toHaveLength(2);
    for (const query of answerQueries) {
      expect(renderWhere(query.where)).toMatchObject({
        sql: expect.stringContaining("`user_id` = ?"),
        params: expect.arrayContaining(["user_a"]),
      });
    }
    expect(
      captures.find(
        (capture) => capture.operation === "insert" && capture.table === "answers",
      )?.values,
    ).toMatchObject({ userId: "user_a" });
    expect(
      captures.find(
        (capture) => capture.operation === "insert" && capture.table === "scores",
      )?.values,
    ).toMatchObject({ userId: "user_a" });
  });

  it("uses a user-scoped score tuple for the unique upsert path", async () => {
    const { db, captures } = createRepositoryDb({ answerId: null, score: null });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    await repo.finalizeAnswer({
      userId: "user_b",
      answerId: "answer_existing",
      expectedRaw: {
        selectedChoiceId: "b",
        confidence: 4,
        reasoning: "Owned raw answer.",
      },
      evaluation: {
        correct: true,
        reasoningQuality: "good",
        feedback: "Correct.",
        scoreDelta: 0.1,
        nextReviewOn: "2026-07-16",
      },
      conceptId: "concept_a",
    });

    const scoreInsert = captures.find(
      (capture) => capture.operation === "insert" && capture.table === "scores",
    );
    expect(scoreInsert).toMatchObject({
      values: {
        userId: "user_b",
        subjectType: "concept",
        subjectId: "concept_a",
      },
      upsert: true,
    });
  });

  it("does not overwrite the raw fields of an already finalized answer", async () => {
    const { db, captures } = createRepositoryDb({
      answerId: "answer_existing",
      score: null,
    });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    await repo.saveRawAnswer("user_a", {
      id: "answer_existing",
      quizDayId: "quiz_a",
      questionId: "question_a",
      selectedChoiceId: "b",
      confidence: 4,
      reasoning: "Resent answer.",
      answeredAt: new Date("2026-07-09T12:00:00.000Z"),
    });

    const answerInsert = captures.find(
      (capture) => capture.operation === "insert" && capture.table === "answers",
    );
    for (const field of [
      "selectedChoiceId",
      "confidence",
      "reasoning",
      "answeredAt",
    ] as const) {
      expect(renderSqlValue(answerInsert?.upsertSet?.[field])).toMatchObject({
        sql: expect.stringContaining("`correct` is null"),
      });
    }
  });

  it("finalizes only the matching raw answer and skips scoring when the conditional update loses", async () => {
    const { db, captures } = createRepositoryDb({
      answerId: "answer_existing",
      score: null,
      finalizationAffectedRows: 0,
    });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    const finalized = await repo.finalizeAnswer({
      userId: "user_a",
      answerId: "answer_existing",
      expectedRaw: {
        selectedChoiceId: "b",
        confidence: 4,
        reasoning: "Expected raw answer.",
      },
      evaluation: {
        correct: true,
        reasoningQuality: "good",
        feedback: "Correct.",
        scoreDelta: 0.1,
        nextReviewOn: "2026-07-16",
      },
      conceptId: "concept_a",
    });

    expect(finalized).toBe(false);
    const answerUpdate = captures.find(
      (capture) => capture.operation === "update" && capture.table === "answers",
    );
    expect(renderWhere(answerUpdate?.where)).toMatchObject({
      sql: expect.stringContaining("`correct` is null"),
      params: expect.arrayContaining([
        "user_a",
        "answer_existing",
        "b",
        4,
        "Expected raw answer.",
      ]),
    });
    expect(captures.some((capture) => capture.table === "scores")).toBe(false);
  });

  it("uses an atomic current-value score delta inside the finalization transaction", async () => {
    const { db, captures, transactions } = createRepositoryDb({
      answerId: "answer_existing",
      score: { id: "score_existing", value: 0.8 },
      finalizationAffectedRows: 1,
    });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    await expect(
      repo.finalizeAnswer({
        userId: "user_a",
        answerId: "answer_existing",
        expectedRaw: {
          selectedChoiceId: "b",
          confidence: 4,
          reasoning: "Owned raw answer.",
        },
        evaluation: {
          correct: true,
          reasoningQuality: "good",
          feedback: "Correct.",
          scoreDelta: 0.1,
          nextReviewOn: "2026-07-16",
        },
        conceptId: "concept_a",
      }),
    ).resolves.toBe(true);

    expect(transactions).toEqual({ committed: 1, rolledBack: 0 });
    expect(
      captures.filter(
        (capture) =>
          capture.table === "scores" &&
          (capture.operation === "select" || capture.operation === "update"),
      ),
    ).toHaveLength(0);
    const scoreInsert = captures.find(
      (capture) => capture.operation === "insert" && capture.table === "scores",
    );
    expect(scoreInsert).toMatchObject({
      values: {
        userId: "user_a",
        subjectType: "concept",
        subjectId: "concept_a",
        value: 0.55,
      },
      upsert: true,
      inTransaction: true,
    });
    expect(renderSqlValue(scoreInsert?.upsertSet?.value)).toMatchObject({
      sql: expect.stringMatching(/`value`\s*\+\s*\?/),
      params: expect.arrayContaining([0.1]),
    });
    expect(
      captures
        .filter(
          (capture) =>
            (capture.operation === "update" && capture.table === "answers") ||
            (capture.operation === "insert" && capture.table === "scores"),
        )
        .every((capture) => capture.inTransaction),
    ).toBe(true);
  });

  it("rolls back finalization when an atomic score write fails", async () => {
    const { db, transactions } = createRepositoryDb({
      answerId: "answer_existing",
      score: null,
      finalizationAffectedRows: 1,
      failScoreInsert: true,
    });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    await expect(
      repo.finalizeAnswer({
        userId: "user_a",
        answerId: "answer_existing",
        expectedRaw: {
          selectedChoiceId: "b",
          confidence: 4,
          reasoning: "Owned raw answer.",
        },
        evaluation: {
          correct: true,
          reasoningQuality: "good",
          feedback: "Correct.",
          scoreDelta: 0.1,
          nextReviewOn: "2026-07-16",
        },
        conceptId: "concept_a",
      }),
    ).rejects.toThrow("score_write_failed");

    expect(transactions).toEqual({ committed: 0, rolledBack: 1 });
  });
});

function createRepositoryDb(input: {
  answerId: string | null;
  score: { id: string; value: number } | null;
  finalizationAffectedRows?: number;
  failScoreInsert?: boolean;
}) {
  const captures: QueryCapture[] = [];
  const transactions = { committed: 0, rolledBack: 0 };
  const rowsFor = (table: unknown) => {
    if (table === answers) return input.answerId ? [{ id: input.answerId }] : [];
    if (table === scores) return input.score ? [input.score] : [];
    return [];
  };
  const createQueryApi = (inTransaction: boolean) => ({
    select() {
      let table: unknown;
      let where: unknown;
      const builder = {
        from(nextTable: unknown) {
          table = nextTable;
          return builder;
        },
        where(nextWhere: unknown) {
          where = nextWhere;
          captures.push({
            operation: "select",
            table: tableName(table),
            where,
            inTransaction,
          });
          return builder;
        },
        limit() {
          return Promise.resolve(rowsFor(table));
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(rowsFor(table)).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
    update(table: unknown) {
      return {
        set(set: Record<string, unknown>) {
          return {
            where(where: unknown) {
              captures.push({
                operation: "update",
                table: tableName(table),
                where,
                set,
                inTransaction,
              });
              return Promise.resolve([
                {
                  affectedRows:
                    table === answers ? (input.finalizationAffectedRows ?? 1) : 1,
                },
              ]);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          const capture: QueryCapture = {
            operation: "insert",
            table: tableName(table),
            values,
            inTransaction,
          };
          captures.push(capture);
          return {
            onDuplicateKeyUpdate(inputUpdate: { set: Record<string, unknown> }) {
              capture.upsert = true;
              capture.upsertSet = inputUpdate.set;
              if (table === scores && input.failScoreInsert) {
                return Promise.reject(new Error("score_write_failed"));
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
  });
  const db = {
    ...createQueryApi(false),
    async transaction<T>(callback: (tx: ReturnType<typeof createQueryApi>) => Promise<T>) {
      try {
        const result = await callback(createQueryApi(true));
        transactions.committed += 1;
        return result;
      } catch (error) {
        transactions.rolledBack += 1;
        throw error;
      }
    },
  };
  return { db, captures, transactions };
}

function tableName(table: unknown): QueryCapture["table"] {
  if (table === answers) return "answers";
  if (table === scores) return "scores";
  if (table === conceptTags) return "concept_tags";
  return "other";
}

function renderWhere(where: unknown) {
  if (!where || typeof where !== "object" || !("getSQL" in where)) {
    throw new Error("missing where condition");
  }
  const query = new MySqlDialect().sqlToQuery(
    (where as { getSQL(): ReturnType<Parameters<MySqlDialect["sqlToQuery"]>[0]["getSQL"]> }).getSQL(),
  );
  return { sql: query.sql, params: query.params };
}

function renderSqlValue(value: unknown) {
  if (!value || typeof value !== "object" || !("getSQL" in value)) {
    throw new Error("missing SQL value");
  }
  const query = new MySqlDialect().sqlToQuery(
    (value as { getSQL(): ReturnType<Parameters<MySqlDialect["sqlToQuery"]>[0]["getSQL"]> }).getSQL(),
  );
  return { sql: query.sql, params: query.params };
}

function answerInput() {
  return {
    userId: "user_a",
    today: "2026-07-09",
    quizDayId: "quiz_user_a_20260709",
    questionId: "question_typescript",
    selectedChoiceId: "b",
    confidence: 5,
    reasoning: "The official source describes this exact behavior.",
  };
}

function createStatefulRepository() {
  let raw: SavedRawAnswer | null = null;
  let evaluation: AnswerEvaluationUpdate | null = null;
  const scoreDeltas: number[] = [];
  const repository = {
    async getQuestion() {
      return {
        id: "question_typescript",
        conceptId: "concept_typescript",
        prompt: "Which answer matches the source?",
        choices: [
          { id: "a", label: "A", correct: false },
          { id: "b", label: "B", correct: true },
        ],
      };
    },
    async findAnswerId() {
      return raw?.id ?? null;
    },
    async saveRawAnswer(_userId: string, next: SavedRawAnswer) {
      if (!raw) {
        raw = { ...next };
        return;
      }
      if (evaluation === null) raw = { ...next };
    },
    async finalizeAnswer(input: {
      expectedRaw: Pick<
        SavedRawAnswer,
        "selectedChoiceId" | "confidence" | "reasoning"
      >;
      evaluation: AnswerEvaluationUpdate;
    }) {
      if (
        !raw ||
        evaluation !== null ||
        raw.selectedChoiceId !== input.expectedRaw.selectedChoiceId ||
        raw.confidence !== input.expectedRaw.confidence ||
        raw.reasoning !== input.expectedRaw.reasoning
      ) {
        return false;
      }
      evaluation = input.evaluation;
      scoreDeltas.push(input.evaluation.scoreDelta);
      return true;
    },
  };
  return {
    repo: repository as unknown as SubmitAnswerRepository,
    scoreDeltas,
    overwriteRaw(
      next: Pick<SavedRawAnswer, "selectedChoiceId" | "confidence" | "reasoning">,
    ) {
      if (!raw) throw new Error("raw answer missing");
      raw = { ...raw, ...next };
    },
    evaluationAttached() {
      return evaluation !== null;
    },
  };
}
