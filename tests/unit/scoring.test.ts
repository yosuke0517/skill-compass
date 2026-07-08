import { describe, expect, it } from "vitest";
import { calculateGap } from "@/lib/scoring/gaps";
import { calculateScoreDelta } from "@/lib/scoring/rules";

describe("calculateScoreDelta", () => {
  it("rewards correct high-confidence good reasoning", () => {
    expect(
      calculateScoreDelta({
        correct: true,
        confidence: 5,
        reasoningQuality: "good",
        misconceptionSeverity: "none",
      }).delta,
    ).toBeGreaterThan(0.08);
  });

  it("keeps correct low-confidence answers as review candidates", () => {
    const result = calculateScoreDelta({
      correct: true,
      confidence: 1,
      reasoningQuality: "partial",
      misconceptionSeverity: "minor",
    });

    expect(result.delta).toBeGreaterThan(0);
    expect(result.reviewSoon).toBe(true);
  });

  it("penalizes major misconceptions", () => {
    expect(
      calculateScoreDelta({
        correct: false,
        confidence: 5,
        reasoningQuality: "poor",
        misconceptionSeverity: "major",
      }).delta,
    ).toBeLessThan(-0.08);
  });
});

describe("calculateGap", () => {
  it("detects overconfidence", () => {
    expect(calculateGap(0.9, 0.5).label).toBe("overconfidence");
  });
});
