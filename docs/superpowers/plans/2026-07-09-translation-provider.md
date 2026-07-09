# Translation Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand Japanese translation aid for Today quiz cards using a replaceable provider, cache, and optional local `claude -p` adapter.

**Architecture:** Keep English quiz content canonical and translate only when requested. Add a `translation_cache` table, a `TranslationProvider` interface, cache-first translation service, and a server action that stores translated card content in a short-lived httpOnly cookie so the Today page can reveal translations after revalidation. The local Claude CLI adapter is optional and configured only through environment variables; tests use deterministic and fake providers.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, MySQL, Vitest, Playwright, Node `child_process`, Node `crypto`, jose cookie helpers already used by the app.

## Global Constraints

- Public repository only: do not commit credentials, API keys, private local paths, private project details, private vault details, raw internal specs, local usage logs, Slack/X operations, or billing details.
- English remains the canonical quiz content.
- Translation is a learning aid only; scoring and correctness stay based on original English quiz data.
- Translation provider must be replaceable.
- `claude_cli` provider must be optional and configured through environment variables.
- Cache must be checked before calling a provider.
- Tests must not call real LLMs or local Claude.
- Degrade softly when translation is unavailable.

---

## File Structure

- `src/db/schema.ts`: add `translationCache` table.
- `drizzle/0002_translation_cache.sql`: migration for the cache table.
- `.env.example`: add public-safe translation provider variable names.
- `src/lib/env.ts`: validate translation provider configuration.
- `src/lib/translation/types.ts`: provider and service types.
- `src/lib/translation/glossary.ts`: public-safe glossary and version.
- `src/lib/translation/cache-key.ts`: deterministic hash for cache keys and ids.
- `src/lib/translation/providers/deterministic-provider.ts`: test-safe fallback provider.
- `src/lib/translation/providers/disabled-provider.ts`: no-external-call provider.
- `src/lib/translation/providers/claude-cli-provider.ts`: optional local CLI adapter.
- `src/lib/translation/provider.ts`: provider selection from env.
- `src/lib/translation/translate-text.ts`: cache-first service.
- `src/lib/translation/translate-quiz-card.ts`: translates prompt, choices, and feedback for one card.
- `src/app/actions/translation.ts`: server action that translates a quiz card and stores translated data in a cookie.
- `src/components/quiz/quiz-translation-panel.tsx`: translated content display.
- `src/components/quiz/quiz-question-card.tsx`: translation button and panel placement.
- `src/app/(app)/today/page.tsx`: reads translated card cookie and passes translations into cards.
- `src/app/globals.css`: styles translation button and panel.
- `tests/unit/translation-cache.test.ts`: cache-key and cache-hit service tests.
- `tests/unit/translation-provider.test.ts`: provider selection and Claude CLI adapter behavior.
- `tests/e2e/quiz-translation.spec.ts`: user clicks translate and sees Japanese panel.
- `docs/superpowers/progress/skill-compass-mvp.md`: record Task 9.5 completion.

## Task 1: Add Translation Cache Schema and Environment Configuration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0002_translation_cache.sql`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Test: `tests/unit/env.test.ts`
- Test: `tests/unit/schema-shape.test.ts`

**Interfaces:**
- Produces: `translationCache` Drizzle table.
- Produces: env fields `TRANSLATION_PROVIDER`, `CLAUDE_CLI_COMMAND`, and `CLAUDE_CLI_TIMEOUT_MS`.
- Consumes: existing Drizzle and Zod patterns.

- [ ] **Step 1: Extend failing env test**

Modify `tests/unit/env.test.ts` to include translation settings in the accepted local configuration test:

