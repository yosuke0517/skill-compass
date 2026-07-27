import { describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("@/db/client", () => ({
  db: { select: selectMock },
}));

import {
  appendAdditionalQuizQuestions,
  getActivePreparedQuestionState,
  selectAdditionalQuizQuestions,
} from "@/lib/quiz/extend-daily-quiz";
import { quizDays } from "@/db/schema";
import type { QuizSelectionQuestion } from "@/lib/quiz/types";

const questions: QuizSelectionQuestion[] = Array.from({ length: 40 }, (_, index) => ({
  id: `q${index + 1}`,
  conceptId: `concept_${index + 1}`,
  categoryId: "cat_backend",
  caseType: "basic_application",
  correctChoiceId: "a",
  difficulty: "intermediate",
  sourceTrustTier: index % 2 === 0 ? "tier1" : "tier3",
  active: true,
  createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
}));

describe("selectAdditionalQuizQuestions", () => {
  it("extends five visible practical assignments to thirty without counting preserved legacy rows", () => {
    const legacyRows = Array.from({ length: 5 }, (_, index) => ({
      questionId: `legacy_${index + 1}`,
      active: false,
    }));
    const preparedRows = [
      ...legacyRows,
      ...questions.slice(0, 5).map((question) => ({
        questionId: question.id,
        active: true,
      })),
    ];

    for (let batch = 0; batch < 5; batch += 1) {
      const state = getActivePreparedQuestionState(preparedRows);
      const selected = selectAdditionalQuizQuestions({
        questions,
        preparedQuestionIds: state.questionIds,
        currentTotal: state.total,
      });
      preparedRows.push(
        ...selected.map((item) => ({
          questionId: item.question.id,
          active: true,
        })),
      );
    }

    const finalState = getActivePreparedQuestionState(preparedRows);
    expect(finalState.total).toBe(30);
    expect(preparedRows.filter((row) => row.active === false)).toEqual(
      legacyRows,
    );
    expect(
      selectAdditionalQuizQuestions({
        questions,
        preparedQuestionIds: finalState.questionIds,
        currentTotal: finalState.total,
      }),
    ).toEqual([]);
  });

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

  it("never appends inactive legacy questions", () => {
    const selected = selectAdditionalQuizQuestions({
      questions: [
        { ...questions[0]!, active: false },
        { ...questions[1]!, active: false },
        { ...questions[2]!, active: false },
      ],
      preparedQuestionIds: [],
      currentTotal: 0,
    });

    expect(selected).toEqual([]);
  });
});

describe("appendAdditionalQuizQuestions", () => {
  it("counts only active joined assignments at the cap and stays idempotent", async () => {
    const preparedRows = [
      ...Array.from({ length: 5 }, (_, index) => ({
        questionId: `legacy_${index + 1}`,
        active: false,
      })),
      ...questions.slice(0, 30).map((question) => ({
        questionId: question.id,
        active: true,
      })),
    ];
    selectMock.mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === quizDays) {
          return {
            where: () => ({
              limit: async () => [{ id: "quiz_user_a" }],
            }),
          };
        }
        return {
          where: async () => preparedRows,
          innerJoin: () => ({
            where: async () => preparedRows,
          }),
        };
      },
    }));

    await expect(
      appendAdditionalQuizQuestions("user_a", "quiz_user_a"),
    ).resolves.toEqual({ added: 0, total: 30, limit: 30 });
    await expect(
      appendAdditionalQuizQuestions("user_a", "quiz_user_a"),
    ).resolves.toEqual({ added: 0, total: 30, limit: 30 });
  });

  it("rejects a quiz day owned by another user before reading assignments", async () => {
    selectMock.mockImplementation(() => ({
      from: (table: unknown) => {
        expect(table).toBe(quizDays);
        return {
          where: () => ({ limit: async () => [] }),
        };
      },
    }));

    await expect(appendAdditionalQuizQuestions("user_b", "quiz_user_a")).rejects.toThrow("quiz_not_found");
  });
});
