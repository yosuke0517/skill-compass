import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
  submitTodayAnswer: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/quiz/submit-answer", () => ({ submitTodayAnswer: mocks.submitTodayAnswer }));

import { submitQuizAnswerAction } from "@/app/actions/quiz";

describe("submitQuizAnswerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitTodayAnswer.mockResolvedValue(undefined);
  });

  it("accepts and persists an empty optional reasoning field", async () => {
    const formData = new FormData();
    formData.set("quizDayId", "quiz_2026-07-12");
    formData.set("questionId", "question_typescript");
    formData.set("selectedChoiceId", "choice_b");
    formData.set("confidence", "4");

    await expect(submitQuizAnswerAction(formData)).rejects.toThrow("redirect:/today");

    expect(mocks.submitTodayAnswer).toHaveBeenCalledWith({
      quizDayId: "quiz_2026-07-12",
      questionId: "question_typescript",
      selectedChoiceId: "choice_b",
      confidence: 4,
      reasoning: "",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/today");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.redirect).toHaveBeenCalledWith("/today");
  });
});
