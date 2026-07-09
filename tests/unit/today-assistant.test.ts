import { describe, expect, it } from "vitest";

import { createGeminiAssistantProvider } from "@/lib/assistant/providers/gemini-assistant-provider";
import { buildTodayAssistantPrompt } from "@/lib/assistant/today-assistant";

describe("today assistant", () => {
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
          prompt: "Which API change is most likely to break existing clients?",
          choices: ["Adding an optional field", "Removing a required field"],
          answerFeedback: "Review the linked source.",
        },
      ],
    });

    expect(prompt).toContain("Skill Compass Today assistant");
    expect(prompt).toContain("Conversation so far:");
    expect(prompt).toContain("User: 最後の問題について");
    expect(prompt).toContain("Assistant: インデックス設計の問題ですね。");
    expect(prompt).toContain("ヒントだけください");
    expect(prompt).toContain("Which API change");
    expect(prompt).not.toContain("API_KEY");
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
