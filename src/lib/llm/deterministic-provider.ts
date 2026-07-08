import type { LlmProvider } from "./types";

export const deterministicLlmProvider: LlmProvider = {
  async evaluateReasoning(input) {
    const reasoning = input.reasoning.toLowerCase();
    const selectedCorrect = input.selectedChoiceLabel === input.correctChoiceLabel;

    return {
      reasoningQuality: selectedCorrect && reasoning.length > 20 ? "good" : reasoning.length > 10 ? "partial" : "poor",
      misconceptionSeverity: selectedCorrect ? "none" : reasoning.includes("guess") ? "minor" : "major",
      feedback: selectedCorrect
        ? "Correct. The reasoning is consistent with the expected answer."
        : "Review the linked source and compare the selected answer with the expected behavior.",
    };
  },
};
