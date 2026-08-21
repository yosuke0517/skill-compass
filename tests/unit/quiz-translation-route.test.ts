import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  translateTodayQuizQuestion: vi.fn(),
}));

vi.mock("@/lib/access/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));
vi.mock("@/lib/translation/translate-today-question", () => ({
  translateTodayQuizQuestion: mocks.translateTodayQuizQuestion,
}));

import { POST } from "@/app/api/quiz/translation/route";

describe("POST /api/quiz/translation", () => {
  it("returns 503 when the AI translation provider is unavailable", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.translateTodayQuizQuestion.mockResolvedValue({
      questionId: "question-1",
      scenario: null,
      artifacts: [],
      prompt: null,
      choices: [],
      unavailable: true,
      reviewStatus: "hidden",
    });

    const response = await POST(new NextRequest("https://example.com/api/quiz/translation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: "question-1" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "AI translation service is unavailable",
    });
  });
});
