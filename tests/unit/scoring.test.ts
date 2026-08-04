import { describe, expect, it } from "vitest";
import { calculateGap } from "@/lib/scoring/gaps";
import { calculateScoreDelta } from "@/lib/scoring/rules";

describe("calculateScoreDelta", () => {
  it("rewards correct answers with good reasoning without confidence", () => {
    expect(calculateScoreDelta({
      correct: true,
      reasoningQuality: "good",
      misconceptionSeverity: "none",
    })).toEqual({ delta: 0.11, reviewSoon: false, nextReviewDays: 14 });
  });

  it("schedules correct partial reasoning for a normal review", () => {
    expect(calculateScoreDelta({
      correct: true,
      reasoningQuality: "partial",
      misconceptionSeverity: "none",
    })).toEqual({ delta: 0.06, reviewSoon: false, nextReviewDays: 7 });
  });

  it("gives partial credit but reviews incorrect partial reasoning soon", () => {
    expect(calculateScoreDelta({
      correct: false,
      reasoningQuality: "partial",
      misconceptionSeverity: "none",
    })).toEqual({ delta: -0.01, reviewSoon: true, nextReviewDays: 2 });
  });

  it("penalizes major misconceptions", () => {
    expect(calculateScoreDelta({
      correct: false,
      reasoningQuality: "poor",
      misconceptionSeverity: "major",
    })).toEqual({ delta: -0.12, reviewSoon: true, nextReviewDays: 2 });
  });
});

describe("calculateGap", () => {
  it("detects overconfidence", () => {
    expect(calculateGap(0.9, 0.5).label).toBe("overconfidence");
  });
});
