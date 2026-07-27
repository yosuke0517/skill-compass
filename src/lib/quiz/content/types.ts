import { difficultyValues } from "@/db/schema";
import type { QuestionArtifact, QuestionCaseType, QuestionChoice } from "@/db/schema";

export type { QuestionArtifact, QuestionCaseType, QuestionChoice } from "@/db/schema";

export type LearningSubtopic = {
  id: string;
  name: string;
};

export type LearningCategory = {
  id: string;
  name: string;
  subtopics: readonly LearningSubtopic[];
};

export type ReviewedQuestion = {
  id: string;
  categoryId: string;
  subtopicId: string;
  conceptId: string;
  sourceId: string;
  scenario: string;
  artifacts: QuestionArtifact[];
  caseType: QuestionCaseType;
  decisionCriteria: string[];
  practicalNotes: string[];
  checkQuestion: string;
  prompt: string;
  choices: QuestionChoice[];
  difficulty: (typeof difficultyValues)[number];
  rationale: string;
  active: boolean;
};
