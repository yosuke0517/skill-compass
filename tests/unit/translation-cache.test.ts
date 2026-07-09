import { describe, expect, it } from "vitest";
import { createTranslationCacheKey } from "@/lib/translation/cache-key";
import { translateText, type TranslationRepository } from "@/lib/translation/translate-text";
import type { TranslationProvider } from "@/lib/translation/types";

describe("translation cache", () => {
  it("returns cached text without calling provider", async () => {
    let providerCalls = 0;
    const repo: TranslationRepository = {
      async findBySourceHash() {
        return {
          translatedText: "API契約",
          provider: "deterministic",
        };
      },
      async saveTranslation() {
        throw new Error("cache hit must not write");
      },
      async touchCache() {},
    };
    const provider: TranslationProvider = {
      async translate() {
        providerCalls += 1;
        return { translatedText: "wrong", provider: "test" };
      },
    };

    const result = await translateText(
      {
        sourceText: "API contract",
        sourceLocale: "en",
        targetLocale: "ja",
        purpose: "quiz_prompt",
      },
      repo,
      provider,
    );

    expect(result).toEqual({ status: "translated", translatedText: "API契約", provider: "deterministic", cached: true });
    expect(providerCalls).toBe(0);
  });

  it("changes hash when glossary version changes", () => {
    const first = createTranslationCacheKey({
      sourceText: "reverse proxy",
      sourceLocale: "en",
      targetLocale: "ja",
      purpose: "quiz_prompt",
      glossaryVersion: "v1",
    });
    const second = createTranslationCacheKey({
      sourceText: "reverse proxy",
      sourceLocale: "en",
      targetLocale: "ja",
      purpose: "quiz_prompt",
      glossaryVersion: "v2",
    });

    expect(first.sourceHash).not.toBe(second.sourceHash);
  });

  it("returns unavailable when the provider throws", async () => {
    let saveCalls = 0;
    const repo: TranslationRepository = {
      async findBySourceHash() {
        return null;
      },
      async saveTranslation() {
        saveCalls += 1;
      },
      async touchCache() {},
    };
    const provider: TranslationProvider = {
      async translate() {
        throw new Error("provider exploded");
      },
    };

    const result = await translateText(
      {
        sourceText: "API contract",
        sourceLocale: "en",
        targetLocale: "ja",
        purpose: "quiz_prompt",
      },
      repo,
      provider,
    );

    expect(result).toEqual({
      status: "unavailable",
      provider: "unknown",
      reason: "translation provider threw",
    });
    expect(saveCalls).toBe(0);
  });
});
