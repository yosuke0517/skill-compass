import { describe, expect, it } from "vitest";

import {
  getClampedQuestionIndex,
  getFirstUnansweredIndex,
  getNextQuestionIndex,
} from "@/components/quiz/quiz-card-navigation";

type QuestionRecord = { status: "answered" | "unanswered" };

describe("quiz card navigator", () => {
  describe("getClampedQuestionIndex", () => {
    it("clamps a stored selection to the last available question", () => {
      expect(getClampedQuestionIndex(4, 2)).toBe(1);
      expect(getClampedQuestionIndex(1, 0)).toBe(0);
    });
  });

  describe("getNextQuestionIndex", () => {
    it("moves to the next question and wraps from the last card when needed", () => {
      const questions: QuestionRecord[] = [
        { status: "unanswered" },
        { status: "unanswered" },
        { status: "unanswered" },
      ];

      expect(getNextQuestionIndex(1, questions)).toBe(2);
      expect(getNextQuestionIndex(2, questions)).toBe(0);
    });

    it("wraps from the last card to an earlier unanswered question", () => {
      const questions: QuestionRecord[] = [
        { status: "answered" },
        { status: "unanswered" },
        { status: "answered" },
      ];

      expect(getNextQuestionIndex(2, questions)).toBe(1);
    });

    it("keeps the last card selected when no distinct unanswered question exists", () => {
      expect(getNextQuestionIndex(1, [{ status: "answered" }, { status: "answered" }])).toBe(1);
      expect(getNextQuestionIndex(0, [])).toBe(0);
    });
  });

  describe("getFirstUnansweredIndex", () => {
    it("returns the first unanswered question index", () => {
      const questions: QuestionRecord[] = [
        { status: "answered" },
        { status: "unanswered" },
        { status: "unanswered" },
      ];

      expect(getFirstUnansweredIndex(questions)).toBe(1);
    });

    it("returns -1 when every question is answered", () => {
      expect(getFirstUnansweredIndex([{ status: "answered" }, { status: "answered" }])).toBe(-1);
    });

    it("returns -1 for an empty question list", () => {
      expect(getFirstUnansweredIndex([])).toBe(-1);
    });
  });
});
