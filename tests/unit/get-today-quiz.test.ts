import { describe, expect, it } from "vitest";

import { buildTodayQuiz } from "@/lib/quiz/get-today-quiz";

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
});
