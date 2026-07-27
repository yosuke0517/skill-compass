import { describe, expect, it } from "vitest";

import { selectDailyQuiz } from "@/lib/quiz/select-daily-quiz";
import type { QuizSelectionQuestion } from "@/lib/quiz/types";

function makeQuestion(index: number, overrides: Partial<QuizSelectionQuestion> = {}): QuizSelectionQuestion {
  const caseTypes = [
    "basic_application",
    "common_failure",
    "design_tradeoff",
    "debugging_performance",
    "maintainability_safety",
  ] as const;
  const categories = ["frontend", "backend", "sql", "infrastructure", "security"];
  const correctChoiceIds = ["a", "b", "c", "d"];

  return {
    id: `q${index}`,
    conceptId: `concept_${index}`,
    categoryId: categories[index % categories.length] ?? "frontend",
    caseType: caseTypes[(index * 3) % caseTypes.length] ?? "basic_application",
    correctChoiceId: correctChoiceIds[index % correctChoiceIds.length] ?? "a",
    difficulty: "intermediate",
    sourceTrustTier: index === 0 ? "tier1" : "tier2",
    active: true,
    createdAt: `2026-07-${String(index + 1).padStart(2, "0")}`,
    ...overrides,
  };
}

function maxCount(values: string[]): number {
  return Math.max(...Array.from(new Set(values), (value) => values.filter((candidate) => candidate === value).length));
}

function selectionInput(overrides: Partial<Parameters<typeof selectDailyQuiz>[0]> = {}) {
  return {
    userId: "user_a",
    today: "2026-07-08",
    questions: Array.from({ length: 20 }, (_, index) => makeQuestion(index)),
    weakConceptIds: ["concept_1", "concept_5"],
    strongConceptIds: ["concept_2"],
    underrepresentedCategoryIds: [],
    gapCategoryIds: [],
    recentlyAnsweredQuestionIds: [],
    recentlyAssignedQuestionIds: ["q0"],
    ...overrides,
  };
}

describe("selectDailyQuiz", () => {
  it("selects five active questions while balancing case types, categories, and correct choice IDs", () => {
    const selected = selectDailyQuiz(selectionInput());

    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((item) => item.question.id)).size).toBe(5);
    expect(new Set(selected.map((item) => item.question.caseType)).size).toBeGreaterThanOrEqual(4);
    expect(maxCount(selected.map((item) => item.question.categoryId))).toBeLessThanOrEqual(2);
    expect(maxCount(selected.map((item) => item.question.correctChoiceId))).toBeLessThanOrEqual(2);
    expect(selected.map((item) => item.reason)).toContain("weakness");
  });

  it("avoids recently assigned questions when fresh alternatives exist", () => {
    const selected = selectDailyQuiz(selectionInput({ recentlyAssignedQuestionIds: ["q1"] }));

    expect(selected.map((item) => item.question.id)).not.toContain("q1");
  });

  it("is stable for one user and normally differs for another user on the same day", () => {
    const input = selectionInput();
    const selected = selectDailyQuiz(input);

    expect(selectDailyQuiz(input)).toEqual(selected);
    expect(selectDailyQuiz({ ...input, userId: "user_b" })).not.toEqual(selected);
  });

  it("returns fewer than five instead of selecting inactive legacy content", () => {
    const selected = selectDailyQuiz(
      selectionInput({
        questions: [
          makeQuestion(0),
          makeQuestion(1, { active: false }),
          makeQuestion(2, { active: false }),
          makeQuestion(3, { active: false }),
          makeQuestion(4, { active: false }),
          makeQuestion(5, { active: false }),
        ],
        weakConceptIds: ["concept_0"],
        strongConceptIds: [],
        underrepresentedCategoryIds: [],
        gapCategoryIds: [],
      }),
    );

    expect(selected).toHaveLength(1);
    expect(selected.map((item) => item.question.id)).toEqual(["q0"]);
  });
});
