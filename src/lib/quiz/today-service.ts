import type { QuestionArtifact } from "@/db/schema";
import { localDateKey } from "@/lib/datetime/local-date";

import {
  getTodayQuiz,
  type TodayQuiz,
  type TodayQuizQuestion,
} from "./get-today-quiz";
import {
  submitTodayAnswer,
  type SubmitAnswerInput,
  type SubmitAnswerResult,
} from "./submit-answer";

export type McpTodayResult = {
  quizDate: string;
  progress: { answered: number; total: number };
  complete: boolean;
  nextQuestion: LearnerQuestion | null;
  instructorPack: InstructorQuestion[];
};

export type LearnerQuestion = {
  quizDayId: string;
  questionId: string;
  slot: number;
  scenario: string;
  artifacts: QuestionArtifact[];
  prompt: string;
  choices: Array<{ id: string; label: string }>;
};

export type InstructorQuestion = {
  quizDayId: string;
  questionId: string;
  slot: number;
  scenario: string;
  artifacts: QuestionArtifact[];
  prompt: string;
  choices: Array<{
    id: string;
    label: string;
    explanation: string;
    consequence: string;
  }>;
  correctChoiceId: string;
  decisionCriteria: string[];
  rationale: string;
  practicalNotes: string[];
  checkQuestion: string;
  existingAnswer: {
    selectedChoiceId: string;
    correct: boolean | null;
    feedback: string | null;
  } | null;
};

export type SubmitTodayForUserInput = Omit<SubmitAnswerInput, "today"> & {
  today?: string;
  userId: string;
};

type TodayServiceDeps = {
  allowedUserId: string;
  getQuiz?: (userId: string, today?: string) => Promise<TodayQuiz>;
  submitAnswer?: (
    input: Omit<SubmitAnswerInput, "today"> & { today?: string },
  ) => Promise<SubmitAnswerResult>;
};

export async function getTodayForUser(
  input: { userId: string; today?: string },
  deps: TodayServiceDeps,
): Promise<McpTodayResult> {
  assertAllowedUser(input.userId, deps.allowedUserId);
  const today = input.today ?? localDateKey();
  const quiz = await (deps.getQuiz ?? getTodayQuiz)(input.userId, today);
  const next = quiz.questions.find((item) => item.answer === null);

  return {
    quizDate: quiz.quizDate,
    progress: quiz.progress,
    complete: next === undefined,
    nextQuestion: next ? toLearnerQuestion(quiz.quizDayId, next) : null,
    instructorPack: quiz.questions.map((item) =>
      toInstructorQuestion(quiz.quizDayId, item),
    ),
  };
}

export function toLearnerQuestion(
  quizDayId: string,
  item: TodayQuizQuestion,
): LearnerQuestion {
  return {
    quizDayId,
    questionId: item.question.id,
    slot: item.slot,
    scenario: item.question.scenario,
    artifacts: item.question.artifacts.map(toPublicArtifact),
    prompt: item.question.prompt,
    choices: item.question.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
    })),
  };
}

export function toInstructorQuestion(
  quizDayId: string,
  item: TodayQuizQuestion,
): InstructorQuestion {
  return {
    quizDayId,
    questionId: item.question.id,
    slot: item.slot,
    scenario: item.question.scenario,
    artifacts: item.question.artifacts.map(toPublicArtifact),
    prompt: item.question.prompt,
    choices: item.question.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      explanation: choice.explanation,
      consequence: choice.consequence,
    })),
    correctChoiceId:
      item.question.choices.find((choice) => choice.correct)?.id ?? "",
    decisionCriteria: item.question.decisionCriteria.slice(),
    rationale: item.question.rationale,
    practicalNotes: item.question.practicalNotes.slice(),
    checkQuestion: item.question.checkQuestion,
    existingAnswer: item.answer
      ? {
          selectedChoiceId: item.answer.selectedChoiceId,
          correct: item.answer.correct,
          feedback: item.answer.feedback,
        }
      : null,
  };
}

function toPublicArtifact(artifact: QuestionArtifact): QuestionArtifact {
  const projected: QuestionArtifact = {
    kind: artifact.kind,
    title: artifact.title,
    content: artifact.content,
  };
  if (artifact.language) projected.language = artifact.language;
  return projected;
}

export async function submitTodayForUser(
  input: SubmitTodayForUserInput,
  deps: TodayServiceDeps,
): Promise<SubmitAnswerResult> {
  assertAllowedUser(input.userId, deps.allowedUserId);
  const today = input.today ?? localDateKey();
  const quiz = await (deps.getQuiz ?? getTodayQuiz)(input.userId, today);

  if (quiz.quizDayId !== input.quizDayId) {
    throw new Error("today_quiz_not_found");
  }

  const item = quiz.questions.find((candidate) => candidate.question.id === input.questionId);
  if (!item) {
    throw new Error("today_question_not_found");
  }
  if (!item.question.choices.some((choice) => choice.id === input.selectedChoiceId)) {
    throw new Error("today_choice_not_found");
  }

  return (deps.submitAnswer ?? submitTodayAnswer)({
    userId: input.userId,
    quizDayId: input.quizDayId,
    questionId: input.questionId,
    selectedChoiceId: input.selectedChoiceId,
    confidence: input.confidence,
    reasoning: input.reasoning,
    today,
  });
}

function assertAllowedUser(userId: string, allowedUserId: string) {
  if (!allowedUserId || userId !== allowedUserId) {
    throw new Error("today_forbidden");
  }
}
