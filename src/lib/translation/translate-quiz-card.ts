import type { QuestionArtifact, QuestionChoice } from "@/db/schema";

import { createTranslationCacheKey } from "./cache-key";
import { TRANSLATION_GLOSSARY_VERSION } from "./glossary";
import { translateText, type TranslationRepository } from "./translate-text";
import type { TranslationProvider, TranslationPurpose } from "./types";

export type TranslateQuizCardInput = {
  question: {
    id: string;
    scenario: string;
    artifacts: QuestionArtifact[];
    prompt: string;
    choices: QuestionChoice[];
    decisionCriteria: string[];
    rationale: string;
    practicalNotes: string[];
    checkQuestion: string;
  };
  feedback?: string | null;
  revealReview: boolean;
};

type TranslatedArtifact = Omit<QuestionArtifact, "title"> & {
  title: string | null;
};

type TranslatedPublicChoice = {
  id: string;
  label: string | null;
};

export type TranslatedQuizReview = {
  decisionCriteria: string[];
  rationale: string | null;
  choices: Array<{
    id: string;
    explanation: string | null;
    consequence: string | null;
  }>;
  practicalNotes: string[];
  checkQuestion: string | null;
  feedback: string | null;
};

export type TranslatedQuizCard = {
  questionId: string;
  scenario: string | null;
  artifacts: TranslatedArtifact[];
  prompt: string | null;
  choices: TranslatedPublicChoice[];
  unavailable: boolean;
  reviewStatus: "hidden" | "missing" | "ready";
  review?: TranslatedQuizReview;
};

type TranslationLookup = (
  sourceText: string,
  purpose: TranslationPurpose,
) => Promise<string | null>;

export async function translateQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  provider: TranslationProvider,
): Promise<TranslatedQuizCard> {
  return buildTranslatedQuizCard(input, (sourceText, purpose) =>
    translateSource(sourceText, purpose, repo, provider),
  );
}

export async function getCachedTranslatedQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  providerCacheScope?: string,
): Promise<TranslatedQuizCard> {
  return buildTranslatedQuizCard(input, (sourceText, purpose) =>
    getCachedTranslation(sourceText, purpose, repo, providerCacheScope),
  );
}

async function buildTranslatedQuizCard(
  input: TranslateQuizCardInput,
  translate: TranslationLookup,
): Promise<TranslatedQuizCard> {
  const reviewRequested = input.revealReview;
  const [
    scenario,
    artifactTitles,
    prompt,
    choiceLabels,
    choiceExplanations,
    choiceConsequences,
    decisionCriteria,
    rationale,
    practicalNotes,
    checkQuestion,
    feedback,
  ] = await Promise.all([
    translate(input.question.scenario, "quiz_scenario"),
    Promise.all(
      input.question.artifacts.map((artifact) => translate(artifact.title, "quiz_artifact_title")),
    ),
    translate(input.question.prompt, "quiz_prompt"),
    Promise.all(input.question.choices.map((choice) => translate(choice.label, "quiz_choice"))),
    reviewRequested
      ? Promise.all(
          input.question.choices.map((choice) =>
            translate(choice.explanation, "quiz_choice_explanation"),
          ),
        )
      : Promise.resolve([]),
    reviewRequested
      ? Promise.all(
          input.question.choices.map((choice) =>
            translate(choice.consequence, "quiz_choice_consequence"),
          ),
        )
      : Promise.resolve([]),
    reviewRequested
      ? Promise.all(
          input.question.decisionCriteria.map((criterion) =>
            translate(criterion, "quiz_decision_criterion"),
          ),
        )
      : Promise.resolve([]),
    reviewRequested ? translate(input.question.rationale, "quiz_rationale") : Promise.resolve(null),
    reviewRequested
      ? Promise.all(
          input.question.practicalNotes.map((note) => translate(note, "quiz_practical_note")),
        )
      : Promise.resolve([]),
    reviewRequested
      ? translate(input.question.checkQuestion, "quiz_check_question")
      : Promise.resolve(null),
    reviewRequested && input.feedback
      ? translate(input.feedback, "quiz_feedback")
      : Promise.resolve(null),
  ]);

  const publicCard = {
    questionId: input.question.id,
    scenario,
    artifacts: input.question.artifacts.map((artifact, index) => ({
      ...artifact,
      title: artifactTitles[index] ?? null,
    })),
    prompt,
    choices: input.question.choices.map((choice, index) => ({
      id: choice.id,
      label: choiceLabels[index] ?? null,
    })),
    unavailable:
      missingRequiredTranslation(input.question.scenario, scenario) ||
      missingRequiredTranslation(input.question.prompt, prompt) ||
      input.question.artifacts.some((artifact, index) =>
        missingRequiredTranslation(artifact.title, artifactTitles[index] ?? null),
      ) ||
      input.question.choices.some((choice, index) =>
        missingRequiredTranslation(choice.label, choiceLabels[index] ?? null),
      ),
  };

  if (!reviewRequested) {
    return {
      ...publicCard,
      reviewStatus: "hidden",
    };
  }

  const review: TranslatedQuizReview = {
    decisionCriteria: decisionCriteria.filter((value): value is string => value !== null),
    rationale,
    choices: input.question.choices.map((choice, index) => ({
      id: choice.id,
      explanation: choiceExplanations[index] ?? null,
      consequence: choiceConsequences[index] ?? null,
    })),
    practicalNotes: practicalNotes.filter((value): value is string => value !== null),
    checkQuestion,
    feedback,
  };

  return {
    ...publicCard,
    reviewStatus: hasCompleteReviewTranslation(input, {
      choiceExplanations,
      choiceConsequences,
      decisionCriteria,
      rationale,
      practicalNotes,
      checkQuestion,
      feedback,
    })
      ? "ready"
      : "missing",
    review,
  };
}

