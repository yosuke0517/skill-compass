import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";

import { answers, conceptTags, scores } from "@/db/schema";
import { deterministicLlmProvider } from "@/lib/llm/deterministic-provider";
import {
  createDrizzleSubmitAnswerRepository,
  submitAnswer,
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
          feedback: null,
          scoreDelta: null,
          nextReviewOn: null,
        });
      },
      async updateAnswerEvaluation(userId, answerId, evaluation) {
        repositoryUsers.push(userId);
        const saved = savedAnswers.find((answer) => answer.id === answerId);
        if (!saved) throw new Error("answer was not saved first");
        saved.correct = evaluation.correct;
        saved.feedback = evaluation.feedback;
        saved.scoreDelta = evaluation.scoreDelta;
        saved.nextReviewOn = evaluation.nextReviewOn;
      },
      async updateConceptScore(update) {
        repositoryUsers.push(update.userId);
        scoreUpdates.push(update);
      },
    };

    const result = await submitAnswer(
      {
        userId: "user_a",
        today: "2026-07-09",
        quizDayId: "quiz_user_a_20260709",
        questionId: "question_typescript",
        selectedChoiceId: "b",
        confidence: 5,
        reasoning: "The official source describes this exact behavior.",
      },
      repo,
      deterministicLlmProvider,
    );

    expect(savedAnswers).toHaveLength(1);
    expect(savedAnswers[0]?.correct).toBe(true);
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
    expect(repositoryUsers).toEqual(["user_a", "user_a", "user_a", "user_a", "user_a"]);
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
      async updateAnswerEvaluation() {},
      async updateConceptScore() {},
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
      async updateAnswerEvaluation() {},
      async updateConceptScore() {},
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
});

type QueryCapture = {
  operation: "select" | "update" | "insert";
  table: "answers" | "scores" | "concept_tags" | "other";
  where?: unknown;
  values?: Record<string, unknown>;
  upsert?: boolean;
};

describe("createDrizzleSubmitAnswerRepository user isolation", () => {
  it("includes the owner in every answer and existing-score query", async () => {
    const { db, captures } = createRepositoryDb({
      answerId: "answer_existing",
      score: { id: "score_existing", value: 0.45 },
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
    await repo.updateAnswerEvaluation("user_a", "answer_existing", {
      correct: true,
      reasoningQuality: "strong",
      feedback: "Correct.",
      scoreDelta: 0.1,
      nextReviewOn: "2026-07-16",
    });
    await repo.updateConceptScore({
      userId: "user_a",
      subjectType: "concept",
      subjectId: "concept_a",
      delta: 0.1,
    });

    const answerQueries = captures.filter(
      (capture) =>
        capture.table === "answers" &&
        (capture.operation === "select" || capture.operation === "update"),
    );
    const scoreQueries = captures.filter(
      (capture) =>
        capture.table === "scores" &&
        (capture.operation === "select" || capture.operation === "update"),
    );
    expect(answerQueries).toHaveLength(2);
    expect(scoreQueries).toHaveLength(2);
    for (const query of [...answerQueries, ...scoreQueries]) {
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
  });

  it("uses a user-scoped score tuple for the unique upsert path", async () => {
    const { db, captures } = createRepositoryDb({ answerId: null, score: null });
    dbModule.current = db;
    const repo = createDrizzleSubmitAnswerRepository();

    await repo.updateConceptScore({
      userId: "user_b",
      subjectType: "concept",
      subjectId: "concept_a",
      delta: 0.1,
    });

    const scoreSelect = captures.find(
      (capture) => capture.operation === "select" && capture.table === "scores",
    );
    const scoreInsert = captures.find(
      (capture) => capture.operation === "insert" && capture.table === "scores",
    );
    expect(renderWhere(scoreSelect?.where)).toMatchObject({
      sql: expect.stringContaining("`user_id` = ?"),
      params: expect.arrayContaining(["user_b", "concept", "concept_a"]),
    });
    expect(scoreInsert).toMatchObject({
      values: {
        userId: "user_b",
        subjectType: "concept",
        subjectId: "concept_a",
      },
      upsert: true,
    });
  });
});

function createRepositoryDb(input: {
  answerId: string | null;
  score: { id: string; value: number } | null;
}) {
  const captures: QueryCapture[] = [];
  const rowsFor = (table: unknown) => {
    if (table === answers) return input.answerId ? [{ id: input.answerId }] : [];
    if (table === scores) return input.score ? [input.score] : [];
    return [];
  };
  const db = {
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
          captures.push({ operation: "select", table: tableName(table), where });
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
        set() {
          return {
            where(where: unknown) {
              captures.push({ operation: "update", table: tableName(table), where });
              return Promise.resolve();
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
          };
          captures.push(capture);
          return {
            onDuplicateKeyUpdate() {
              capture.upsert = true;
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, captures };
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
