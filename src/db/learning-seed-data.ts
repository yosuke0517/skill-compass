import type { ReviewedQuestion } from "@/lib/quiz/content/types";
import {
  getLearningSource,
  learningSources,
} from "@/lib/quiz/content/learning-sources";

export const learningSourceRows = learningSources.map((source) => ({
  id: source.id,
  title: source.title,
  url: source.url,
  trustTier: "tier1" as const,
  official: true,
  status: "active" as const,
}));

export function buildConceptSeedRows(questions: ReviewedQuestion[]) {
  return questions.map((question) => {
    const source = getLearningSource(question.categoryId, question.subtopicId);
    return {
      id: question.conceptId,
      title: question.prompt,
      summary: question.scenario,
      currentUnderstanding: source.conceptSynopsis,
    };
  });
}
