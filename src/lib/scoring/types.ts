export type ReasoningQuality = "good" | "partial" | "poor";
export type MisconceptionSeverity = "none" | "minor" | "major";

export type ScoreInput = {
  correct: boolean;
  confidence: number;
  reasoningQuality: ReasoningQuality;
  misconceptionSeverity: MisconceptionSeverity;
};

export type ScoreDelta = {
  delta: number;
  reviewSoon: boolean;
  nextReviewDays: number;
};

export type SkillGap = {
  value: number;
  label: "aligned" | "underconfidence" | "overconfidence";
};
