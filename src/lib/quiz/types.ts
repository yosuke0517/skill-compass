export type QuizSelectionReason = "weakness" | "strength_extension" | "latest_catchup" | "balancing" | "fallback";

export type QuizSelectionQuestion = {
  id: string;
  conceptId: string;
  categoryId: string;
  caseType: "basic_application" | "common_failure" | "design_tradeoff" | "debugging_performance" | "maintainability_safety";
  correctChoiceId: string;
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
  userId: string;
  today: string;
  questions: QuizSelectionQuestion[];
  existingPreparedQuestions?: SelectedQuizQuestion[];
  weakConceptIds: string[];
  strongConceptIds: string[];
  underrepresentedCategoryIds: string[];
  gapCategoryIds: string[];
  recentlyAnsweredQuestionIds: string[];
  recentlyAssignedQuestionIds: string[];
  dueQuestionIds: string[];
};