function hasCompleteReviewTranslation(
  input: TranslateQuizCardInput,
  translated: {
    choiceExplanations: Array<string | null>;
    choiceConsequences: Array<string | null>;
    decisionCriteria: Array<string | null>;
    rationale: string | null;
    practicalNotes: Array<string | null>;
    checkQuestion: string | null;
    feedback: string | null;
  },
): boolean {
  return (
    allRequiredTranslated(input.question.decisionCriteria, translated.decisionCriteria) &&
    !missingRequiredTranslation(input.question.rationale, translated.rationale) &&
    allRequiredTranslated(
      input.question.choices.map((choice) => choice.explanation),
      translated.choiceExplanations,
    ) &&
    allRequiredTranslated(
      input.question.choices.map((choice) => choice.consequence),
      translated.choiceConsequences,
    ) &&
    allRequiredTranslated(input.question.practicalNotes, translated.practicalNotes) &&
    !missingRequiredTranslation(input.question.checkQuestion, translated.checkQuestion) &&
    !missingRequiredTranslation(input.feedback ?? "", translated.feedback)
  );
}

function allRequiredTranslated(
  sourceTexts: string[],
  translatedTexts: Array<string | null>,
): boolean {
  return sourceTexts.every(
    (sourceText, index) => !missingRequiredTranslation(sourceText, translatedTexts[index] ?? null),
  );
}

async function translateSource(
  sourceText: string,
  purpose: TranslationPurpose,
  repo: TranslationRepository,
  provider: TranslationProvider,
): Promise<string | null> {
  if (sourceText.trim() === "") return null;
  const result = await translateText(
    { sourceText, sourceLocale: "en", targetLocale: "ja", purpose },
    repo,
    provider,
  );
  return result.status === "translated" ? result.translatedText : null;
}

async function getCachedTranslation(
  sourceText: string,
  purpose: TranslationPurpose,
  repo: TranslationRepository,
  providerCacheScope?: string,
): Promise<string | null> {
  if (sourceText.trim() === "") return null;
  const key = createTranslationCacheKey({
    sourceText,
    sourceLocale: "en",
    targetLocale: "ja",
    purpose,
    glossaryVersion: TRANSLATION_GLOSSARY_VERSION,
    providerCacheScope,
  });

  const cached = await repo.findBySourceHash(key.sourceHash);
  return cached?.translatedText ?? null;
}

function missingRequiredTranslation(sourceText: string, translatedText: string | null) {
  return sourceText.trim() !== "" && translatedText === null;
}
