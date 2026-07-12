import { describe, expect, it } from "vitest";

import { createGeminiChoiceGenerator } from "@/lib/quiz/choice-generator";

describe("Gemini quiz choice generator", () => {
  it("requests grounded JSON choices and validates the result", async () => {
    let requestPrompt = "";
    const generator = createGeminiChoiceGenerator({
      apiKey: "test-key",
      model: "test-model",
      fetch: async (_url, init) => {
        requestPrompt = JSON.stringify(init?.body);
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify([
              { id: "a", label: "A plausible correct answer.", correct: true },
              { id: "b", label: "A plausible misconception.", correct: false },
              { id: "c", label: "A nearby but incorrect answer.", correct: false },
              { id: "d", label: "An unrelated implementation detail.", correct: false },
            ]) }] } }],
          }),
        );
      },
    });

    const choices = await generator.generate({
      prompt: "Which statement is correct?",
      conceptTitle: "MCP",
      conceptSummary: "A protocol for connecting model-powered clients with tools and context providers.",
      rationale: "The boundary makes tool access explicit.",
    });

    expect(choices).toHaveLength(4);
    expect(choices.filter((choice) => choice.correct)).toHaveLength(1);
    expect(requestPrompt).toContain("protocol for connecting model-powered clients");
  });

  it("rejects a response with more than one correct choice", async () => {
    const generator = createGeminiChoiceGenerator({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify([
          { id: "a", label: "First", correct: true },
          { id: "b", label: "Second", correct: true },
          { id: "c", label: "Third", correct: false },
          { id: "d", label: "Fourth", correct: false },
        ]) }] } }],
      })),
    });

    await expect(generator.generate({ prompt: "Question", conceptTitle: "Concept", conceptSummary: "Summary", rationale: "Rationale" })).rejects.toThrow(
      "exactly one correct answer",
    );
  });
});
