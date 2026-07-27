import { describe, expect, it } from "vitest";

import {
  buildTodayQuiz,
  createQuizDayId,
  getDueQuestionIds,
  resolveQuizDayId,
} from "@/lib/quiz/get-today-quiz";

describe("createQuizDayId", () => {
  it("creates a deterministic owner-specific identifier for the same day", () => {
    const quizA = createQuizDayId("user_a", "2026-07-09");
    const quizB = createQuizDayId("user_b", "2026-07-09");

    expect(quizA).toMatch(/^quiz_[a-f0-9]{12}_20260709$/);
    expect(quizA).toBe(createQuizDayId("user_a", "2026-07-09"));
    expect(quizA).not.toBe(quizB);
  });

  it("reuses an owned legacy ID when that user already has the unique quiz date", () => {
    expect(resolveQuizDayId("user_local", "2026-07-09", "quiz_2026-07-09")).toBe(
      "quiz_2026-07-09",
    );
    expect(resolveQuizDayId("user_a", "2026-07-09")).toBe(
      createQuizDayId("user_a", "2026-07-09"),
    );
  });
});

describe("buildTodayQuiz", () => {
  it("marks answered and unanswered prepared questions in slot order", () => {
    const quiz = buildTodayQuiz({
      quizDay: { id: "quiz_2026-07-09", quizDate: "2026-07-09" },
      preparedQuestions: [
        { quizDayId: "quiz_2026-07-09", questionId: "q2", slot: 2, reason: "weakness" },
        { quizDayId: "quiz_2026-07-09", questionId: "q1", slot: 1, reason: "latest_catchup" },
      ],
      questions: [
        {
          id: "q1",
          conceptId: "c1",
          prompt: "Question 1?",
          choices: [{ id: "a", label: "Answer", correct: true }],
          rationale: "Because.",
        },
        {
          id: "q2",
          conceptId: "c2",
          prompt: "Question 2?",
          choices: [{ id: "b", label: "Other", correct: true }],
          rationale: "Because.",
        },
      ],
      answers: [
        {
          quizDayId: "quiz_2026-07-09",
          questionId: "q1",
          selectedChoiceId: "a",
          correct: true,
          feedback: "Correct.",
          scoreDelta: 0.11,
        },
      ],
    });

    expect(quiz.progress).toEqual({ answered: 1, total: 2 });
    expect(quiz.questions.map((item) => item.question.id)).toEqual(["q1", "q2"]);
    expect(quiz.questions[0]?.answer?.feedback).toBe("Correct.");
    expect(quiz.questions[1]?.answer).toBeNull();
  });

  it("keeps an answer with a missing evaluation available for resubmission", () => {
    const quiz = buildTodayQuiz({
      quizDay: { id: "quiz_2026-07-09", quizDate: "2026-07-09" },
      preparedQuestions: [
        { quizDayId: "quiz_2026-07-09", questionId: "q1", slot: 1, reason: "latest_catchup" },
      ],
      questions: [
        {
          id: "q1",
          conceptId: "c1",
          prompt: "Question 1?",
          choices: [{ id: "a", label: "Answer", correct: true }],
          rationale: "Because.",
        },
      ],
      answers: [
        {
          quizDayId: "quiz_2026-07-09",
          questionId: "q1",
          selectedChoiceId: "a",
          correct: null,
          feedback: null,
          scoreDelta: null,
        },
      ],
    });

    expect(quiz.progress).toEqual({ answered: 0, total: 1 });
    expect(quiz.questions[0]?.answer).toBeNull();
  });

  it("does not return inactive prepared legacy questions", () => {
    const quiz = buildTodayQuiz({
      quizDay: { id: "quiz_2026-07-09", quizDate: "2026-07-09" },
      preparedQuestions: [
        { quizDayId: "quiz_2026-07-09", questionId: "legacy", slot: 1, reason: "fallback" },
        { quizDayId: "quiz_2026-07-09", questionId: "active", slot: 2, reason: "weakness" },
      ],
      questions: [
        {
          id: "legacy",
          conceptId: "c_legacy",
          prompt: "Legacy question?",
          choices: [{ id: "a", label: "Answer", correct: true }],
          rationale: "Legacy rationale.",
          active: false,
        },
        {
          id: "active",
          conceptId: "c_active",
          prompt: "Active question?",
          choices: [{ id: "a", label: "Answer", correct: true }],
          rationale: "Active rationale.",
          active: true,
        },
      ],
      answers: [],
    });

    expect(quiz.progress).toEqual({ answered: 0, total: 1 });
    expect(quiz.questions.map((item) => item.question.id)).toEqual(["active"]);
  });

  it("uses only the latest answer for each question when deriving due reviews", () => {
    const dueQuestionIds = getDueQuestionIds(
      [
        { id: "answer_old", questionId: "q1", answeredAt: "2026-07-01T00:00:00.000Z", nextReviewOn: "2026-07-05" },
        { id: "answer_new", questionId: "q1", answeredAt: "2026-07-08T00:00:00.000Z", nextReviewOn: "2026-07-20" },
        { id: "answer_due", questionId: "q2", answeredAt: "2026-07-08T00:00:00.000Z", nextReviewOn: "2026-07-08" },
        { id: "answer_a", questionId: "q3", answeredAt: "2026-07-08T00:00:00.000Z", nextReviewOn: "2026-07-05" },
        { id: "answer_z", questionId: "q3", answeredAt: "2026-07-08T00:00:00.000Z", nextReviewOn: "2026-07-20" },
      ],
      "2026-07-10",
    );

    expect(dueQuestionIds).toEqual(["q2"]);
  });
});
