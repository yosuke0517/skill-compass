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

type TranslatedChoice = {
  id: string;
  label: string | null;
  explanation: string | null;
  consequence: string | null;
};

export type TranslatedQuizCard = {
  questionId: string;
  scenario: string | null;
  artifacts: TranslatedArtifact[];
  prompt: string | null;
  choices: TranslatedChoice[];
  decisionCriteria: string[] | null;
  rationale: string | null;
  practicalNotes: string[] | null;
  checkQuestion: string | null;
  feedback: string | null;
  unavailable: boolean;
};

export async function translateQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  provider: TranslationProvider,
): Promise<TranslatedQuizCard> {
  const translate = (sourceText: string, purpose: TranslationPurpose) =>
    translateSource(sourceText, purpose, repo, provider);
  const review = input.revealReview;

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
      input.question.artifacts.map((artifact) =>
        translate(artifact.title, "quiz_artifact_title"),
      ),
    ),
    translate(input.question.prompt, "quiz_prompt"),
    Promise.all(
      input.question.choices.map((choice) => translate(choice.label, "quiz_choice")),
    ),
    review
      ? Promise.all(
          input.question.choices.map((choice) =>
            translate(choice.explanation, "quiz_choice_explanation"),
          ),
        )
      : Promise.resolve(input.question.choices.map(() => null)),
    review
      ? Promise.all(
          input.question.choices.map((choice) =>
            translate(choice.consequence, "quiz_choice_consequence"),
          ),
        )
      : Promise.resolve(input.question.choices.map(() => null)),
    review
      ? Promise.all(
          input.question.decisionCriteria.map((criterion) =>
            translate(criterion, "quiz_decision_criterion"),
          ),
        )
      : Promise.resolve(null),
    review ? translate(input.question.rationale, "quiz_rationale") : Promise.resolve(null),
    review
      ? Promise.all(
          input.question.practicalNotes.map((note) =>
            translate(note, "quiz_practical_note"),
          ),
        )
      : Promise.resolve(null),
    review
      ? translate(input.question.checkQuestion, "quiz_check_question")
      : Promise.resolve(null),
    review && input.feedback
      ? translate(input.feedback, "quiz_feedback")
      : Promise.resolve(null),
  ]);

  const artifacts = input.question.artifacts.map((artifact, index) => ({
    ...artifact,
    title: artifactTitles[index] ?? null,
  }));
  const choices = input.question.choices.map((choice, index) => ({
    id: choice.id,
    label: choiceLabels[index] ?? null,
    explanation: choiceExplanations[index] ?? null,
    consequence: choiceConsequences[index] ?? null,
  }));

  return {
    questionId: input.question.id,
    scenario,
    artifacts,
    prompt,
    choices,
    decisionCriteria: decisionCriteria
      ? decisionCriteria.filter((value): value is string => value !== null)
      : null,
    rationale,
    practicalNotes: practicalNotes
      ? practicalNotes.filter((value): value is string => value !== null)
      : null,
    checkQuestion,
    feedback,
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
}

export async function getCachedTranslatedQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  providerCacheScope?: string,
): Promise<TranslatedQuizCard> {
  const translate = (sourceText: string, purpose: TranslationPurpose) =>
    getCachedTranslation(sourceText, purpose, repo, providerCacheScope);
  const review = input.revealReview;

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
      input.question.artifacts.map((artifact) =>
        translate(artifact.title, "quiz_artifact_title"),
      ),
    ),
    translate(input.question.prompt, "quiz_prompt"),
    Promise.all(
      input.question.choices.map((choice) => translate(choice.label, "quiz_choice")),
    ),
    review
      ? Promise.all(
          input.question.choices.map((choice) =>
            translate(choice.explanation, "quiz_choice_explanation"),
          ),
        )
      : Promise.resolve(input.question.choices.map(() => null)),
    review
      ? Promise.all(
          input.question.choices.map((choice) =>
            translate(choice.consequence, "quiz_choice_consequence"),
          ),
        )
      : Promise.resolve(input.question.choices.map(() => null)),
    review
      ? Promise.all(
          input.question.decisionCriteria.map((criterion) =>
            translate(criterion, "quiz_decision_criterion"),
          ),
        )
      : Promise.resolve(null),
    review ? translate(input.question.rationale, "quiz_rationale") : Promise.resolve(null),
    review
      ? Promise.all(
          input.question.practicalNotes.map((note) =>
            translate(note, "quiz_practical_note"),
          ),
        )
      : Promise.resolve(null),
    review
      ? translate(input.question.checkQuestion, "quiz_check_question")
      : Promise.resolve(null),
    review && input.feedback
      ? translate(input.feedback, "quiz_feedback")
      : Promise.resolve(null),
  ]);

  const artifacts = input.question.artifacts.map((artifact, index) => ({
    ...artifact,
    title: artifactTitles[index] ?? null,
  }));
  const choices = input.question.choices.map((choice, index) => ({
    id: choice.id,
    label: choiceLabels[index] ?? null,
    explanation: choiceExplanations[index] ?? null,
    consequence: choiceConsequences[index] ?? null,
  }));

  return {
    questionId: input.question.id,
    scenario,
    artifacts,
    prompt,
    choices,
    decisionCriteria: decisionCriteria
      ? decisionCriteria.filter((value): value is string => value !== null)
      : null,
    rationale,
    practicalNotes: practicalNotes
      ? practicalNotes.filter((value): value is string => value !== null)
      : null,
    checkQuestion,
    feedback,
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
