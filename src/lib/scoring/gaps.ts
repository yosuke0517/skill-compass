import type { SkillGap } from "./types";

export function calculateGap(selfRating: number, measuredScore: number): SkillGap {
  const value = Number((selfRating - measuredScore).toFixed(3));
  if (value >= 0.2) return { value, label: "overconfidence" };
  if (value <= -0.2) return { value, label: "underconfidence" };
  return { value, label: "aligned" };
}
