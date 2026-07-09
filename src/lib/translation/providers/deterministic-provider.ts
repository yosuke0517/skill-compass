import type { TranslationProvider } from "../types";

const knownTranslations = new Map<string, string>([
  ["API contract", "API契約"],
  ["reverse proxy", "リバースプロキシ"],
  ["satisfies operator", "satisfies演算子"],
  ["design token", "デザイントークン"],
  ["source", "出典"],
]);

export const deterministicTranslationProvider: TranslationProvider = {
  async translate(input) {
    return {
      translatedText: knownTranslations.get(input.sourceText) ?? `日本語訳: ${input.sourceText}`,
      provider: "deterministic",
    };
  },
};
