import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizQuestionCard } from "@/components/quiz/quiz-question-card";

vi.mock("@/app/actions/quiz", () => ({
  submitQuizAnswerAction: vi.fn(),
}));

afterEach(cleanup);

const question = {
  id: "q_web_03",
  conceptId: "concept_web_contract_first",
  scenario:
    "Web and API teams must build in parallel before either implementation is complete.",
  artifacts: [
    {
      kind: "api" as const,
      title: "Contract requirement",
      language: "yaml",
      content: "POST /v1/invoices\nresponses:\n  201: Invoice",
    },
  ],
  prompt: "What should the teams agree on first?",
  choices: [
    {
      id: "a" as const,
      label: "A versioned OpenAPI contract",
      correct: true,
      explanation: "It gives both teams one machine-checkable boundary.",
      consequence: "Both teams can build independently against the same contract.",
    },
    {
      id: "b" as const,
      label: "Internal ORM models",
      correct: false,
      explanation: "Persistence models omit protocol behavior and errors.",
      consequence: "The client becomes coupled to backend storage decisions.",
    },
    {
      id: "c" as const,
      label: "A shared chat thread",
      correct: false,
      explanation: "Chat examples are not exhaustive or machine-verifiable.",
      consequence: "The implementations drift before integration.",
    },
    {
      id: "d" as const,
      label: "Wait until both implementations finish",
      correct: false,
      explanation: "Waiting prevents the required parallel validation.",
      consequence: "Incompatible assumptions are found at integration time.",
    },
  ],
  decisionCriteria: [
    "Provide one machine-readable boundary for mocks, validation, and compatibility tests.",
  ],
  rationale:
    "Parallel implementation requires a versioned, machine-checkable API contract.",
  practicalNotes: ["Run producer and consumer conformance checks in CI."],
  checkQuestion: "What artifact can both teams use without importing each other's code?",
};

const unansweredItem = {
  slot: 1,
  reason: "weakness",
  question,
  answer: null,
};

describe("QuizQuestionCard", () => {
  it("shows the practical scenario and artifacts before the decision prompt without hidden teaching data", () => {
    const { container } = render(
      <QuizQuestionCard quizDayId="quiz_1" item={unansweredItem} />,
    );

    expect(screen.getByText(question.scenario)).toBeTruthy();
    expect(container.querySelector(".question-artifact code")?.textContent).toBe(
      question.artifacts[0].content,
    );
    expect(screen.getByRole("heading", { level: 2, name: question.prompt })).toBeTruthy();
    expect(screen.queryByText(question.rationale)).toBeNull();
    expect(screen.queryByText(question.decisionCriteria[0])).toBeNull();
    expect(screen.queryByText(question.choices[1].explanation)).toBeNull();
    expect(screen.queryByText(question.choices[1].consequence)).toBeNull();
    expect(screen.queryByText(question.practicalNotes[0])).toBeNull();
    expect(screen.queryByText(question.checkQuestion)).toBeNull();

    const text = container.querySelector(".quiz-card")?.textContent ?? "";
    expect(text.indexOf(question.scenario)).toBeLessThan(text.indexOf(question.prompt));
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeTruthy();
    expect(container.querySelector('input[name="confidence"]')).toBeTruthy();
    expect(container.querySelector('textarea[name="reasoning"]')).toBeTruthy();
  });

  it("teaches an answered case in the required review order", () => {
    const { container } = render(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={{
          ...unansweredItem,
          answer: {
            selectedChoiceId: "b",
            correct: false,
            feedback: "Revisit which artifact can be validated by both teams.",
            scoreDelta: -0.08,
          },
        }}
      />,
    );

    const headings = Array.from(
      container.querySelectorAll(".practical-answer-review > section > h3"),
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
      "Result",
      "Decision point",
      "Why",
      "Options",
      "Practical notes",
      "Check your understanding",
    ]);

    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.getByText(question.decisionCriteria[0])).toBeTruthy();
    expect(screen.getByText(question.rationale)).toBeTruthy();
    for (const choice of question.choices) {
      expect(screen.getByText(choice.explanation)).toBeTruthy();
      expect(screen.getByText(choice.consequence)).toBeTruthy();
    }
    expect(screen.getByText(question.practicalNotes[0])).toBeTruthy();
    expect(screen.getByText(question.checkQuestion)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
  });
});