```ts
const env = parseEnv({
  DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
  SKILL_COMPASS_PASSWORD: "local-password",
  SESSION_SECRET: "12345678901234567890123456789012",
  MARKDOWN_EXPORT_DIR: "./exports/skill-compass",
  LLM_PROVIDER: "deterministic",
  NOTE_WRITER: "filesystem",
  TRANSLATION_PROVIDER: "deterministic",
  CLAUDE_CLI_COMMAND: "claude",
  CLAUDE_CLI_TIMEOUT_MS: "10000",
});

expect(env.TRANSLATION_PROVIDER).toBe("deterministic");
expect(env.CLAUDE_CLI_COMMAND).toBe("claude");
expect(env.CLAUDE_CLI_TIMEOUT_MS).toBe(10000);
```

Add a new test:

```ts
it("rejects an unknown translation provider", () => {
  expect(() =>
    parseEnv({
      DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
      SKILL_COMPASS_PASSWORD: "local-password",
      SESSION_SECRET: "12345678901234567890123456789012",
      TRANSLATION_PROVIDER: "remote-secret-provider",
    }),
  ).toThrow(/TRANSLATION_PROVIDER/);
});
```

- [ ] **Step 2: Run env test to verify failure**

Run:

```bash
pnpm test -- tests/unit/env.test.ts
```

Expected: FAIL because `TRANSLATION_PROVIDER`, `CLAUDE_CLI_COMMAND`, and `CLAUDE_CLI_TIMEOUT_MS` are not parsed yet.

- [ ] **Step 3: Implement env validation**

Modify `src/lib/env.ts`:

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SKILL_COMPASS_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  MARKDOWN_EXPORT_DIR: z.string().default("./exports/skill-compass"),
  LLM_PROVIDER: z.enum(["deterministic"]).default("deterministic"),
  NOTE_WRITER: z.enum(["filesystem"]).default("filesystem"),
  TRANSLATION_PROVIDER: z.enum(["deterministic", "disabled", "claude_cli"]).default("deterministic"),
  CLAUDE_CLI_COMMAND: z.string().min(1).default("claude"),
  CLAUDE_CLI_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});
```

- [ ] **Step 4: Update `.env.example`**

Append:

```dotenv
TRANSLATION_PROVIDER=deterministic
CLAUDE_CLI_COMMAND=claude
CLAUDE_CLI_TIMEOUT_MS=10000
```

- [ ] **Step 5: Extend schema shape test**

Modify `tests/unit/schema-shape.test.ts` to import and assert the table name:

```ts
import { translationCache } from "@/db/schema";

