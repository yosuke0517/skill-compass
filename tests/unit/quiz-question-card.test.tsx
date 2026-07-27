import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizQuestionCard } from "@/components/quiz/quiz-question-card";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

vi.mock("@/app/actions/quiz", () => ({
  submitQuizAnswerAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const question = {
  id: "q_web_03",
  conceptId: "concept_web_contract_first",
  scenario: "Web and API teams must build in parallel before either implementation is complete.",
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
  rationale: "Parallel implementation requires a versioned, machine-checkable API contract.",
  practicalNotes: ["Run producer and consumer conformance checks in CI."],
  checkQuestion: "What artifact can both teams use without importing each other's code?",
};

const unansweredItem = {
  status: "unanswered" as const,
  slot: 1,
  reason: "weakness",
  question: {
    id: question.id,
    conceptId: question.conceptId,
    scenario: question.scenario,
    artifacts: question.artifacts,
    prompt: question.prompt,
    choices: question.choices.map(({ id, label }) => ({ id, label })),
  },
};

const answeredItem = {
  status: "answered" as const,
  slot: 1,
  reason: "weakness",
  question,
  answer: {
    selectedChoiceId: "b",
    correct: false,
    feedback: "Revisit which artifact can be validated by both teams.",
  },
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function publicTranslation(
  reviewStatus: "hidden" | "missing",
): TranslatedQuizCard {
  return {
    questionId: question.id,
    scenario: "並行開発するシナリオ。",
    artifacts: [],
    prompt: "最初に何を合意しますか？",
    choices: question.choices.map((choice) => ({
      id: choice.id,
      label: `訳: ${choice.label}`,
    })),
    unavailable: false,
    reviewStatus,
  };
}

function readyTranslation(marker: string): TranslatedQuizCard {
  return {
    ...publicTranslation("missing"),
    prompt: `${marker}: 最初に何を合意しますか？`,
    reviewStatus: "ready",
    review: {
      decisionCriteria: [`${marker}: 機械可読な境界。`],
      rationale: `${marker}: API契約が必要です。`,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        explanation: `${marker}: ${choice.explanation}`,
        consequence: `${marker}: ${choice.consequence}`,
      })),
      practicalNotes: [`${marker}: CIで検証する。`],
      checkQuestion: `${marker}: 何からモックを生成しますか？`,
      feedback: `${marker}: 判断条件を再確認してください。`,
    },
  };
}

describe("QuizQuestionCard", () => {
  it("shows the practical scenario and artifacts before the decision prompt without hidden teaching data", () => {
    const { container } = render(<QuizQuestionCard quizDayId="quiz_1" item={unansweredItem} />);

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
    const { container } = render(<QuizQuestionCard quizDayId="quiz_1" item={answeredItem} />);

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

  it("places translated review prose inside the same teaching order after Result", () => {
    const { container } = render(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={answeredItem}
        translation={{
          questionId: question.id,
          scenario: "並行開発するシナリオ。",
          artifacts: [
            {
              ...question.artifacts[0],
              title: "契約要件",
            },
          ],
          prompt: "最初に何を合意しますか？",
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: `訳: ${choice.label}`,
          })),
          unavailable: false,
          reviewStatus: "ready",
          review: {
            decisionCriteria: ["訳: 機械可読な境界を用意する。"],
            rationale: "訳: バージョン管理されたAPI契約が必要です。",
            choices: question.choices.map((choice) => ({
              id: choice.id,
              explanation: `訳: ${choice.explanation}`,
              consequence: `訳: ${choice.consequence}`,
            })),
            practicalNotes: ["訳: CIで契約テストを実行する。"],
            checkQuestion: "訳: どの成果物からモックを生成できますか？",
            feedback: "訳: 両チームが検証できる成果物を再確認してください。",
          },
        }}
      />,
    );

    const text = container.querySelector(".quiz-card")?.textContent ?? "";
    const result = text.indexOf("Result");
    const translatedDecision = text.indexOf("訳: 機械可読な境界を用意する。");
    const why = text.indexOf("Why");
    const translatedWhy = text.indexOf("訳: バージョン管理されたAPI契約が必要です。");
    const translatedFeedback = text.indexOf("訳: 両チームが検証できる成果物を再確認してください。");
    const options = text.indexOf("Options");
    const translatedOption = text.indexOf(`訳: ${question.choices[0].explanation}`);
    const practicalNotes = text.indexOf("Practical notes");
    const translatedNote = text.indexOf("訳: CIで契約テストを実行する。");
    const check = text.indexOf("Check your understanding");
    const translatedCheck = text.indexOf("訳: どの成果物からモックを生成できますか？");

    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(translatedDecision);
    expect(translatedDecision).toBeLessThan(why);
    expect(why).toBeLessThan(translatedWhy);
    expect(translatedWhy).toBeLessThan(translatedFeedback);
    expect(translatedFeedback).toBeLessThan(options);
    expect(options).toBeLessThan(translatedOption);
    expect(translatedOption).toBeLessThan(practicalNotes);
    expect(practicalNotes).toBeLessThan(translatedNote);
    expect(translatedNote).toBeLessThan(check);
    expect(check).toBeLessThan(translatedCheck);
  });

  it("refreshes an incomplete pre-answer translation after the answer is evaluated", async () => {
    const refreshed = {
      questionId: question.id,
      scenario: "並行開発するシナリオ。",
      artifacts: [],
      prompt: "最初に何を合意しますか？",
      choices: question.choices.map((choice) => ({
        id: choice.id,
        label: `訳: ${choice.label}`,
      })),
      unavailable: false,
      reviewStatus: "ready" as const,
      review: {
        decisionCriteria: ["訳: 機械可読な境界。"],
        rationale: "訳: API契約が必要です。",
        choices: question.choices.map((choice) => ({
          id: choice.id,
          explanation: `訳: ${choice.explanation}`,
          consequence: `訳: ${choice.consequence}`,
        })),
        practicalNotes: ["訳: CIで検証する。"],
        checkQuestion: "訳: 何からモックを生成しますか？",
        feedback: "訳: 判断条件を再確認してください。",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => refreshed,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={answeredItem}
        translation={{
          questionId: question.id,
          scenario: "並行開発するシナリオ。",
          artifacts: [],
          prompt: "最初に何を合意しますか？",
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: `訳: ${choice.label}`,
          })),
          unavailable: false,
          reviewStatus: "missing",
        }}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/quiz/translation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: question.id }),
    });
    expect(await screen.findByText("訳: 判断条件を再確認してください。")).toBeTruthy();
  });

  it("adopts answered translation props and refreshes when the same card changes from hidden to missing", async () => {
    const refreshed = readyTranslation("回答後");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => refreshed,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={unansweredItem}
        translation={publicTranslation("hidden")}
      />,
    );

    rerender(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={answeredItem}
        translation={publicTranslation("missing")}
      />,
    );

    expect(await screen.findByText("回答後: 判断条件を再確認してください。")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a late pre-answer translation after the answered review refresh completes", async () => {
    const preAnswerRequest = createDeferred<{
      ok: boolean;
      json: () => Promise<TranslatedQuizCard>;
    }>();
    const answeredRequest = createDeferred<{
      ok: boolean;
      json: () => Promise<TranslatedQuizCard>;
    }>();
    const staleTranslation = {
      ...publicTranslation("hidden"),
      prompt: "古い回答前の翻訳",
    };
    const refreshed = readyTranslation("最新回答後");
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(preAnswerRequest.promise)
      .mockReturnValueOnce(answeredRequest.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={unansweredItem}
        translation={publicTranslation("hidden")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate to Japanese" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <QuizQuestionCard
        quizDayId="quiz_1"
        item={answeredItem}
        translation={publicTranslation("missing")}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      answeredRequest.resolve({
        ok: true,
        json: async () => refreshed,
      });
    });
    expect(await screen.findByText("最新回答後: 判断条件を再確認してください。")).toBeTruthy();

    await act(async () => {
      preAnswerRequest.resolve({
        ok: true,
        json: async () => staleTranslation,
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("古い回答前の翻訳")).toBeNull();
      expect(screen.getByText("最新回答後: 判断条件を再確認してください。")).toBeTruthy();
    });
  });
});
