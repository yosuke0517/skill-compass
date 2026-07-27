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
              {
                id: "a",
                label: "A plausible correct answer.",
                correct: true,
                explanation: "It matches the protocol boundary described in the source.",
                consequence: "The client can discover and invoke a bounded capability.",
              },
              {
                id: "b",
                label: "A plausible misconception.",
                correct: false,
                explanation: "It confuses protocol interoperability with unrestricted authorization.",
                consequence: "The client would receive more authority than the task requires.",
              },
              {
                id: "c",
                label: "A nearby but incorrect answer.",
                correct: false,
                explanation: "It describes model quality rather than a tool protocol.",
                consequence: "Tool discovery remains undefined.",
              },
              {
                id: "d",
                label: "An unrelated implementation detail.",
                correct: false,
                explanation: "It belongs to application storage, not the MCP boundary.",
                consequence: "The proposed detail does not connect clients to tools.",
              },
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
    expect(choices[0]).toMatchObject({
      explanation: "It matches the protocol boundary described in the source.",
      consequence: "The client can discover and invoke a bounded capability.",
    });
    expect(requestPrompt).toContain("protocol for connecting model-powered clients");
    expect(requestPrompt).toContain("explanation");
    expect(requestPrompt).toContain("consequence");
  });

  it("rejects a response with more than one correct choice", async () => {
    const generator = createGeminiChoiceGenerator({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify([
          { id: "a", label: "First", correct: true, explanation: "First reason", consequence: "First result" },
          { id: "b", label: "Second", correct: true, explanation: "Second reason", consequence: "Second result" },
          { id: "c", label: "Third", correct: false, explanation: "Third reason", consequence: "Third result" },
          { id: "d", label: "Fourth", correct: false, explanation: "Fourth reason", consequence: "Fourth result" },
        ]) }] } }],
      })),
    });

    await expect(generator.generate({ prompt: "Question", conceptTitle: "Concept", conceptSummary: "Summary", rationale: "Rationale" })).rejects.toThrow(
      "exactly one correct answer",
    );
  });

  it.each(["explanation", "consequence"] as const)("rejects a choice with an empty %s", async (field) => {
    const responseChoices = [
      { id: "a", label: "First", correct: true, explanation: "First reason", consequence: "First result" },
      { id: "b", label: "Second", correct: false, explanation: "Second reason", consequence: "Second result" },
      { id: "c", label: "Third", correct: false, explanation: "Third reason", consequence: "Third result" },
      { id: "d", label: "Fourth", correct: false, explanation: "Fourth reason", consequence: "Fourth result" },
    ];
    responseChoices[2][field] = " ";
    const generator = createGeminiChoiceGenerator({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(responseChoices) }] } }],
      })),
    });

    await expect(generator.generate({
      prompt: "Question",
      conceptTitle: "Concept",
      conceptSummary: "Summary",
      rationale: "Rationale",
    })).rejects.toThrow("invalid shape");
  });
});
