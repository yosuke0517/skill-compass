import { describe, expect, it } from "vitest";

import { deterministicLlmProvider } from "@/lib/llm/deterministic-provider";
import { submitAnswer, type SubmitAnswerRepository } from "@/lib/quiz/submit-answer";

describe("submitAnswer", () => {
  it("saves raw answer, evaluation feedback, score delta, and next review date", async () => {
    const savedAnswers: Array<{
      id: string;
      correct: boolean | null;
      feedback: string | null;
      scoreDelta: number | null;
      nextReviewOn: string | null;
    }> = [];
    const scoreUpdates: Array<{ subjectType: "concept"; subjectId: string; delta: number }> = [];

    const repo: SubmitAnswerRepository = {
      async getQuestion(questionId) {
        expect(questionId).toBe("question_typescript");
        return {
          id: "question_typescript",
          conceptId: "concept_typescript",
          prompt: "Which answer matches the source?",
          choices: [
            { id: "a", label: "A", correct: false },
            { id: "b", label: "B", correct: true },
          ],
        };
      },
      async saveRawAnswer(answer) {
        savedAnswers.push({
          id: answer.id,
          correct: null,
          feedback: null,
          scoreDelta: null,
          nextReviewOn: null,
        });
      },
      async updateAnswerEvaluation(answerId, evaluation) {
        const saved = savedAnswers.find((answer) => answer.id === answerId);
        if (!saved) throw new Error("answer was not saved first");
        saved.correct = evaluation.correct;
        saved.feedback = evaluation.feedback;
        saved.scoreDelta = evaluation.scoreDelta;
        saved.nextReviewOn = evaluation.nextReviewOn;
      },
      async updateConceptScore(update) {
        scoreUpdates.push(update);
      },
    };

    const result = await submitAnswer(
      {
        today: "2026-07-09",
        quizDayId: "quiz_2026-07-09",
        questionId: "question_typescript",
        selectedChoiceId: "b",
        confidence: 5,
        reasoning: "The official source describes this exact behavior.",
      },
      repo,
      deterministicLlmProvider,
    );

    expect(savedAnswers).toHaveLength(1);
    expect(savedAnswers[0]?.correct).toBe(true);
    expect(savedAnswers[0]?.feedback).toContain("Correct");
    expect(savedAnswers[0]?.scoreDelta).toBeGreaterThan(0);
    expect(savedAnswers[0]?.nextReviewOn).toBe("2026-07-23");
    expect(scoreUpdates).toEqual([
      { subjectType: "concept", subjectId: "concept_typescript", delta: result.scoreDelta.delta },
    ]);
  });
});
