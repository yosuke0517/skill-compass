import type { ScoreDelta, ScoreInput } from "./types";

export function calculateScoreDelta(input: ScoreInput): ScoreDelta {
  const confidence = Math.min(5, Math.max(1, input.confidence));
  let delta = input.correct ? 0.06 : -0.04;

  if (input.correct && confidence >= 4 && input.reasoningQuality === "good") delta += 0.05;
  if (input.correct && confidence <= 2) delta -= 0.03;
  if (!input.correct && input.reasoningQuality === "partial") delta += 0.03;
  if (input.misconceptionSeverity === "major") delta -= 0.08;
  if (input.misconceptionSeverity === "minor") delta -= 0.02;

  const reviewSoon = !input.correct || confidence <= 2 || input.misconceptionSeverity !== "none";
  const nextReviewDays = reviewSoon ? 2 : input.correct && confidence >= 4 ? 14 : 7;

  return { delta: Number(delta.toFixed(3)), reviewSoon, nextReviewDays };
}
