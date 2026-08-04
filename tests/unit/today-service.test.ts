import { describe, expect, it, vi } from "vitest";

import { createQuizDayId } from "@/lib/quiz/get-today-quiz";
import { getTodayForUser, submitTodayForUser } from "@/lib/quiz/today-service";
import type { TodayQuiz, TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";

const quiz: TodayQuiz = {
  quizDayId: "quiz_2026-07-24",
  quizDate: "2026-07-24",
  progress: { answered: 1, total: 5 },
  questions: [
    makeQuizQuestion(1, {
      answer: {
        selectedChoiceId: "a",
        correct: true,
        feedback: "Correct",
        scoreDelta: 0.1,
      },
    }),
    makeQuizQuestion(2, {
      reason: "catch_up",
      question: {
        id: "q2",
        conceptId: "concept_2",
        scenario: "A query is slow under a known access pattern.",
        artifacts: [
          {
            kind: "sql",
            title: "Frequent query",
            language: "sql",
            content: "SELECT * FROM orders WHERE customer_id = ?;",
          },
        ],
        prompt: "Choose the correct index.",
        choices: [
          {
            id: "a",
            label: "Index status alone",
            correct: false,
            explanation: "q2 explanation a: status is not the leading filter.",
            consequence: "q2 consequence a: rows for all customers remain candidates.",
          },
          {
            id: "b",
            label: "Index customer_id",
            correct: true,
            explanation: "q2 explanation b: it matches the explicit equality filter.",
            consequence: "q2 consequence b: the query can seek to one customer's rows.",
          },
          {
            id: "c",
            label: "No index",
            correct: false,
            explanation: "q2 explanation c: the table scan remains.",
            consequence: "q2 consequence c: latency grows with the table.",
          },
          {
            id: "d",
            label: "Index the order ID only",
            correct: false,
            explanation: "q2 explanation d: the query does not filter by order ID.",
            consequence: "q2 consequence d: the new index does not serve this access path.",
          },
        ],
        decisionCriteria: ["q2 decision criterion: customer_id is the equality filter."],
        rationale: "q2 hidden rationale: index the explicit equality filter.",
        practicalNotes: ["q2 practical note: confirm the plan with EXPLAIN."],
        checkQuestion: "q2 check: which column is filtered?",
      },
    }),
    makeQuizQuestion(3),
    makeQuizQuestion(4),
    makeQuizQuestion(5),
  ],
};

describe("getTodayForUser", () => {
  it("projects the next unanswered question without hidden teaching data", async () => {
    const quizWithDatabaseOnlyFields = {
      ...quiz,
      questions: quiz.questions.map((item) => ({
        ...item,
        question: {
          ...item.question,
          artifacts: item.question.artifacts.map((artifact) =>
            Object.assign({}, artifact, {
              databaseOnlyArtifactField: "database-only-artifact-value",
            }),
          ),
          choices: item.question.choices.map((choice) =>
            Object.assign({}, choice, {
              databaseOnlyChoiceField: "database-only-choice-value",
            }),
          ),
        },
      })),
    };
    const result = await getTodayForUser(
      { userId: "user_1", today: "2026-07-24" },
      {
        allowedUserId: "user_1",
        getQuiz: async () => quizWithDatabaseOnlyFields,
      },
    );

    expect(result.nextQuestion).toEqual({
      quizDayId: "quiz_2026-07-24",
      questionId: "q2",
      slot: 2,
      scenario: "A query is slow under a known access pattern.",
      artifacts: [
        {
          kind: "sql",
          title: "Frequent query",
          language: "sql",
          content: "SELECT * FROM orders WHERE customer_id = ?;",
        },
      ],
      prompt: "Choose the correct index.",
      choices: [
        { id: "a", label: "Index status alone" },
        { id: "b", label: "Index customer_id" },
        { id: "c", label: "No index" },
        { id: "d", label: "Index the order ID only" },
      ],
    });

    const serialized = JSON.stringify(result.nextQuestion);
    expect(serialized).not.toContain("correctChoiceId");
    expect(serialized).not.toContain("q2 hidden rationale");
    expect(serialized).not.toContain("q2 decision criterion");
    expect(serialized).not.toContain("q2 explanation a");
    expect(serialized).not.toContain("q2 consequence a");
    expect(serialized).not.toContain("q2 practical note");
    expect(serialized).not.toContain("q2 check");
    expect(JSON.stringify(result)).not.toContain("database-only");
  });

  it("returns all five complete instructor rows for a tool-free Live session", async () => {
    const result = await getTodayForUser(
      { userId: "user_1", today: "2026-07-24" },
      { allowedUserId: "user_1", getQuiz: async () => quiz },
    );

    expect(result).toMatchObject({
      quizDate: "2026-07-24",
      progress: { answered: 1, total: 5 },
      complete: false,
    });
    expect(result.instructorPack).toHaveLength(5);

    for (const row of result.instructorPack) {
      expect(row).toMatchObject({
        quizDayId: "quiz_2026-07-24",
        questionId: expect.any(String),
        slot: expect.any(Number),
        scenario: expect.any(String),
        artifacts: expect.any(Array),
        prompt: expect.any(String),
        correctChoiceId: expect.stringMatching(/^[a-d]$/),
        decisionCriteria: expect.any(Array),
        rationale: expect.any(String),
        practicalNotes: expect.any(Array),
        checkQuestion: expect.any(String),
      });
      expect(row.choices).toHaveLength(4);
      expect(
        row.choices.every(
          (choice) =>
            Boolean(choice.id) &&
            Boolean(choice.label) &&
            Boolean(choice.explanation) &&
            Boolean(choice.consequence),
        ),
      ).toBe(true);
    }

    expect(result.instructorPack[0]?.existingAnswer).toEqual({
      selectedChoiceId: "a",
      correct: true,
      feedback: "Correct",
    });
    expect(result.instructorPack.slice(1).every((row) => row.existingAnswer === null)).toBe(true);
  });

  it("rejects a user other than the configured owner", async () => {
    await expect(
      getTodayForUser(
        { userId: "user_2" },
        { allowedUserId: "user_1", getQuiz: async () => quiz },
      ),
    ).rejects.toThrow("today_forbidden");
  });

  it("loads separate Today assignments for two authenticated users", async () => {
    const getQuiz = vi.fn(async (userId: string, today = "2026-07-24") => ({
      ...quiz,
      quizDayId: createQuizDayId(userId, today),
      quizDate: today,
    }));

    const quizA = await getTodayForUser(
      { userId: "user_a", today: "2026-07-24" },
      { allowedUserId: "user_a", getQuiz },
    );
    const quizB = await getTodayForUser(
      { userId: "user_b", today: "2026-07-24" },
      { allowedUserId: "user_b", getQuiz },
    );

    expect(quizA.nextQuestion?.quizDayId).not.toBe(quizB.nextQuestion?.quizDayId);
    expect(getQuiz).toHaveBeenNthCalledWith(1, "user_a", "2026-07-24");
    expect(getQuiz).toHaveBeenNthCalledWith(2, "user_b", "2026-07-24");
  });
});

function makeQuizQuestion(
  slot: number,
  overrides: Partial<TodayQuizQuestion> = {},
): TodayQuizQuestion {
  const correctId = ["a", "b", "c", "d"][(slot - 1) % 4] as "a" | "b" | "c" | "d";
  const question = {
    id: `q${slot}`,
    conceptId: `concept_${slot}`,
    scenario: `Scenario ${slot} with all stated constraints.`,
    artifacts: [
      {
        kind: "config" as const,
        title: `Configuration ${slot}`,
        language: "text",
        content: `setting_${slot}=enabled`,
      },
    ],
    prompt: `Practical decision ${slot}?`,
    choices: (["a", "b", "c", "d"] as const).map((id) => ({
      id,
      label: `Choice ${id.toUpperCase()} for question ${slot}`,
      correct: id === correctId,
      explanation: `Question ${slot} explanation ${id}.`,
      consequence: `Question ${slot} consequence ${id}.`,
    })),
    decisionCriteria: [`Question ${slot} explicit deciding condition.`],
    rationale: `Question ${slot} rationale grounded in its condition.`,
    practicalNotes: [`Question ${slot} implementation note.`],
    checkQuestion: `Question ${slot} understanding check?`,
    ...overrides.question,
  };

  return {
    slot,
    reason: "weakness",
    answer: null,
    ...overrides,
    question,
  };
}

describe("submitTodayForUser", () => {
  it("uses one configured local day for quiz lookup and direct submission", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T15:30:00.000Z"));
    const observedDays: string[] = [];
    const submitAnswer = vi.fn().mockResolvedValue({
      correct: true,
      reasoningQuality: "strong",
      feedback: "Good reasoning.",
      scoreDelta: { delta: 0.05, nextReviewDays: 7 },
      answerId: "answer_1",
      nextReviewOn: "2026-08-04",
    });

    try {
      await submitTodayForUser(
        {
          userId: "user_1",
          quizDayId: "quiz_2026-07-24",
          questionId: "q2",
          selectedChoiceId: "b",
          confidence: 4,
          reasoning: "The query filters by both leading columns.",
        },
        {
          allowedUserId: "user_1",
          getQuiz: async (_userId, today) => {
            observedDays.push(today ?? "missing");
            return quiz;
          },
          submitAnswer: async (input) => {
            observedDays.push(input.today ?? "missing");
            return submitAnswer(input);
          },
        },
      );
    } finally {
      vi.useRealTimers();
    }

    expect(observedDays).toEqual(["2026-07-28", "2026-07-28"]);
  });

  it("validates the current quiz and delegates to the existing submitter", async () => {
    const submitAnswer = vi.fn().mockResolvedValue({
      correct: true,
      reasoningQuality: "strong",
      feedback: "Good reasoning.",
      scoreDelta: { delta: 0.05, nextReviewDays: 7 },
      answerId: "answer_1",
      nextReviewOn: "2026-07-31",
    });

    const result = await submitTodayForUser(
      {
        userId: "user_1",
        quizDayId: "quiz_2026-07-24",
        questionId: "q2",
        selectedChoiceId: "b",
        reasoning: "The query filters by both leading columns.",
        today: "2026-07-24",
      },
      {
        allowedUserId: "user_1",
        getQuiz: async () => quiz,
        submitAnswer,
      },
    );

    expect(submitAnswer).toHaveBeenCalledWith({
      userId: "user_1",
      quizDayId: "quiz_2026-07-24",
      questionId: "q2",
      selectedChoiceId: "b",
      reasoning: "The query filters by both leading columns.",
      today: "2026-07-24",
    });
    expect(result.feedback).toBe("Good reasoning.");
  });

  it("rejects a choice that is not part of the question", async () => {
    await expect(
      submitTodayForUser(
        {
          userId: "user_1",
          quizDayId: "quiz_2026-07-24",
          questionId: "q2",
          selectedChoiceId: "missing",
          confidence: 3,
          reasoning: "Guess",
          today: "2026-07-24",
        },
        {
          allowedUserId: "user_1",
          getQuiz: async () => quiz,
          submitAnswer: vi.fn(),
        },
      ),
    ).rejects.toThrow("today_choice_not_found");
  });

  it("rejects another user's quiz assignment before submission", async () => {
    const quizAId = createQuizDayId("user_a", "2026-07-24");
    const submitAnswer = vi.fn();

    await expect(
      submitTodayForUser(
        {
          userId: "user_b",
          quizDayId: quizAId,
          questionId: "q2",
          selectedChoiceId: "b",
          confidence: 3,
          reasoning: "Forged owner quiz.",
          today: "2026-07-24",
        },
        {
          allowedUserId: "user_b",
          getQuiz: async (userId, today = "2026-07-24") => ({
            ...quiz,
            quizDayId: createQuizDayId(userId, today),
          }),
          submitAnswer,
        },
      ),
    ).rejects.toThrow("today_quiz_not_found");
    expect(submitAnswer).not.toHaveBeenCalled();
  });
});
