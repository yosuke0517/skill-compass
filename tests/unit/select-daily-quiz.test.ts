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
    dueQuestionIds: [],
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

  it("skips inactive prepared legacy questions before filling active slots", () => {
    const selected = selectDailyQuiz(
      selectionInput({
        existingPreparedQuestions: [
          {
            question: makeQuestion(99, { id: "legacy_prepared", active: false }),
            slot: 1,
            reason: "fallback",
          },
        ],
      }),
    );

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.question.id)).not.toContain("legacy_prepared");
  });

  it("keeps weak questions while using nonweak questions to satisfy feasible balance constraints", () => {
    const weakQuestions = Array.from({ length: 5 }, (_, index) =>
      makeQuestion(index, {
        id: `weak_${index}`,
        conceptId: `weak_${index}`,
        categoryId: "backend",
        caseType: "basic_application",
        correctChoiceId: "a",
      }),
    );
    const balancedQuestions = [
      makeQuestion(10, { id: "balanced_frontend", categoryId: "frontend", caseType: "common_failure", correctChoiceId: "b" }),
      makeQuestion(11, { id: "balanced_sql", categoryId: "sql", caseType: "design_tradeoff", correctChoiceId: "c" }),
      makeQuestion(12, { id: "balanced_security", categoryId: "security", caseType: "debugging_performance", correctChoiceId: "d" }),
    ];

    const selected = selectDailyQuiz(
      selectionInput({
        questions: [...weakQuestions, ...balancedQuestions],
        weakConceptIds: weakQuestions.map((question) => question.conceptId),
        recentlyAssignedQuestionIds: [],
      }),
    );

    expect(selected).toHaveLength(5);
    expect(selected.filter((item) => item.question.id.startsWith("weak_")).length).toBe(2);
    expect(maxCount(selected.map((item) => item.question.categoryId))).toBeLessThanOrEqual(2);
    expect(new Set(selected.map((item) => item.question.caseType)).size).toBeGreaterThanOrEqual(4);
    expect(maxCount(selected.map((item) => item.question.correctChoiceId))).toBeLessThanOrEqual(2);
  });

  it("prioritizes due review questions alongside weak concepts", () => {
    const selected = selectDailyQuiz(
      selectionInput({
        weakConceptIds: [],
        dueQuestionIds: ["q9"],
        recentlyAssignedQuestionIds: [],
      }),
    );

    expect(selected.map((item) => item.question.id)).toContain("q9");
  });

  it("keeps a recently assigned due question eligible when fresh alternatives exist", () => {
    const selected = selectDailyQuiz(
      selectionInput({
        weakConceptIds: [],
        dueQuestionIds: ["q9"],
        recentlyAssignedQuestionIds: ["q9"],
      }),
    );

    expect(selected.map((item) => item.question.id)).toContain("q9");
  });

  it("fills all five slots from recent active fallback after using every partial fresh candidate", () => {
    const input = selectionInput({
      recentlyAssignedQuestionIds: Array.from({ length: 20 }, (_, index) => `q${index}`)
        .filter((id) => id !== "q0" && id !== "q1"),
      recentlyAnsweredQuestionIds: [],
      dueQuestionIds: [],
    });

    const selected = selectDailyQuiz(input);

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.question.id)).toEqual(
      expect.arrayContaining(["q0", "q1"]),
    );
    expect(new Set(selected.map((item) => item.question.caseType)).size).toBeGreaterThanOrEqual(4);
    expect(maxCount(selected.map((item) => item.question.categoryId))).toBeLessThanOrEqual(2);
    expect(maxCount(selected.map((item) => item.question.correctChoiceId))).toBeLessThanOrEqual(2);
    expect(selectDailyQuiz(input)).toEqual(selected);
  });

  it("reserves partial fresh candidates inside the bounded pool before recent fallback", () => {
    const questions = Array.from({ length: 70 }, (_, index) => makeQuestion(index));
    const freshIds = ["q68", "q69"];
    const input = selectionInput({
      questions,
      weakConceptIds: questions.slice(0, 40).map((question) => question.conceptId),
      recentlyAssignedQuestionIds: questions
        .map((question) => question.id)
        .filter((id) => !freshIds.includes(id)),
      recentlyAnsweredQuestionIds: [],
      dueQuestionIds: [],
    });

    const selectedIds = selectDailyQuiz(input).map((item) => item.question.id);

    expect(selectedIds).toHaveLength(5);
    expect(selectedIds).toEqual(expect.arrayContaining(freshIds));
  });

  it("reserves balance representatives before homogeneous preferred rows exhaust the bounded pool", () => {
    const homogeneousWeakQuestions = Array.from({ length: 40 }, (_, index) =>
      makeQuestion(index, {
        categoryId: "backend",
        caseType: "basic_application",
        correctChoiceId: "a",
      }),
    );
    const balanceRepresentatives = [
      makeQuestion(40, {
        categoryId: "frontend",
        caseType: "common_failure",
        correctChoiceId: "b",
      }),
      makeQuestion(41, {
        categoryId: "sql",
        caseType: "design_tradeoff",
        correctChoiceId: "c",
      }),
      makeQuestion(42, {
        categoryId: "security",
        caseType: "debugging_performance",
        correctChoiceId: "d",
      }),
      makeQuestion(43, {
        categoryId: "infrastructure",
        caseType: "maintainability_safety",
        correctChoiceId: "b",
      }),
    ];
    const remainingQuestions = Array.from({ length: 26 }, (_, offset) =>
      makeQuestion(offset + 44, {
        categoryId: "backend",
        caseType: "basic_application",
        correctChoiceId: "a",
      }),
    );
    const questions = [
      ...homogeneousWeakQuestions,
      ...balanceRepresentatives,
      ...remainingQuestions,
    ];
    const input = selectionInput({
      questions,
      weakConceptIds: homogeneousWeakQuestions.map((question) => question.conceptId),
      strongConceptIds: [],
      recentlyAssignedQuestionIds: [],
      recentlyAnsweredQuestionIds: [],
      dueQuestionIds: ["q0"],
    });

    const selected = selectDailyQuiz(input);

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.question.id)).toContain("q0");
    expect(selected.filter((item) => item.question.categoryId === "backend")).toHaveLength(2);
    expect(new Set(selected.map((item) => item.question.caseType)).size).toBeGreaterThanOrEqual(4);
    expect(maxCount(selected.map((item) => item.question.categoryId))).toBeLessThanOrEqual(2);
    expect(maxCount(selected.map((item) => item.question.correctChoiceId))).toBeLessThanOrEqual(2);
    expect(selectDailyQuiz(input)).toEqual(selected);
  });

  it("returns a balanced set from a large bank within the bounded search budget", { timeout: 1_000 }, () => {
    const selected = selectDailyQuiz(
      selectionInput({
        questions: Array.from({ length: 70 }, (_, index) =>
          makeQuestion(index, { categoryId: `category_${index}` }),
        ),
        weakConceptIds: [],
        strongConceptIds: [],
        recentlyAssignedQuestionIds: [],
      }),
    );

    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((item) => item.question.caseType)).size).toBeGreaterThanOrEqual(4);
    expect(selected.every((item) => item.question.active !== false)).toBe(true);
  });
});
