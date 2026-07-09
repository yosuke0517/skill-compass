import { describe, expect, it } from "vitest";

import { selectAdditionalQuizQuestions } from "@/lib/quiz/extend-daily-quiz";
import type { QuizSelectionQuestion } from "@/lib/quiz/types";

const questions: QuizSelectionQuestion[] = Array.from({ length: 40 }, (_, index) => ({
  id: `q${index + 1}`,
  conceptId: `concept_${index + 1}`,
  categoryId: "cat_backend",
  difficulty: "intermediate",
  sourceTrustTier: index % 2 === 0 ? "tier1" : "tier3",
  active: true,
  createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
}));

describe("selectAdditionalQuizQuestions", () => {
  it("adds up to five active questions that are not already prepared", () => {
    const selected = selectAdditionalQuizQuestions({
      questions,
      preparedQuestionIds: ["q1", "q2", "q3", "q4", "q5"],
      currentTotal: 5,
      maxTotal: 30,
      addCount: 5,
    });

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.slot)).toEqual([6, 7, 8, 9, 10]);
    expect(selected.map((item) => item.question.id)).not.toContain("q1");
    expect(selected.every((item) => item.reason === "fallback")).toBe(true);
  });

  it("does not add more questions after the daily limit", () => {
    const selected = selectAdditionalQuizQuestions({
      questions,
      preparedQuestionIds: questions.slice(0, 30).map((question) => question.id),
      currentTotal: 30,
      maxTotal: 30,
      addCount: 5,
    });

    expect(selected).toEqual([]);
  });
});
