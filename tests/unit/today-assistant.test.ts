import { describe, expect, it } from "vitest";

import { createGeminiAssistantProvider } from "@/lib/assistant/providers/gemini-assistant-provider";
import {
  buildTodayAssistantInput,
  buildTodayAssistantPrompt,
} from "@/lib/assistant/today-assistant";

describe("today assistant", () => {
  it("projects only stated learner-safe case context before an answer", () => {
    const input = buildTodayAssistantInput(
      "ヒントだけください",
      "2026-07-09",
      { answered: 0, total: 5 },
      [
        {
          slot: 1,
          reason: "weakness",
          question: {
            id: "q1",
            conceptId: "concept_1",
            scenario: "The API must keep existing mobile clients working.",
            artifacts: [
              {
                kind: "api",
                title: "Existing response",
                language: "json",
                content: '{"name":"Ada"}',
              },
            ],
            prompt: "Which change preserves compatibility?",
            choices: [
              {
                id: "a",
                label: "Add an optional field",
                correct: true,
                explanation: "hidden explanation a",
                consequence: "hidden consequence a",
              },
              {
                id: "b",
                label: "Remove name",
                correct: false,
                explanation: "hidden explanation b",
                consequence: "hidden consequence b",
              },
              {
                id: "c",
                label: "Change name to an array",
                correct: false,
                explanation: "hidden explanation c",
                consequence: "hidden consequence c",
              },
              {
                id: "d",
                label: "Require a new request field",
                correct: false,
                explanation: "hidden explanation d",
                consequence: "hidden consequence d",
              },
            ],
            decisionCriteria: ["hidden decision criterion"],
            rationale: "hidden rationale",
            practicalNotes: ["hidden practical note"],
            checkQuestion: "hidden understanding check",
          },
          answer: null,
        },
      ],
    );

    expect(input.questions).toEqual([
      {
        slot: 1,
        scenario: "The API must keep existing mobile clients working.",
        artifacts: [
          {
            kind: "api",
            title: "Existing response",
            language: "json",
            content: '{"name":"Ada"}',
          },
        ],
        prompt: "Which change preserves compatibility?",
        choices: [
          { id: "a", label: "Add an optional field" },
          { id: "b", label: "Remove name" },
          { id: "c", label: "Change name to an array" },
          { id: "d", label: "Require a new request field" },
        ],
        answerFeedback: null,
      },
    ]);

    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("hidden explanation");
    expect(serialized).not.toContain("hidden consequence");
    expect(serialized).not.toContain("hidden decision criterion");
    expect(serialized).not.toContain("hidden rationale");
    expect(serialized).not.toContain("hidden practical note");
    expect(serialized).not.toContain("hidden understanding check");
    expect(serialized).not.toContain('"correct":true');
  });

  it("builds a public-safe prompt from today quiz context", () => {
    const prompt = buildTodayAssistantPrompt({
      userMessage: "ヒントだけください",
      conversation: [
        { role: "user", text: "最後の問題について" },
        { role: "assistant", text: "インデックス設計の問題ですね。" },
      ],
      quizDate: "2026-07-09",
      progress: { answered: 1, total: 5 },
      questions: [
        {
          slot: 1,
          scenario: "Existing mobile clients must remain compatible.",
          artifacts: [
            {
              kind: "api",
              title: "Existing response",
              language: "json",
              content: '{"name":"Ada"}',
            },
          ],
          prompt: "Which API change is most likely to break existing clients?",
          choices: [
            { id: "a", label: "Adding an optional field" },
            { id: "b", label: "Removing a required field" },
          ],
          answerFeedback: "Review the linked source.",
        },
      ],
    });

    expect(prompt).toContain("Skill Compass Today assistant");
    expect(prompt).toContain("Conversation so far:");
    expect(prompt).toContain("User: 最後の問題について");
    expect(prompt).toContain("Assistant: インデックス設計の問題ですね。");
    expect(prompt).toContain("ヒントだけください");
    expect(prompt).toContain("Existing mobile clients must remain compatible.");
    expect(prompt).toContain('{"name":"Ada"}');
    expect(prompt).toContain("Which API change");
    expect(prompt).toContain("a: Adding an optional field");
    expect(prompt).toContain("point to an explicit condition");
    expect(prompt).toContain("never add or assume a missing premise");
    expect(prompt).toContain("never reveal hidden teaching fields");
    expect(prompt).not.toContain("API_KEY");
  });

  it("keeps the full conversation history in the prompt", () => {
    const conversation = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `turn-${index + 1}`,
    }));

    const prompt = buildTodayAssistantPrompt({
      userMessage: "続きです",
      conversation,
      quizDate: "2026-07-09",
      progress: { answered: 1, total: 5 },
      questions: [],
    });

    expect(prompt).toContain("User: turn-1");
    expect(prompt).toContain("Assistant: turn-12");
  });

  it("posts today assistant prompts to Gemini", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const provider = createGeminiAssistantProvider({
      apiKey: async () => "test-api-key",
      model: "gemini-2.5-flash-lite",
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "この問題はAPI契約の互換性を見ています。" }] } }],
          }),
          { status: 200 },
        );
      },
    });

    const result = await provider.ask({
      userMessage: "この問題を説明して",
      conversation: [{ role: "user", text: "前の質問です" }],
      quizDate: "2026-07-09",
      progress: { answered: 1, total: 5 },
      questions: [],
    });

    expect(result).toEqual({
      status: "answered",
      answer: "この問題はAPI契約の互換性を見ています。",
      provider: "gemini",
    });
    expect(requests[0]?.url).toContain("/models/gemini-2.5-flash-lite:generateContent");
    expect(requests[0]?.body).toMatchObject({
      contents: [{ parts: [{ text: expect.stringContaining("この問題を説明して") }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.3 },
    });
  });
});
