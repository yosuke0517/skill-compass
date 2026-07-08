import { describe, expect, it } from "vitest";

import { selectDailyQuiz } from "@/lib/quiz/select-daily-quiz";
import type { QuizSelectionQuestion } from "@/lib/quiz/types";

function makeQuestion(index: number, overrides: Partial<QuizSelectionQuestion> = {}): QuizSelectionQuestion {
  return {
    id: `q${index}`,
    conceptId: `c${index}`,
    categoryId: index < 4 ? "frontend" : index < 8 ? "backend" : "sql",
    difficulty: "intermediate",
    sourceTrustTier: index === 0 ? "tier1" : "tier2",
    active: true,
    createdAt: `2026-07-${String(index + 1).padStart(2, "0")}`,
    ...overrides,
  };
}

describe("selectDailyQuiz", () => {
  it("selects five questions with required reason mix when available", () => {
    const selected = selectDailyQuiz({
      today: "2026-07-08",
      questions: Array.from({ length: 12 }, (_, index) => makeQuestion(index)),
      weakConceptIds: ["c0", "c1"],
      strongConceptIds: ["c2"],
      underrepresentedCategoryIds: ["sql"],
      gapCategoryIds: ["backend"],
      recentlyAnsweredQuestionIds: [],
    });

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.reason)).toEqual([
      "weakness",
      "weakness",
      "strength_extension",
      "latest_catchup",
      "balancing",
    ]);
    expect(new Set(selected.map((item) => item.question.id)).size).toBe(5);
  });

  it("avoids recently answered questions when alternatives exist", () => {
    const selected = selectDailyQuiz({
      today: "2026-07-08",
      questions: [
        makeQuestion(0),
        makeQuestion(1, { id: "q1_fresh", conceptId: "c1" }),
        makeQuestion(2),
        makeQuestion(3),
        makeQuestion(4),
        makeQuestion(5),
        makeQuestion(6),
      ],
      weakConceptIds: ["c0", "c1"],
      strongConceptIds: ["c2"],
      underrepresentedCategoryIds: ["backend"],
      gapCategoryIds: [],
      recentlyAnsweredQuestionIds: ["q0", "q2", "q4"],
    });

    expect(selected.map((item) => item.question.id)).not.toContain("q0");
    expect(selected.map((item) => item.question.id)).not.toContain("q2");
    expect(selected.map((item) => item.question.id)).toContain("q1_fresh");
  });

  it("reuses existing prepared questions when a slot cannot be filled", () => {
    const selected = selectDailyQuiz({
      today: "2026-07-08",
      questions: [makeQuestion(0), makeQuestion(1), makeQuestion(2)],
      existingPreparedQuestions: [
        { question: makeQuestion(10), slot: 4, reason: "balancing" },
        { question: makeQuestion(11), slot: 5, reason: "fallback" },
      ],
      weakConceptIds: ["c0"],
      strongConceptIds: [],
      underrepresentedCategoryIds: [],
      gapCategoryIds: [],
      recentlyAnsweredQuestionIds: [],
    });

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.question.id)).toContain("q10");
    expect(selected.map((item) => item.question.id)).toContain("q11");
  });
});
