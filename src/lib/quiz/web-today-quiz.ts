import type { QuestionArtifact, QuestionChoice } from "@/db/schema";

import type { TodayQuizQuestion } from "./get-today-quiz";

type WebQuestionBase = {
  id: string;
  conceptId: string;
  scenario: string;
  artifacts: QuestionArtifact[];
  prompt: string;
};

type WebLearnerChoice = Pick<QuestionChoice, "id" | "label">;

export type WebUnansweredQuizQuestion = {
  status: "unanswered";
  slot: number;
  reason: string;
  question: WebQuestionBase & {
    choices: WebLearnerChoice[];
  };
};

export type WebAnsweredQuizQuestion = {
  status: "answered";
  slot: number;
  reason: string;
  question: WebQuestionBase & {
    choices: QuestionChoice[];
    decisionCriteria: string[];
    rationale: string;
    practicalNotes: string[];
    checkQuestion: string;
  };
  answer: {
    selectedChoiceId: string;
    correct: boolean | null;
    feedback: string | null;
  };
};

export type WebTodayQuizQuestion = WebUnansweredQuizQuestion | WebAnsweredQuizQuestion;

export function toWebTodayQuizQuestions(items: TodayQuizQuestion[]): WebTodayQuizQuestion[] {
  return items.map((item) => {
    const base = {
      id: item.question.id,
      conceptId: item.question.conceptId,
      scenario: item.question.scenario,
      artifacts: item.question.artifacts.map((artifact) => ({
        kind: artifact.kind,
        title: artifact.title,
        ...(artifact.language ? { language: artifact.language } : {}),
        content: artifact.content,
      })),
      prompt: item.question.prompt,
    };

    if (item.answer === null) {
      return {
        status: "unanswered",
        slot: item.slot,
        reason: item.reason,
        question: {
          ...base,
          choices: item.question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
          })),
        },
      };
    }

    return {
      status: "answered",
      slot: item.slot,
      reason: item.reason,
      question: {
        ...base,
        choices: item.question.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          correct: choice.correct,
          explanation: choice.explanation,
          consequence: choice.consequence,
        })),
        decisionCriteria: [...item.question.decisionCriteria],
        rationale: item.question.rationale,
        practicalNotes: [...item.question.practicalNotes],
        checkQuestion: item.question.checkQuestion,
      },
      answer: {
        selectedChoiceId: item.answer.selectedChoiceId,
        correct: item.answer.correct,
        feedback: item.answer.feedback,
      },
    };
  });
}
