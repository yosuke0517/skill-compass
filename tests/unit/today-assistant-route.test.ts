import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  getTodayQuiz: vi.fn(),
}));

vi.mock("@/lib/assistant/provider", () => ({
  getAssistantProvider: () => ({ ask: mocks.ask }),
}));

vi.mock("@/lib/quiz/get-today-quiz", () => ({
  getTodayQuiz: mocks.getTodayQuiz,
}));

import { POST } from "@/app/api/assistant/today/route";

describe("POST /api/assistant/today", () => {
  it("builds provider input with only the requested active question", async () => {
    mocks.getTodayQuiz.mockResolvedValue({
      quizDate: "2026-07-12",
      progress: { answered: 1, total: 2 },
      questions: [
        {
          slot: 1,
          question: {
            id: "question-one",
            prompt: "Which API change is compatible?",
            choices: [{ label: "Add an optional field" }],
          },
          answer: null,
        },
        {
          slot: 2,
          question: {
            id: "question-two",
            prompt: "Which API change breaks clients?",
            choices: [{ label: "Remove a required field" }],
          },
          answer: { feedback: "Review the client contract." },
        },
      ],
    });
    mocks.ask.mockResolvedValue({ status: "answered", answer: "Focus on required fields.", provider: "test" });

    const response = await POST(
      new Request("http://localhost/api/assistant/today", {
        method: "POST",
        body: JSON.stringify({ message: "Explain this question", questionId: "question-two" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          expect.objectContaining({
            slot: 2,
            prompt: "Which API change breaks clients?",
          }),
        ],
      }),
    );
  });
});
