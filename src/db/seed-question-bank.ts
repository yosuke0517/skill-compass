import type { ReviewedQuestion } from "@/lib/quiz/content/types";

export type QuestionSeedRow = {
  id: string;
  conceptId: string;
  sourceId: string;
  scenario: string;
  artifacts: ReviewedQuestion["artifacts"];
  caseType: ReviewedQuestion["caseType"];
  decisionCriteria: string[];
  practicalNotes: string[];
  checkQuestion: string;
  prompt: string;
  choices: ReviewedQuestion["choices"];
  difficulty: ReviewedQuestion["difficulty"];
  rationale: string;
  active: true;
};

export function toQuestionRow(question: ReviewedQuestion): QuestionSeedRow {
  return {
    id: question.id,
    conceptId: question.conceptId,
    sourceId: question.sourceId,
    scenario: question.scenario,
    artifacts: question.artifacts,
    caseType: question.caseType,
    decisionCriteria: question.decisionCriteria,
    practicalNotes: question.practicalNotes,
    checkQuestion: question.checkQuestion,
    prompt: question.prompt,
    choices: question.choices,
    difficulty: question.difficulty,
    rationale: question.rationale,
    active: true,
  };
}

export function toQuestionUpdate(question: ReviewedQuestion | QuestionSeedRow): Omit<QuestionSeedRow, "id"> {
  return {
    conceptId: question.conceptId,
    sourceId: question.sourceId,
    scenario: question.scenario,
    artifacts: question.artifacts,
    caseType: question.caseType,
    decisionCriteria: question.decisionCriteria,
    practicalNotes: question.practicalNotes,
    checkQuestion: question.checkQuestion,
    prompt: question.prompt,
    choices: question.choices,
    difficulty: question.difficulty,
    rationale: question.rationale,
    active: true,
  };
}

export function createQuestionSeedPlan(questionBank: ReviewedQuestion[]) {
  return {
    activeQuestionIds: new Set(questionBank.map(({ id }) => id)),
    rows: questionBank.map(toQuestionRow),
  };
}
