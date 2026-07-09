export type TranslationPurpose = "quiz_prompt" | "quiz_choice" | "quiz_feedback";

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
