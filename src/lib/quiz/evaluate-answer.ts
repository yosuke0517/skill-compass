import type { LlmEvaluationMetadata, LlmProvider } from "@/lib/llm/types";
import { calculateScoreDelta } from "@/lib/scoring/rules";
import type { ScoreDelta } from "@/lib/scoring/types";

export type EvaluatableChoice = {
  id: string;
  label: string;
  correct: boolean;
};

export type EvaluatableQuestion = {
  id: string;
  prompt?: string;
  choices: EvaluatableChoice[];
};

export type EvaluateAnswerInput = {
  question: EvaluatableQuestion;
  selectedChoiceId: string;
  confidence: number;
  reasoning: string;
};

export type EvaluatedAnswer = LlmEvaluationMetadata & {
  correct: boolean;
  correctChoiceId: string;
  selectedChoiceId: string;
  scoreDelta: ScoreDelta;
  evaluationRetriable: boolean;
};

const providerFailureMetadata: LlmEvaluationMetadata = {
  reasoningQuality: "partial",
  misconceptionSeverity: "minor",
  feedback: "Reasoning evaluation could not complete. The answer was saved and can retry later.",
};

export async function evaluateAnswer(input: EvaluateAnswerInput, provider: LlmProvider): Promise<EvaluatedAnswer> {
  const correctChoice = input.question.choices.find((choice) => choice.correct);
  if (!correctChoice) {
    throw new Error(`Question ${input.question.id} does not have a correct choice.`);
  }

  const selectedChoice = input.question.choices.find((choice) => choice.id === input.selectedChoiceId);
  if (!selectedChoice) {
    throw new Error(`Selected choice ${input.selectedChoiceId} was not found for question ${input.question.id}.`);
  }

  const correct = selectedChoice.id === correctChoice.id;
  let evaluationRetriable = false;
  let metadata: LlmEvaluationMetadata;

  try {
    metadata = await provider.evaluateReasoning({
      prompt: input.question.prompt ?? "",
      correctChoiceLabel: correctChoice.label,
      selectedChoiceLabel: selectedChoice.label,
      reasoning: input.reasoning,
    });
  } catch {
    evaluationRetriable = true;
    metadata = providerFailureMetadata;
  }

  return {
    correct,
    correctChoiceId: correctChoice.id,
    selectedChoiceId: selectedChoice.id,
    ...metadata,
    scoreDelta: calculateScoreDelta({
      correct,
      confidence: input.confidence,
      reasoningQuality: metadata.reasoningQuality,
      misconceptionSeverity: metadata.misconceptionSeverity,
    }),
    evaluationRetriable,
  };
}
