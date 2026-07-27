import { aiEngineeringQuestions } from "@/lib/quiz/content/questions/ai-engineering";
import { csFoundationsQuestions } from "@/lib/quiz/content/questions/cs-foundations";
import { frontendQuestions } from "@/lib/quiz/content/questions/frontend";
import { infrastructureQuestions } from "@/lib/quiz/content/questions/infrastructure";
import { securityQuestions } from "@/lib/quiz/content/questions/security";
import { softwareDesignQuestions } from "@/lib/quiz/content/questions/software-design";
import { webBackendQuestions } from "@/lib/quiz/content/questions/web-backend";
import type { ReviewedQuestion } from "@/lib/quiz/content/types";

export const reviewedQuestionBank: ReviewedQuestion[] = [
  ...csFoundationsQuestions,
  ...webBackendQuestions,
  ...frontendQuestions,
  ...infrastructureQuestions,
  ...securityQuestions,
  ...softwareDesignQuestions,
  ...aiEngineeringQuestions,
];
