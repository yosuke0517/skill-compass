import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizCardNavigator } from "@/components/quiz/quiz-card-navigator";
import type { WebTodayQuizQuestion } from "@/lib/quiz/web-today-quiz";

const actionMocks = vi.hoisted(() => ({
  submitQuizAnswerAction: vi.fn(),
}));

vi.mock("@/app/actions/quiz", () => ({
  submitQuizAnswerAction: actionMocks.submitQuizAnswerAction,
}));

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
  vi.restoreAllMocks();
  actionMocks.submitQuizAnswerAction.mockReset();
  vi.unstubAllGlobals();
});

describe("QuizCardNavigator", () => {
  it("updates the active card and starts result motion from the client action result", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const unanswered = questions[0];
    if (unanswered.status !== "unanswered") throw new Error("unanswered fixture required");
    const answered = {
      ...unanswered,
      status: "answered" as const,
      question: {
        ...unanswered.question,
        choices: unanswered.question.choices.map((choice) => ({
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
      answer: {
        selectedChoiceId: "a",
        correct: true,
        confidence: null,
        reasoning: null,
        feedback: "Feedback",
      },
    };
    actionMocks.submitQuizAnswerAction.mockResolvedValue({ status: "success", item: answered });

    render(
      <QuizCardNavigator quizDayId="quiz-day-1" questions={questions} translations={{}} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Correct answer" })).toBeTruthy();
      expect(screen.getByLabelText("Answer review")).toBeTruthy();
      expect(screen.getByText("1 answered, 1 unanswered")).toBeTruthy();
    });
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
