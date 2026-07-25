import { describe, expect, it, vi } from "vitest";

import { getTodayForUser, submitTodayForUser } from "@/lib/quiz/today-service";
import type { TodayQuiz } from "@/lib/quiz/get-today-quiz";

const quiz: TodayQuiz = {
  quizDayId: "quiz_2026-07-24",
  quizDate: "2026-07-24",
  progress: { answered: 1, total: 2 },
  questions: [
    {
      slot: 1,
      reason: "weakness",
      question: {
        id: "q1",
        conceptId: "concept_1",
        prompt: "Answered question",
        choices: [{ id: "a", label: "A", correct: true }],
        rationale: "Hidden rationale",
      },
      answer: {
        selectedChoiceId: "a",
        correct: true,
        feedback: "Correct",
        scoreDelta: 0.1,
      },
    },
    {
      slot: 2,
      reason: "catch_up",
      question: {
        id: "q2",
        conceptId: "concept_2",
        prompt: "Choose the correct index.",
        choices: [
          { id: "b", label: "Composite index", correct: true },
          { id: "c", label: "No index", correct: false },
        ],
        rationale: "A composite index matches the query.",
      },
      answer: null,
    },
  ],
};

describe("getTodayForUser", () => {
  it("returns a complete instructor pack for a tool-free Live session", async () => {
    const result = await getTodayForUser(
      { userId: "user_1", today: "2026-07-24" },
      { allowedUserId: "user_1", getQuiz: async () => quiz },
    );

    expect(result).toEqual({
      quizDate: "2026-07-24",
      progress: { answered: 1, total: 2 },
      complete: false,
      nextQuestion: {
        quizDayId: "quiz_2026-07-24",
        questionId: "q2",
        slot: 2,
        prompt: "Choose the correct index.",
        choices: [
          { id: "b", label: "Composite index" },
          { id: "c", label: "No index" },
        ],
      },
      instructorPack: [
        {
          quizDayId: "quiz_2026-07-24",
          questionId: "q1",
          slot: 1,
          prompt: "Answered question",
          choices: [{ id: "a", label: "A" }],
          correctChoiceId: "a",
          rationale: "Hidden rationale",
          existingAnswer: {
            selectedChoiceId: "a",
            correct: true,
            feedback: "Correct",
          },
        },
        {
          quizDayId: "quiz_2026-07-24",
          questionId: "q2",
          slot: 2,
          prompt: "Choose the correct index.",
          choices: [
            { id: "b", label: "Composite index" },
            { id: "c", label: "No index" },
          ],
          correctChoiceId: "b",
          rationale: "A composite index matches the query.",
          existingAnswer: null,
        },
      ],
    });
  });

  it("rejects a user other than the configured owner", async () => {
    await expect(
      getTodayForUser(
        { userId: "user_2" },
        { allowedUserId: "user_1", getQuiz: async () => quiz },
      ),
    ).rejects.toThrow("today_forbidden");
  });
});

describe("submitTodayForUser", () => {
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
        confidence: 4,
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
      quizDayId: "quiz_2026-07-24",
      questionId: "q2",
      selectedChoiceId: "b",
      confidence: 4,
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
});
