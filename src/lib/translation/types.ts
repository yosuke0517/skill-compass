export type TranslationPurpose =
  | "quiz_scenario"
  | "quiz_artifact_title"
  | "quiz_prompt"
  | "quiz_choice"
  | "quiz_decision_criterion"
  | "quiz_rationale"
  | "quiz_choice_explanation"
  | "quiz_choice_consequence"
  | "quiz_practical_note"
  | "quiz_check_question"
  | "quiz_feedback";

export type TranslationGlossaryEntry = {
  source: string;
  target: string;
};

export type TranslationInput = {
  sourceText: string;
  sourceLocale: "en";
  targetLocale: "ja";
  purpose: TranslationPurpose;
  glossary?: TranslationGlossaryEntry[];
};

export type TranslationResult = {
  translatedText: string;
  provider: string;
};

export type TranslationUnavailableResult = {
  unavailable: true;
  provider: string;
  reason: string;
};

export interface TranslationProvider {
  cacheScope?: string;
  translate(input: TranslationInput): Promise<TranslationResult | TranslationUnavailableResult>;
}
