import type { MisconceptionSeverity, ReasoningQuality } from "@/lib/scoring/types";

export type LlmEvaluationInput = {
  prompt: string;
  correctChoiceLabel: string;
  selectedChoiceLabel: string;
  reasoning: string;
};

export type LlmEvaluationMetadata = {
  reasoningQuality: ReasoningQuality;
  misconceptionSeverity: MisconceptionSeverity;
  feedback: string;
};

export interface LlmProvider {
  evaluateReasoning(input: LlmEvaluationInput): Promise<LlmEvaluationMetadata>;
}
