export type TodayAssistantQuestion = {
  slot: number;
  prompt: string;
  choices: string[];
  answerFeedback: string | null;
};

export type TodayAssistantInput = {
  userMessage: string;
  quizDate: string;
  progress: { answered: number; total: number };
  questions: TodayAssistantQuestion[];
};

export type AssistantResult =
  | { status: "answered"; answer: string; provider: string }
  | { status: "unavailable"; reason: string; provider: string };

export interface AssistantProvider {
  ask(input: TodayAssistantInput): Promise<AssistantResult>;
}
