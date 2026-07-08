export type QuizSelectionReason = "weakness" | "strength_extension" | "latest_catchup" | "balancing" | "fallback";

export type QuizSelectionQuestion = {
  id: string;
  conceptId: string;
  categoryId: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  sourceTrustTier?: "tier1" | "tier2" | "tier3" | "tier4";
  active?: boolean;
  createdAt?: string | Date;
};

export type SelectedQuizQuestion = {
  question: QuizSelectionQuestion;
  slot: number;
  reason: QuizSelectionReason;
};

export type QuizSelectionInput = {
  today: string;
  questions: QuizSelectionQuestion[];
  existingPreparedQuestions?: SelectedQuizQuestion[];
  weakConceptIds: string[];
  strongConceptIds: string[];
  underrepresentedCategoryIds: string[];
  gapCategoryIds: string[];
  recentlyAnsweredQuestionIds: string[];
};
