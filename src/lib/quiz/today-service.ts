import { getTodayQuiz, type TodayQuiz } from "./get-today-quiz";
import {
  submitTodayAnswer,
  type SubmitAnswerInput,
  type SubmitAnswerResult,
} from "./submit-answer";

export type McpTodayResult = {
  quizDate: string;
  progress: { answered: number; total: number };
  complete: boolean;
  nextQuestion: {
    quizDayId: string;
    questionId: string;
    slot: number;
    prompt: string;
    choices: Array<{ id: string; label: string }>;
  } | null;
  instructorPack: Array<{
    quizDayId: string;
    questionId: string;
    slot: number;
    prompt: string;
    choices: Array<{ id: string; label: string }>;
    correctChoiceId: string;
    rationale: string;
    existingAnswer: {
      selectedChoiceId: string;
      correct: boolean | null;
      feedback: string | null;
    } | null;
  }>;
};

export type SubmitTodayForUserInput = SubmitAnswerInput & {
  userId: string;
};

type TodayServiceDeps = {
  allowedUserId: string;
  getQuiz?: (today?: string) => Promise<TodayQuiz>;
  submitAnswer?: (
    input: Omit<SubmitAnswerInput, "today"> & { today?: string },
  ) => Promise<SubmitAnswerResult>;
};

export async function getTodayForUser(
  input: { userId: string; today?: string },
  deps: TodayServiceDeps,
): Promise<McpTodayResult> {
  assertAllowedUser(input.userId, deps.allowedUserId);
  const quiz = await (deps.getQuiz ?? getTodayQuiz)(input.today);
  const next = quiz.questions.find((item) => item.answer === null);

  return {
    quizDate: quiz.quizDate,
    progress: quiz.progress,
    complete: next === undefined,
    nextQuestion: next
      ? {
          quizDayId: quiz.quizDayId,
          questionId: next.question.id,
          slot: next.slot,
          prompt: next.question.prompt,
          choices: next.question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
          })),
        }
      : null,
    instructorPack: quiz.questions.map((item) => ({
      quizDayId: quiz.quizDayId,
      questionId: item.question.id,
      slot: item.slot,
      prompt: item.question.prompt,
      choices: item.question.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
      })),
      correctChoiceId:
        item.question.choices.find((choice) => choice.correct)?.id ?? "",
      rationale: item.question.rationale,
      existingAnswer: item.answer
        ? {
            selectedChoiceId: item.answer.selectedChoiceId,
            correct: item.answer.correct,
            feedback: item.answer.feedback,
          }
        : null,
    })),
  };
}

export async function submitTodayForUser(
  input: SubmitTodayForUserInput,
  deps: TodayServiceDeps,
): Promise<SubmitAnswerResult> {
  assertAllowedUser(input.userId, deps.allowedUserId);
  const quiz = await (deps.getQuiz ?? getTodayQuiz)(input.today);

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
    quizDayId: input.quizDayId,
    questionId: input.questionId,
    selectedChoiceId: input.selectedChoiceId,
    confidence: input.confidence,
    reasoning: input.reasoning,
    today: input.today,
  });
}

function assertAllowedUser(userId: string, allowedUserId: string) {
  if (!allowedUserId || userId !== allowedUserId) {
    throw new Error("today_forbidden");
  }
}