expect(translationCache).toBeDefined();
```

Run:

```bash
pnpm test -- tests/unit/schema-shape.test.ts
```

Expected: FAIL because `translationCache` does not exist.

- [ ] **Step 6: Add schema table**

Modify `src/db/schema.ts`:

```ts
export const translationCache = mysqlTable(
  "translation_cache",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    sourceText: text("source_text").notNull(),
    sourceLocale: varchar("source_locale", { length: 8 }).notNull(),
    targetLocale: varchar("target_locale", { length: 8 }).notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    translatedText: text("translated_text").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    lastUsedAt: timestamp("last_used_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("translation_cache_source_hash_idx").on(table.sourceHash)],
);
```

- [ ] **Step 7: Add SQL migration**

Create `drizzle/0002_translation_cache.sql`:

```sql
CREATE TABLE `translation_cache` (
  `id` varchar(64) NOT NULL,
  `source_hash` varchar(64) NOT NULL,
  `source_text` text NOT NULL,
  `source_locale` varchar(8) NOT NULL,
  `target_locale` varchar(8) NOT NULL,
  `purpose` varchar(64) NOT NULL,
  `translated_text` text NOT NULL,
  `provider` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `translation_cache_id` PRIMARY KEY(`id`),
  CONSTRAINT `translation_cache_source_hash_idx` UNIQUE(`source_hash`)
);
```

- [ ] **Step 8: Verify Task 1**

Run:

```bash
pnpm test -- tests/unit/env.test.ts tests/unit/schema-shape.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add .env.example src/lib/env.ts src/db/schema.ts drizzle/0002_translation_cache.sql tests/unit/env.test.ts tests/unit/schema-shape.test.ts
git commit -m "feat: add translation cache configuration"
```

## Task 2: Add Translation Providers and Cache-First Service

**Files:**
- Create: `src/lib/translation/types.ts`
- Create: `src/lib/translation/glossary.ts`
- Create: `src/lib/translation/cache-key.ts`
- Create: `src/lib/translation/providers/deterministic-provider.ts`
- Create: `src/lib/translation/providers/disabled-provider.ts`
- Create: `src/lib/translation/providers/claude-cli-provider.ts`
- Create: `src/lib/translation/provider.ts`
- Create: `src/lib/translation/translate-text.ts`
- Test: `tests/unit/translation-cache.test.ts`
- Test: `tests/unit/translation-provider.test.ts`

**Interfaces:**
- Consumes: `translationCache` table and env fields from Task 1.
- Produces: `translateText(input, repository, provider): Promise<TranslationServiceResult>`.
- Produces: `getTranslationProvider(): TranslationProvider`.
- Produces: `createClaudeCliTranslationProvider(options): TranslationProvider`.

- [ ] **Step 1: Write failing cache service test**

Create `tests/unit/translation-cache.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run cache test to verify failure**

Run:

```bash
pnpm test -- tests/unit/translation-cache.test.ts
```

Expected: FAIL because translation modules do not exist.

- [ ] **Step 3: Add translation types**

Create `src/lib/translation/types.ts`:

```ts
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
  translate(input: TranslationInput): Promise<TranslationResult | TranslationUnavailableResult>;
}
```

- [ ] **Step 4: Add glossary**

Create `src/lib/translation/glossary.ts`:

```ts
import type { TranslationGlossaryEntry } from "./types";

export const TRANSLATION_GLOSSARY_VERSION = "2026-07-09";

export const translationGlossary: TranslationGlossaryEntry[] = [
  { source: "API contract", target: "API契約" },
  { source: "reverse proxy", target: "リバースプロキシ" },
  { source: "satisfies operator", target: "satisfies演算子" },
  { source: "design token", target: "デザイントークン" },
  { source: "source", target: "出典" },
];
```

- [ ] **Step 5: Add cache key helper**

Create `src/lib/translation/cache-key.ts`:

```ts
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
```

- [ ] **Step 6: Add deterministic and disabled providers**

Create `src/lib/translation/providers/deterministic-provider.ts`:

```ts
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
```

Create `src/lib/translation/providers/disabled-provider.ts`:

```ts
import type { TranslationProvider } from "../types";

export const disabledTranslationProvider: TranslationProvider = {
  async translate() {
    return {
      unavailable: true,
      provider: "disabled",
      reason: "Translation provider is disabled.",
    };
  },
};
```

- [ ] **Step 7: Add cache-first service**

Create `src/lib/translation/translate-text.ts`:

```ts
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
  });
  const cached = await repo.findBySourceHash(key.sourceHash);
  if (cached) {
    await repo.touchCache(key.sourceHash);
    return { status: "translated", translatedText: cached.translatedText, provider: cached.provider, cached: true };
  }

  const result = await provider.translate({ ...input, glossary: input.glossary ?? translationGlossary });
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
```

- [ ] **Step 8: Verify cache test passes**

Run:

```bash
pnpm test -- tests/unit/translation-cache.test.ts
```

Expected: PASS.

- [ ] **Step 9: Write failing provider test**

Create `tests/unit/translation-provider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createClaudeCliTranslationProvider } from "@/lib/translation/providers/claude-cli-provider";

describe("claude cli translation provider", () => {
  it("passes a glossary-aware prompt to the configured command", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const provider = createClaudeCliTranslationProvider({
      command: "claude",
      timeoutMs: 1000,
      execFile: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "API契約", stderr: "" };
      },
    });

    const result = await provider.translate({
      sourceText: "API contract",
      sourceLocale: "en",
      targetLocale: "ja",
      purpose: "quiz_prompt",
      glossary: [{ source: "API contract", target: "API契約" }],
    });

    expect(result).toEqual({ translatedText: "API契約", provider: "claude_cli" });
    expect(calls[0]?.command).toBe("claude");
    expect(calls[0]?.args).toEqual(["-p", expect.stringContaining("API contract")]);
  });
});
```

- [ ] **Step 10: Run provider test to verify failure**

Run:

```bash
pnpm test -- tests/unit/translation-provider.test.ts
```

Expected: FAIL because `claude-cli-provider.ts` does not exist.

- [ ] **Step 11: Add Claude CLI provider**

Create `src/lib/translation/providers/claude-cli-provider.ts`:

```ts
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import type { TranslationProvider } from "../types";

const execFileAsync = promisify(nodeExecFile);

type ExecFile = (command: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string; stderr: string }>;

export function createClaudeCliTranslationProvider(options: {
  command: string;
  timeoutMs: number;
  execFile?: ExecFile;
}): TranslationProvider {
  const execFile = options.execFile ?? execFileAsync;

  return {
    async translate(input) {
      const prompt = buildPrompt(input);
      try {
        const result = await execFile(options.command, ["-p", prompt], { timeout: options.timeoutMs });
        const translatedText = result.stdout.trim();
        if (!translatedText) {
          return { unavailable: true, provider: "claude_cli", reason: "Claude CLI returned empty output." };
        }
        return { translatedText, provider: "claude_cli" };
      } catch {
        return { unavailable: true, provider: "claude_cli", reason: "Claude CLI translation failed." };
      }
    },
  };
}

function buildPrompt(input: Parameters<TranslationProvider["translate"]>[0]): string {
  const glossary = (input.glossary ?? [])
    .map((entry) => `- ${entry.source} => ${entry.target}`)
    .join("\n");

  return [
    "Translate the following English engineering learning text into natural Japanese.",
    "Return only the translated Japanese text. Do not add explanations.",
    "Preserve technical terms according to this glossary:",
    glossary || "- No glossary entries",
    `Purpose: ${input.purpose}`,
    "Text:",
    input.sourceText,
  ].join("\n");
}
```

- [ ] **Step 12: Add provider selector**

Create `src/lib/translation/provider.ts`:

```ts
import { getEnv } from "@/lib/env";
import { createClaudeCliTranslationProvider } from "./providers/claude-cli-provider";
import { deterministicTranslationProvider } from "./providers/deterministic-provider";
import { disabledTranslationProvider } from "./providers/disabled-provider";
import type { TranslationProvider } from "./types";

export function getTranslationProvider(): TranslationProvider {
  const env = getEnv();
  switch (env.TRANSLATION_PROVIDER) {
    case "claude_cli":
      return createClaudeCliTranslationProvider({
        command: env.CLAUDE_CLI_COMMAND,
        timeoutMs: env.CLAUDE_CLI_TIMEOUT_MS,
      });
    case "disabled":
      return disabledTranslationProvider;
    case "deterministic":
      return deterministicTranslationProvider;
  }
}
```

- [ ] **Step 13: Verify Task 2**

Run:

```bash
pnpm test -- tests/unit/translation-cache.test.ts tests/unit/translation-provider.test.ts
pnpm typecheck
pnpm lint
```

Expected: PASS. No real `claude` command is executed.

- [ ] **Step 14: Commit Task 2**

```bash
git add src/lib/translation tests/unit/translation-cache.test.ts tests/unit/translation-provider.test.ts
git commit -m "feat: add translation provider cache service"
```

## Task 3: Translate Today Quiz Cards On Demand

**Files:**
- Create: `src/lib/translation/translate-quiz-card.ts`
- Create: `src/app/actions/translation.ts`
- Create: `src/components/quiz/quiz-translation-panel.tsx`
- Modify: `src/components/quiz/quiz-question-card.tsx`
- Modify: `src/app/(app)/today/page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/translate-quiz-card.test.ts`

**Interfaces:**
- Consumes: `translateText(input, repo, provider)` and `getTranslationProvider()`.
- Produces: `translateQuizCard(input, repo, provider): Promise<TranslatedQuizCard>`.
- Produces: `translateQuizCardAction(formData: FormData)`.

- [ ] **Step 1: Write failing card translation test**

Create `tests/unit/translate-quiz-card.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { translateQuizCard } from "@/lib/translation/translate-quiz-card";
import type { TranslationRepository } from "@/lib/translation/translate-text";
import type { TranslationProvider } from "@/lib/translation/types";

describe("translateQuizCard", () => {
  it("translates prompt, choices, and feedback", async () => {
    const repo: TranslationRepository = {
      async findBySourceHash() {
        return null;
      },
      async saveTranslation() {},
      async touchCache() {},
    };
    const provider: TranslationProvider = {
      async translate(input) {
        return { translatedText: `日本語訳: ${input.sourceText}`, provider: "deterministic" };
      },
    };

    const result = await translateQuizCard(
      {
        question: {
          id: "q1",
          prompt: "What does a reverse proxy usually do?",
          choices: [
            { id: "a", label: "Forwards client requests.", correct: true },
            { id: "b", label: "Compiles frontend assets.", correct: false },
          ],
        },
        feedback: "Review the linked source.",
      },
      repo,
      provider,
    );

    expect(result.prompt).toBe("日本語訳: What does a reverse proxy usually do?");
    expect(result.choices[0]).toEqual({ id: "a", label: "日本語訳: Forwards client requests." });
    expect(result.feedback).toBe("日本語訳: Review the linked source.");
  });
});
```

- [ ] **Step 2: Run card translation test to verify failure**

Run:

```bash
pnpm test -- tests/unit/translate-quiz-card.test.ts
```

Expected: FAIL because `translate-quiz-card.ts` does not exist.

- [ ] **Step 3: Implement quiz card translation service**

Create `src/lib/translation/translate-quiz-card.ts`:

```ts
import { translateText, type TranslationRepository } from "./translate-text";
import type { TranslationProvider } from "./types";

export type TranslateQuizCardInput = {
  question: {
    id: string;
    prompt: string;
    choices: Array<{ id: string; label: string; correct: boolean }>;
  };
  feedback?: string | null;
};

export type TranslatedQuizCard = {
  questionId: string;
  prompt: string | null;
  choices: Array<{ id: string; label: string | null }>;
  feedback: string | null;
  unavailable: boolean;
};

export async function translateQuizCard(
  input: TranslateQuizCardInput,
  repo: TranslationRepository,
  provider: TranslationProvider,
): Promise<TranslatedQuizCard> {
  const prompt = await translateText(
    { sourceText: input.question.prompt, sourceLocale: "en", targetLocale: "ja", purpose: "quiz_prompt" },
    repo,
    provider,
  );
  const choices = await Promise.all(
    input.question.choices.map(async (choice) => {
      const result = await translateText(
        { sourceText: choice.label, sourceLocale: "en", targetLocale: "ja", purpose: "quiz_choice" },
        repo,
        provider,
      );
      return { id: choice.id, label: result.status === "translated" ? result.translatedText : null };
    }),
  );
  const feedback = input.feedback
    ? await translateText(
        { sourceText: input.feedback, sourceLocale: "en", targetLocale: "ja", purpose: "quiz_feedback" },
        repo,
        provider,
      )
    : null;

  return {
    questionId: input.question.id,
    prompt: prompt.status === "translated" ? prompt.translatedText : null,
    choices,
    feedback: feedback?.status === "translated" ? feedback.translatedText : null,
    unavailable: prompt.status === "unavailable" || choices.some((choice) => choice.label === null),
  };
}
```

- [ ] **Step 4: Verify card translation test passes**

Run:

```bash
pnpm test -- tests/unit/translate-quiz-card.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add translation server action**

Create `src/app/actions/translation.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTodayQuiz } from "@/lib/quiz/get-today-quiz";
import { getTranslationProvider } from "@/lib/translation/provider";
import { translateQuizCard, type TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { createDrizzleTranslationRepository } from "@/lib/translation/translate-text";

const TRANSLATED_QUIZ_COOKIE = "skill_compass_translated_quiz";

export async function translateQuizCardAction(formData: FormData) {
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) redirect("/today");

  const quiz = await getTodayQuiz();
  const item = quiz.questions.find((entry) => entry.question.id === questionId);
  if (!item) redirect("/today");

  const translated = await translateQuizCard(
    {
      question: item.question,
      feedback: item.answer?.feedback ?? null,
    },
    createDrizzleTranslationRepository(),
    getTranslationProvider(),
  );

  const cookieStore = await cookies();
  const existing = parseTranslatedCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
  existing[questionId] = translated;
  cookieStore.set(TRANSLATED_QUIZ_COOKIE, JSON.stringify(existing), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  revalidatePath("/today");
  redirect("/today");
}

export async function getTranslatedQuizCards(): Promise<Record<string, TranslatedQuizCard>> {
  const cookieStore = await cookies();
  return parseTranslatedCookie(cookieStore.get(TRANSLATED_QUIZ_COOKIE)?.value);
}

function parseTranslatedCookie(value: string | undefined): Record<string, TranslatedQuizCard> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 6: Add translation panel component**

Create `src/components/quiz/quiz-translation-panel.tsx`:

```tsx
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";

export function QuizTranslationPanel({ translation }: { translation: TranslatedQuizCard }) {
  if (translation.unavailable || translation.prompt === null) {
    return <p className="translation-unavailable">Japanese translation is unavailable right now.</p>;
  }

  return (
    <section className="translation-panel" aria-label="Japanese translation">
      <p>{translation.prompt}</p>
      <ol>
        {translation.choices.map((choice) => (
          <li key={choice.id}>{choice.label ?? "翻訳できませんでした"}</li>
        ))}
      </ol>
      {translation.feedback ? <strong>{translation.feedback}</strong> : null}
    </section>
  );
}
```

- [ ] **Step 7: Wire card UI**

Modify `src/components/quiz/quiz-question-card.tsx`:

```tsx
import { Languages } from "lucide-react";
import { translateQuizCardAction } from "@/app/actions/translation";
import type { TranslatedQuizCard } from "@/lib/translation/translate-quiz-card";
import { QuizTranslationPanel } from "./quiz-translation-panel";

type QuizQuestionCardProps = {
  quizDayId: string;
  item: TodayQuizQuestion;
  translation?: TranslatedQuizCard;
};
```

Inside the header, add:

```tsx
<form action={translateQuizCardAction}>
  <input type="hidden" name="questionId" value={item.question.id} />
  <button type="submit" className="icon-button" title="Translate to Japanese" aria-label="Translate to Japanese">
    <Languages size={17} aria-hidden="true" />
  </button>
</form>
```

After the `<h2>`:

```tsx
{translation ? <QuizTranslationPanel translation={translation} /> : null}
```

- [ ] **Step 8: Pass translations from Today page**

Modify `src/app/(app)/today/page.tsx`:

```tsx
import { getTranslatedQuizCards } from "@/app/actions/translation";

const [{ error }, quiz, translations] = await Promise.all([searchParams, getTodayQuiz(), getTranslatedQuizCards()]);
```

Pass into cards:

```tsx
<QuizQuestionCard
  key={item.question.id}
  quizDayId={quiz.quizDayId}
  item={item}
  translation={translations[item.question.id]}
/>
```

- [ ] **Step 9: Add styles**

Modify `src/app/globals.css`:

```css
.icon-button {
  background: #edf3f1;
  color: var(--accent-dark);
  min-height: 34px;
  padding: 0;
  width: 34px;
}

.translation-panel,
.translation-unavailable {
  background: #f1f6f4;
  border: 1px solid #d7e5df;
  border-radius: 16px;
  color: var(--ink-soft);
  font-size: 0.9rem;
  line-height: 1.55;
  margin: 0;
  padding: 12px;
}

.translation-panel p {
  color: var(--foreground);
  margin: 0 0 8px;
}

.translation-panel ol {
  margin: 0;
  padding-left: 20px;
}

.translation-panel strong {
  color: var(--accent-dark);
  display: block;
  margin-top: 8px;
}
```

- [ ] **Step 10: Verify Task 3**

Run:

```bash
pnpm test -- tests/unit/translate-quiz-card.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

```bash
git add src/lib/translation/translate-quiz-card.ts src/app/actions/translation.ts src/components/quiz/quiz-translation-panel.tsx src/components/quiz/quiz-question-card.tsx 'src/app/(app)/today/page.tsx' src/app/globals.css tests/unit/translate-quiz-card.test.ts
git commit -m "feat: add quiz card translation action"
```

## Task 4: Add E2E Coverage, Progress Tracking, and Final Verification

**Files:**
- Create: `tests/e2e/quiz-translation.spec.ts`
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`

**Interfaces:**
- Consumes: Today quiz translation UI from Task 3.
- Produces: browser-level coverage that translation can be requested without blocking quiz answering.

- [ ] **Step 1: Write E2E test**

Create `tests/e2e/quiz-translation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("user can request Japanese translation for a quiz card", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("link", { name: "Today" }).click();

  await expect(page).toHaveURL(/\/today/);
  await page.getByLabel("Translate to Japanese").first().click();

  await expect(page.getByLabel("Japanese translation").first()).toBeVisible();
  await expect(page.getByText(/日本語訳|API契約|リバースプロキシ/).first()).toBeVisible();

  const unanswered = page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Submit answer" }) }).first();
  if ((await unanswered.count()) > 0) {
    await unanswered.locator('input[name="selectedChoiceId"]').first().check();
    await unanswered.locator('textarea[name="reasoning"]').fill("I checked the translated aid and compared it with the English prompt.");
    await unanswered.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.locator(".answer-feedback").first()).toBeVisible();
  }
});
```

- [ ] **Step 2: Run E2E test**

Run:

```bash
pnpm test:e2e -- tests/e2e/quiz-translation.spec.ts
```

Expected: PASS. The Playwright web server uses `TRANSLATION_PROVIDER=deterministic` from the app defaults unless the config overrides it.

- [ ] **Step 3: Capture screenshot evidence**

Run a local dev server with public-safe dummy env values:

```bash
DATABASE_URL=mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass \
SKILL_COMPASS_PASSWORD=local-password \
SESSION_SECRET=12345678901234567890123456789012 \
MARKDOWN_EXPORT_DIR=./exports/skill-compass \
LLM_PROVIDER=deterministic \
NOTE_WRITER=filesystem \
TRANSLATION_PROVIDER=deterministic \
pnpm dev
```

Use Playwright to log in, open `/today`, click the first translation button, and save:

```text
.evidence/task9-5-quiz-translation.jpg
```

Expected: screenshot shows a Japanese translation panel inside a quiz card and no horizontal overflow at 390px width.

- [ ] **Step 4: Update progress tracker**

Modify `docs/superpowers/progress/skill-compass-mvp.md`:

```md
- Task 9.5: added cache-first Japanese quiz card translation with optional Claude CLI provider.
```

Set current task back to:

```md
Task 10: implement skills, concepts, sources, and settings screens.
```

- [ ] **Step 5: Final verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/quiz-translation.spec.ts
git status --short --branch
```

Expected:

- Vitest passes.
- TypeScript passes.
- ESLint passes.
- Next build passes.
- E2E passes.
- Git status shows only intended Task 9.5 files before commit.

- [ ] **Step 6: Commit Task 4**

```bash
git add tests/e2e/quiz-translation.spec.ts docs/superpowers/progress/skill-compass-mvp.md
git commit -m "test: cover quiz translation flow"
```

## Final Completion Criteria

Task 9.5 is complete when:

- The app has a `translation_cache` table and migration.
- Translation provider selection supports `deterministic`, `disabled`, and `claude_cli`.
- Real `claude -p` is never called in tests.
- Today quiz cards expose a translate button.
- Translation results are cache-first.
- Provider failures show an unavailable state instead of blocking quiz answering.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and quiz translation E2E pass.
- Progress tracker is updated.
