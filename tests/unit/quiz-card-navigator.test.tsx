import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizCardNavigator } from "@/components/quiz/quiz-card-navigator";
import type { WebTodayQuizQuestion } from "@/lib/quiz/web-today-quiz";

vi.mock("@/components/assistant/today-assistant-widget", () => ({
  TodayAssistantWidget: () => null,
}));

const questions: WebTodayQuizQuestion[] = [1, 2].map((slot) => ({
  status: "unanswered" as const,
  slot,
  reason: "weakness",
  question: {
    id: `question-${slot}`,
    conceptId: `concept-${slot}`,
    scenario: `Scenario ${slot}`,
    artifacts: [],
    prompt: `Question ${slot}`,
    choices: [
      { id: "a" as const, label: "A" },
      { id: "b" as const, label: "B" },
      { id: "c" as const, label: "C" },
      { id: "d" as const, label: "D" },
    ],
  },
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QuizCardNavigator", () => {
  it("scrolls the newly selected question card to its top", async () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <QuizCardNavigator
        quizDayId="quiz-day-1"
        questions={questions}
        translations={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Question 2" }));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    });
  });

  it("uses instant card-top scrolling when reduced motion is requested", async () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <QuizCardNavigator
        quizDayId="quiz-day-1"
        questions={questions}
        translations={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
    });
  });
});
