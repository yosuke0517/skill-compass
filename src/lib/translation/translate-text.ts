import { eq } from "drizzle-orm";
import { translationCache } from "@/db/schema";
import { createTranslationCacheKey } from "./cache-key";
import { TRANSLATION_GLOSSARY_VERSION, translationGlossary } from "./glossary";
import type { TranslationInput, TranslationProvider } from "./types";

export type TranslationCacheRecord = {
  translatedText: string;
  provider: string;
};

export type TranslationRepository = {
  findBySourceHash(sourceHash: string): Promise<TranslationCacheRecord | null>;
  saveTranslation(input: {
    id: string;
    sourceHash: string;
    sourceText: string;
    sourceLocale: "en";
    targetLocale: "ja";
    purpose: string;
    translatedText: string;
    provider: string;
  }): Promise<void>;
  touchCache(sourceHash: string): Promise<void>;
};

export type TranslationServiceResult =
  | { status: "translated"; translatedText: string; provider: string; cached: boolean }
  | { status: "unavailable"; provider: string; reason: string };

export async function translateText(
  input: TranslationInput,
  repo: TranslationRepository,
  provider: TranslationProvider,
): Promise<TranslationServiceResult> {
  const key = createTranslationCacheKey({
    sourceText: input.sourceText,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    purpose: input.purpose,
    glossaryVersion: TRANSLATION_GLOSSARY_VERSION,
    providerCacheScope: provider.cacheScope,
  });

  const cached = await repo.findBySourceHash(key.sourceHash);
  if (cached) {
    await repo.touchCache(key.sourceHash);
    return { status: "translated", translatedText: cached.translatedText, provider: cached.provider, cached: true };
  }

  let result;
  try {
    result = await provider.translate({ ...input, glossary: input.glossary ?? translationGlossary });
  } catch {
    return {
      status: "unavailable",
      provider: "unknown",
      reason: "translation provider threw",
    };
  }

  if ("unavailable" in result) {
    return { status: "unavailable", provider: result.provider, reason: result.reason };
  }

  await repo.saveTranslation({
    id: key.id,
    sourceHash: key.sourceHash,
    sourceText: input.sourceText,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    purpose: input.purpose,
    translatedText: result.translatedText,
    provider: result.provider,
  });

  return { status: "translated", translatedText: result.translatedText, provider: result.provider, cached: false };
}

export function createDrizzleTranslationRepository(): TranslationRepository {
  const getDb = async () => {
    const { db } = await import("@/db/client");
    return db;
  };

  return {
    async findBySourceHash(sourceHash) {
      const db = await getDb();
      const [cached] = await db.select().from(translationCache).where(eq(translationCache.sourceHash, sourceHash)).limit(1);
      return cached ? { translatedText: cached.translatedText, provider: cached.provider } : null;
    },
    async saveTranslation(input) {
      const db = await getDb();
      await db.insert(translationCache).ignore().values(input);
    },
    async touchCache(sourceHash) {
      const db = await getDb();
      await db.update(translationCache).set({ lastUsedAt: new Date() }).where(eq(translationCache.sourceHash, sourceHash));
    },
  };
}
