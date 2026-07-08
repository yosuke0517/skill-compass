import { describe, expect, it } from "vitest";

import { deterministicLlmProvider } from "@/lib/llm/deterministic-provider";
import type { LlmProvider } from "@/lib/llm/types";
import { evaluateAnswer } from "@/lib/quiz/evaluate-answer";

const question = {
  id: "q1",
  prompt: "Which behavior does the official documentation describe?",
  choices: [
    { id: "a", label: "A", correct: false },
    { id: "b", label: "B", correct: true },
  ],
};

describe("evaluateAnswer", () => {
  it("marks correctness deterministically and attaches score delta", async () => {
    const result = await evaluateAnswer(
      {
        question,
        selectedChoiceId: "b",
        confidence: 5,
        reasoning: "Because the official docs describe this behavior.",
      },
      deterministicLlmProvider,
    );

    expect(result.correct).toBe(true);
    expect(result.correctChoiceId).toBe("b");
    expect(result.reasoningQuality).toBe("good");
    expect(result.misconceptionSeverity).toBe("none");
    expect(result.scoreDelta.delta).toBeGreaterThan(0);
    expect(result.evaluationRetriable).toBe(false);
  });

  it("keeps incorrect answers deterministic even when metadata is supplied", async () => {
    const provider: LlmProvider = {
      async evaluateReasoning() {
        return {
          reasoningQuality: "partial",
          misconceptionSeverity: "major",
          feedback: "Compare the selected answer with the source.",
        };
      },
    };

    const result = await evaluateAnswer(
      {
        question,
        selectedChoiceId: "a",
        confidence: 4,
        reasoning: "I picked this after comparing the available choices.",
      },
      provider,
    );

    expect(result.correct).toBe(false);
    expect(result.scoreDelta.delta).toBeLessThan(0);
    expect(result.feedback).toContain("source");
  });

  it("falls back to retryable metadata when the provider fails", async () => {
    const provider: LlmProvider = {
      async evaluateReasoning() {
        throw new Error("provider unavailable");
      },
    };

    const result = await evaluateAnswer(
      {
        question,
        selectedChoiceId: "b",
        confidence: 3,
        reasoning: "The source points to this answer.",
      },
      provider,
    );

    expect(result.correct).toBe(true);
    expect(result.reasoningQuality).toBe("partial");
    expect(result.misconceptionSeverity).toBe("minor");
    expect(result.evaluationRetriable).toBe(true);
    expect(result.feedback).toMatch(/retry/i);
  });
});
