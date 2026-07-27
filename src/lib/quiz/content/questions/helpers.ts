import type { QuestionChoice, ReviewedQuestion } from "@/lib/quiz/content/types";

type ChoiceId = QuestionChoice["id"];
type ChoiceDraft = readonly [label: string, explanation: string, consequence: string];
type QuestionDraft = Omit<ReviewedQuestion, "active" | "artifacts"> & {
  artifacts?: ReviewedQuestion["artifacts"];
};

const choiceIds = ["a", "b", "c", "d"] as const;

export function defineQuestion(question: QuestionDraft): ReviewedQuestion {
  return {
    ...question,
    artifacts: question.artifacts ?? [],
    active: true,
  };
}

export function defineChoices(correctId: ChoiceId, drafts: readonly ChoiceDraft[]): QuestionChoice[] {
  if (drafts.length !== choiceIds.length) {
    throw new Error("question_choice_shape");
  }

  return choiceIds.map((id, index) => {
    const [label, explanation, consequence] = drafts[index];
    return { id, label, correct: id === correctId, explanation, consequence };
  });
}
