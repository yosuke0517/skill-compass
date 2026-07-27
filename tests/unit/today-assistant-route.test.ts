import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  getTodayQuiz: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/assistant/provider", () => ({
  getAssistantProvider: () => ({ ask: mocks.ask }),
}));

vi.mock("@/lib/quiz/get-today-quiz", () => ({
  getTodayQuiz: mocks.getTodayQuiz,
}));
vi.mock("@/lib/access/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

import { POST } from "@/app/api/assistant/today/route";

describe("POST /api/assistant/today", () => {
  it("builds provider input with only the requested active question", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user_a" });
    mocks.getTodayQuiz.mockResolvedValue({
      quizDate: "2026-07-12",
      progress: { answered: 1, total: 2 },
      questions: [
        {
          slot: 1,
          reason: "weakness",
          question: {
            id: "question-one",
            conceptId: "concept-api-one",
            scenario: "Existing clients ignore unknown response fields.",
            artifacts: [],
            prompt: "Which API change is compatible?",
            choices: [
              {
                id: "a",
                label: "Add an optional field",
                correct: true,
                explanation: "Existing clients can ignore it.",
                consequence: "Old and new clients keep working.",
              },
              {
                id: "b",
                label: "Remove a required field",
                correct: false,
                explanation: "Existing clients depend on it.",
                consequence: "Existing clients can fail.",
              },
              {
                id: "c",
                label: "Change a string to an array",
                correct: false,
                explanation: "The response type changes.",
                consequence: "Existing decoders can fail.",
              },
              {
                id: "d",
                label: "Rename a required field",
                correct: false,
                explanation: "Existing clients use the old name.",
                consequence: "The value appears missing.",
              },
            ],
            decisionCriteria: ["Preserve the existing response contract."],
            rationale: "Adding an optional field preserves existing fields and types.",
            practicalNotes: ["Validate the change against the published schema."],
            checkQuestion: "What makes a response change additive?",
          },
          answer: null,
        },
        {
          slot: 2,
          reason: "review",
          question: {
            id: "question-two",
            conceptId: "concept-api-two",
            scenario: "A deployed mobile client requires the accountId response field.",
            artifacts: [
              {
                kind: "api",
                title: "Published response",
                language: "json",
                content: '{"accountId":"acct_1"}',
              },
            ],
            prompt: "Which API change breaks clients?",
            choices: [
              {
                id: "a",
                label: "Add an optional displayName",
                correct: false,
                explanation: "The required field remains.",
                consequence: "Existing clients continue to decode the response.",
              },
              {
                id: "b",
                label: "Document the existing field",
                correct: false,
                explanation: "Documentation does not change the payload.",
                consequence: "Runtime behavior remains compatible.",
              },
              {
                id: "c",
                label: "Remove a required field",
                correct: true,
                explanation: "The deployed client requires accountId.",
                consequence: "The client cannot obtain the required value.",
              },
              {
                id: "d",
                label: "Add a new endpoint version",
                correct: false,
                explanation: "The existing endpoint can remain stable.",
                consequence: "Existing clients keep using the old contract.",
              },
            ],
            decisionCriteria: ["The deployed client requires accountId."],
            rationale: "Removing accountId violates the published client contract.",
            practicalNotes: ["Version breaking response changes."],
            checkQuestion: "Why is removing a required field breaking?",
          },
          answer: {
            selectedChoiceId: "c",
            correct: true,
            feedback: "Review the client contract.",
            scoreDelta: 0.1,
          },
        },
      ],
    });
    mocks.ask.mockResolvedValue({ status: "answered", answer: "Focus on required fields.", provider: "test" });

    const response = await POST(
      new Request("http://localhost/api/assistant/today", {
        method: "POST",
        body: JSON.stringify({
          message: "Explain this question",
          questionId: "question-two",
          userId: "user_b",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getTodayQuiz).toHaveBeenCalledWith("user_a");
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
