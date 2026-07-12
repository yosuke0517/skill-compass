import { describe, expect, it } from "vitest";

import { getFirstUnansweredIndex, getNextQuestionIndex } from "@/components/quiz/quiz-card-navigator";

type QuestionRecord = { answer: object | null };

describe("quiz card navigator", () => {
  describe("getNextQuestionIndex", () => {
    it("moves to the next question without exceeding the last index", () => {
      expect(getNextQuestionIndex(1, 3, "next")).toBe(2);
      expect(getNextQuestionIndex(2, 3, "next")).toBe(2);
    });

    it("moves to the previous question without going below zero", () => {
      expect(getNextQuestionIndex(1, 3, "previous")).toBe(0);
      expect(getNextQuestionIndex(0, 3, "previous")).toBe(0);
    });

    it("returns zero for an empty question list", () => {
      expect(getNextQuestionIndex(0, 0, "next")).toBe(0);
      expect(getNextQuestionIndex(0, 0, "previous")).toBe(0);
    });
  });

  describe("getFirstUnansweredIndex", () => {
    it("returns the first unanswered question index", () => {
      const questions: QuestionRecord[] = [{ answer: { selectedChoiceId: "a" } }, { answer: null }, { answer: null }];

      expect(getFirstUnansweredIndex(questions)).toBe(1);
    });

    it("returns -1 when every question is answered", () => {
      expect(getFirstUnansweredIndex([{ answer: {} }, { answer: {} }])).toBe(-1);
    });

    it("returns -1 for an empty question list", () => {
      expect(getFirstUnansweredIndex([])).toBe(-1);
    });
  });
});
