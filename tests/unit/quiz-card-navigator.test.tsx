import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.useRealTimers();
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QuizCardNavigator", () => {
  it("restores a submitted answer motion briefly in the visible card", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    window.sessionStorage.setItem(
      "skill-compass:pending-quiz-answer:quiz-day-1",
      "question-1",
    );

    const answeredQuestions: WebTodayQuizQuestion[] = [
      {
        ...questions[0],
        status: "answered",
        answer: {
          selectedChoiceId: "a",
          correct: true,
          confidence: null,
          reasoning: null,
          feedback: "Feedback",
        },
        question: {
          ...questions[0].question,
          choices: questions[0].question.choices.map((choice) => ({
            ...choice,
            correct: choice.id === "a",
            explanation: "Explanation",
            consequence: "Consequence",
          })),
          decisionKey: "Decision key",
          decisionCriteria: ["Decision criterion"],
          rationale: "Rationale",
          practicalNotes: ["Practical note"],
          checkQuestion: "Check?",
        },
      },
      questions[1],
    ];

    render(
      <QuizCardNavigator
        quizDayId="quiz-day-1"
        questions={answeredQuestions}
        translations={{}}
      />,
    );

    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(screen.getByRole("status", { name: "Correct answer" })).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(1_600));
    expect(screen.queryByRole("status", { name: "Correct answer" })).toBeNull();
  });

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
