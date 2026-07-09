import type { TranslationProvider } from "../types";

export const disabledTranslationProvider: TranslationProvider = {
  cacheScope: "disabled",
  async translate() {
    return {
      unavailable: true,
      provider: "disabled",
      reason: "Translation provider is disabled.",
    };
  },
};
