import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TodayAssistantWidget } from "@/components/assistant/today-assistant-widget";
import { QuizTranslationPanel } from "@/components/quiz/quiz-translation-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI unavailable UI", () => {
  it("shows a clear Japanese translation service error", () => {
    render(<QuizTranslationPanel translation={{
      questionId: "question-1",
      scenario: null,
      artifacts: [],
      prompt: null,
      choices: [],
      unavailable: true,
      reviewStatus: "hidden",
    }} />);

    expect(screen.getByRole("alert").textContent).toBe(
      "翻訳を利用できません。AI設定または通信状態を確認してください。",
    );
  });

  it("shows a clear AI connection error instead of a fallback answer", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Gemini assistant request failed." }),
      { status: 503, headers: { "content-type": "application/json" } },
    )));

    render(<TodayAssistantWidget questionId="question-1" />);
    fireEvent.click(screen.getByLabelText("Open Today assistant"));
    fireEvent.change(screen.getByLabelText("Ask the Today assistant"), {
      target: { value: "ヒントをください" },
    });
    fireEvent.click(screen.getByLabelText("Send question"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Today coachを利用できません。AIサービスへの接続に失敗しました。",
      );
    });
  });

  it("treats an empty assistant response as an AI service error", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({}),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    render(<TodayAssistantWidget questionId="question-1" />);
    fireEvent.click(screen.getByLabelText("Open Today assistant"));
    fireEvent.change(screen.getByLabelText("Ask the Today assistant"), {
      target: { value: "ヒントをください" },
    });
    fireEvent.click(screen.getByLabelText("Send question"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Today coachを利用できません。AIサービスへの接続に失敗しました。",
      );
    });
  });
});
