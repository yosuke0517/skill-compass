import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
  submitTodayAnswer: vi.fn(),
  getTodayQuiz: vi.fn(),
  toWebTodayQuizQuestions: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/quiz/submit-answer", () => ({ submitTodayAnswer: mocks.submitTodayAnswer }));
vi.mock("@/lib/quiz/get-today-quiz", () => ({ getTodayQuiz: mocks.getTodayQuiz }));
vi.mock("@/lib/quiz/web-today-quiz", () => ({
  toWebTodayQuizQuestions: mocks.toWebTodayQuizQuestions,
}));
vi.mock("@/lib/access/current-user", () => ({ requireCurrentUser: mocks.requireCurrentUser }));

import { submitQuizAnswerAction } from "@/app/actions/quiz";

describe("submitQuizAnswerAction", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitTodayAnswer.mockResolvedValue(undefined);
    mocks.getTodayQuiz.mockResolvedValue({ questions: [{}] });
    mocks.toWebTodayQuizQuestions.mockReturnValue([
      {
        status: "answered",
        slot: 1,
        reason: "weakness",
        question: { id: "question_typescript" },
        answer: { selectedChoiceId: "choice_b", correct: true, feedback: "Good" },
      },
    ]);
    mocks.requireCurrentUser.mockResolvedValue({ id: "user_a" });
  });

  it("accepts and persists an empty optional reasoning field", async () => {
    const formData = new FormData();
    formData.set("quizDayId", "quiz_2026-07-12");
    formData.set("questionId", "question_typescript");
    formData.set("selectedChoiceId", "choice_b");
    formData.set("confidence", "4");
    formData.set("userId", "user_b");

    const result = await submitQuizAnswerAction({ status: "idle" }, formData);

    expect(mocks.submitTodayAnswer).toHaveBeenCalledWith({
      userId: "user_a",
      quizDayId: "quiz_2026-07-12",
      questionId: "question_typescript",
      selectedChoiceId: "choice_b",
      confidence: 4,
      reasoning: "",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/today");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result.status).toBe("success");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns an inline error when answer submission fails", async () => {
    const error = new Error("evaluation unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.submitTodayAnswer.mockRejectedValue(error);
    const formData = new FormData();
    formData.set("quizDayId", "quiz_2026-07-12");
    formData.set("questionId", "question_typescript");
    formData.set("selectedChoiceId", "choice_b");

    const result = await submitQuizAnswerAction({ status: "idle" }, formData);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "error",
      message: "Your answer could not be saved. Please try again.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("quiz answer submission failed", error);
  });

  it("redirects to the maintenance explanation without saving", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "read_only");

    await expect(submitQuizAnswerAction({ status: "idle" }, new FormData())).rejects.toThrow(
      "redirect:/maintenance",
    );
    expect(mocks.submitTodayAnswer).not.toHaveBeenCalled();
  });
});
