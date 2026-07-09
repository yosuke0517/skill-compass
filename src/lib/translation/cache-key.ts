import { createHash } from "node:crypto";
import type { TranslationPurpose } from "./types";

export type TranslationCacheKeyInput = {
  sourceText: string;
  sourceLocale: "en";
  targetLocale: "ja";
  purpose: TranslationPurpose;
  glossaryVersion: string;
};

export function createTranslationCacheKey(input: TranslationCacheKeyInput) {
  const sourceHash = createHash("sha256")
    .update(
      JSON.stringify({
        sourceText: input.sourceText.trim(),
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        purpose: input.purpose,
        glossaryVersion: input.glossaryVersion,
      }),
    )
    .digest("hex");

  return {
    id: `translation_${sourceHash.slice(0, 24)}`,
    sourceHash,
  };
}
