import { describe, expect, it } from "vitest";

import type { TodayQuizQuestion } from "@/lib/quiz/get-today-quiz";
import { toWebTodayQuizQuestions } from "@/lib/quiz/web-today-quiz";

const fullQuestion: TodayQuizQuestion["question"] = {
  id: "q_web_03",
  conceptId: "concept_web_contract_first",
  scenario: "Two teams need a machine-checkable boundary before implementation.",
  artifacts: [
    {
      kind: "api",
      title: "Contract",
      language: "yaml",
      content: "POST /v1/invoices",
    },
  ],
  prompt: "What should they agree on first?",
  choices: [
    {
      id: "a",
      label: "A versioned OpenAPI contract",
      correct: true,
      explanation: "It supports independent conformance tests.",
      consequence: "Both teams can work against one boundary.",
    },
    {
      id: "b",
      label: "Internal ORM models",
      correct: false,
      explanation: "Persistence types omit protocol behavior.",
      consequence: "The frontend becomes coupled to storage.",
    },
    {
      id: "c",
      label: "A chat thread",
      correct: false,
      explanation: "Prose is not machine-verifiable.",
      consequence: "The implementations drift.",
    },
    {
      id: "d",
      label: "Wait for integration",
      correct: false,
      explanation: "Waiting prevents parallel validation.",
      consequence: "Incompatibilities surface late.",
    },
  ],
  decisionCriteria: ["Both teams need one machine-readable contract."],
  rationale: "The stated parallel work requires a versioned protocol artifact.",
  practicalNotes: ["Run producer and consumer contract checks in CI."],
  checkQuestion: "Which artifact can generate mocks?",
};

function todayItem(answer: TodayQuizQuestion["answer"]): TodayQuizQuestion {
  return {
    slot: 1,
    reason: "weakness",
    question: fullQuestion,
    answer,
  };
}

describe("toWebTodayQuizQuestions", () => {
  it("serializes an unanswered card without answer or review data", () => {
    const [item] = toWebTodayQuizQuestions([todayItem(null)]);
    const json = JSON.stringify(item);

    expect(item).toEqual({
      status: "unanswered",
      slot: 1,
      reason: "weakness",
      question: {
        id: fullQuestion.id,
        conceptId: fullQuestion.conceptId,
        scenario: fullQuestion.scenario,
        artifacts: fullQuestion.artifacts,
        prompt: fullQuestion.prompt,
        choices: fullQuestion.choices.map(({ id, label }) => ({ id, label })),
      },
    });
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('"correct"');
    expect(json).not.toContain("explanation");
    expect(json).not.toContain("consequence");
    expect(json).not.toContain("decisionCriteria");
    expect(json).not.toContain(fullQuestion.rationale);
    expect(json).not.toContain(fullQuestion.practicalNotes[0]);
    expect(json).not.toContain(fullQuestion.checkQuestion);
  });

  it("reveals explicit review fields only for an evaluated answer", () => {
    const [item] = toWebTodayQuizQuestions([
      todayItem({
        selectedChoiceId: "b",
        correct: false,
        feedback: "Use the machine-readable boundary requirement.",
        scoreDelta: -0.08,
      }),
    ]);

    expect(item.status).toBe("answered");
    if (item.status !== "answered") throw new Error("expected answered projection");
    expect(item.answer).toEqual({
      selectedChoiceId: "b",
      correct: false,
      feedback: "Use the machine-readable boundary requirement.",
    });
    expect(item.question.choices[0]).toEqual(fullQuestion.choices[0]);
    expect(item.question.decisionCriteria).toEqual(fullQuestion.decisionCriteria);
    expect(item.question.rationale).toBe(fullQuestion.rationale);
    expect(JSON.stringify(item)).not.toContain("scoreDelta");
  });
});
