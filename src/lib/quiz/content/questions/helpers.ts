import type { QuestionChoice, ReviewedQuestion } from "@/lib/quiz/content/types";
import { getLearningSource } from "@/lib/quiz/content/learning-sources";

type ChoiceId = QuestionChoice["id"];
type ChoiceDraft = readonly [label: string, explanation: string, consequence: string];
type QuestionDraft = Omit<ReviewedQuestion, "active" | "artifacts" | "sourceId"> & {
  artifacts?: ReviewedQuestion["artifacts"];
};

const choiceIds = ["a", "b", "c", "d"] as const;

export function defineQuestion(question: QuestionDraft): ReviewedQuestion {
  return {
    ...question,
    sourceId: getLearningSource(question.categoryId, question.subtopicId).id,
    artifacts: question.artifacts ?? [],
    active: true,
  };
}

export function defineChoices(
  correctId: ChoiceId,
  drafts: readonly ChoiceDraft[],
  authoredCorrectId: ChoiceId = correctId,
): QuestionChoice[] {
  if (drafts.length !== choiceIds.length) {
    throw new Error("question_choice_shape");
  }

  const orderedDrafts = [...drafts];
  if (authoredCorrectId !== correctId) {
    const correctIndex = choiceIds.indexOf(correctId);
    const authoredCorrectIndex = choiceIds.indexOf(authoredCorrectId);
    [orderedDrafts[correctIndex], orderedDrafts[authoredCorrectIndex]] = [
      orderedDrafts[authoredCorrectIndex],
      orderedDrafts[correctIndex],
    ];
  }

  return choiceIds.map((id, index) => {
    const [label, explanation, consequence] = orderedDrafts[index];
    return { id, label, correct: id === correctId, explanation, consequence };
  });
}
