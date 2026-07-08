# Skill Compass MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public-safe Skill Compass Lite MVP: a self-hosted personal engineering growth app with dashboard-first skill tracking, daily quizzes, sources, concepts, settings, deterministic scoring, and portable Markdown exports.

**Architecture:** Use a Next.js App Router application with server-first pages, server actions for mutations, Drizzle ORM over MySQL, and thin service modules for auth, scoring, quiz selection, source ingestion, note export, LLM evaluation, and scheduled jobs. Keep replaceable integrations behind local interfaces so the first MVP can run with deterministic/mock providers and later swap in real LLM, Markdown, and scheduler implementations.

**Tech Stack:** Next.js App Router, TypeScript, React, MySQL, Drizzle ORM, Docker Compose, Vitest, Testing Library, Playwright, ESLint, Prettier.

## Global Constraints

- Public repository only: do not commit credentials, API keys, private local paths, private project names, private vault details, personal automation details, social media operations, unpublished operational logs, or sensitive business context.
- Use only the public lite design brief at `docs/specs/skill-compass-lite-design.md` as product source material.
- MVP screens: login, dashboard, today's quiz, skills, concepts, sources, settings.
- Visible skill axes: Frontend, Backend, Infrastructure, SQL, LLM.
- Authentication: fixed password login with 24h session.
- Database: MySQL with Drizzle ORM.
- Deployment: Docker Compose for local self-hosting.
- LLM provider, Markdown note writer, and scheduled jobs must be replaceable abstractions.
- Final score changes must be deterministic application behavior; LLM output may only provide structured evaluation metadata.
- Questions must support source grounding and trust tiers.
- Knowledge export must produce portable Markdown artifacts.
- Scheduled jobs must be application-level commands that can run locally or from an external scheduler.

---

## File Structure

Create the application in the repository root without introducing private configuration. The important files and responsibilities are:

- `package.json`: npm scripts for dev, build, test, lint, db migrations, jobs, and Playwright.
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.config.ts`, `playwright.config.ts`: project tooling.
- `.env.example`: public-safe environment variable names and non-secret example values.
- `.gitignore`: excludes local env files, node modules, Next output, coverage, Playwright reports, and generated exports.
- `docker-compose.yml`: local MySQL service and optional app service profile.
- `drizzle.config.ts`: Drizzle migration configuration.
- `src/db/schema.ts`: database tables, enums, relations, and inferred types.
- `src/db/client.ts`: Drizzle client factory.
- `src/db/seed.ts`: public-safe starter data for five categories, tags, concepts, sources, and sample questions.
- `src/lib/env.ts`: validated server environment.
- `src/lib/auth/session.ts`: signed 24h cookie session helpers.
- `src/lib/auth/password.ts`: fixed password verification.
- `src/lib/scoring/*`: deterministic scoring and self-vs-measured gap calculation.
- `src/lib/quiz/*`: daily quiz selection and answer evaluation orchestration.
- `src/lib/llm/*`: replaceable LLM provider interface plus deterministic local provider.
- `src/lib/notes/*`: replaceable Markdown writer interface plus filesystem writer.
- `src/lib/sources/*`: source trust tier model and ingestion status helpers.
- `src/lib/jobs/*`: job registry and command implementations.
- `src/app/(auth)/login/page.tsx`: login page.
- `src/app/(app)/layout.tsx`: authenticated shell and dashboard-first navigation.
- `src/app/(app)/dashboard/page.tsx`: dashboard.
- `src/app/(app)/today/page.tsx`: daily quiz flow.
- `src/app/(app)/skills/page.tsx`: skill categories and tags.
- `src/app/(app)/concepts/page.tsx`: concept review.
- `src/app/(app)/sources/page.tsx`: source management.
- `src/app/(app)/settings/page.tsx`: password/session/export/settings status.
- `src/app/actions/*`: server actions for login, logout, quiz answers, source updates, self-assessments, and export sync.
- `src/components/*`: small reusable UI primitives and screen-specific components.
- `tests/unit/*`: pure logic tests.
- `tests/integration/*`: database/auth/job tests.
- `tests/e2e/*`: Playwright quiz flow tests.

## Implementation Tasks

### Task 1: Scaffold the Next.js App and Tooling

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`

**Interfaces:**
- Produces: a working Next.js App Router project with `npm run dev`, `npm run build`, `npm run lint`, `npm run test`, and `npm run test:e2e`.
- Consumes: none.

- [ ] **Step 1: Initialize dependencies**

Run:

```bash
npm init -y
npm install next react react-dom drizzle-orm mysql2 zod jose clsx lucide-react recharts
npm install -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next prettier vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom playwright tsx drizzle-kit
npx playwright install chromium
```

Expected: `package.json` and `package-lock.json` are created, and dependencies install without errors.

- [ ] **Step 2: Add scripts**

Set `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx src/db/seed.ts",
    "job": "tsx src/lib/jobs/cli.ts"
  }
}
```

- [ ] **Step 3: Add public-safe environment examples**

Create `.env.example`:

```dotenv
DATABASE_URL=mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass
SKILL_COMPASS_PASSWORD=change-me-before-use
SESSION_SECRET=replace-with-at-least-32-random-characters
MARKDOWN_EXPORT_DIR=./exports/skill-compass
LLM_PROVIDER=deterministic
NOTE_WRITER=filesystem
```

- [ ] **Step 4: Add the minimal app shell**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skill Compass",
  description: "Personal engineering growth dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
```

- [ ] **Step 5: Verify scaffold**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs prettier.config.mjs vitest.config.ts playwright.config.ts .gitignore .env.example src/app
git commit -m "chore: scaffold skill compass app"
```

### Task 2: Add Docker Compose, Environment Validation, and Database Wiring

**Files:**
- Create: `docker-compose.yml`
- Create: `drizzle.config.ts`
- Create: `src/lib/env.ts`
- Create: `src/db/client.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `env: AppEnv`, `db`, and a local MySQL service.
- Consumes: environment variable names from `.env.example`.

- [ ] **Step 1: Write failing environment tests**

Create `tests/unit/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts public-safe local configuration", () => {
    const env = parseEnv({
      DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
      SKILL_COMPASS_PASSWORD: "local-password",
      SESSION_SECRET: "12345678901234567890123456789012",
      MARKDOWN_EXPORT_DIR: "./exports/skill-compass",
      LLM_PROVIDER: "deterministic",
      NOTE_WRITER: "filesystem",
    });

    expect(env.LLM_PROVIDER).toBe("deterministic");
  });

  it("rejects a short session secret", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
        SKILL_COMPASS_PASSWORD: "local-password",
        SESSION_SECRET: "short",
      }),
    ).toThrow(/SESSION_SECRET/);
  });
});
```

Run: `npm run test -- tests/unit/env.test.ts`

Expected: FAIL because `src/lib/env.ts` does not exist.

- [ ] **Step 2: Implement environment validation**

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SKILL_COMPASS_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  MARKDOWN_EXPORT_DIR: z.string().default("./exports/skill-compass"),
  LLM_PROVIDER: z.enum(["deterministic"]).default("deterministic"),
  NOTE_WRITER: z.enum(["filesystem"]).default("filesystem"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
```

- [ ] **Step 3: Add MySQL service**

Create `docker-compose.yml`:

```yaml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: skill_compass
      MYSQL_USER: skill_compass
      MYSQL_PASSWORD: skill_compass
      MYSQL_ROOT_PASSWORD: skill_compass_root
    ports:
      - "3306:3306"
    volumes:
      - skill-compass-mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  skill-compass-mysql:
```

- [ ] **Step 4: Add Drizzle config and client**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass",
  },
});
```

Create `src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/lib/env";
import * as schema from "./schema";

const pool = mysql.createPool(env.DATABASE_URL);

export const db = drizzle(pool, { schema, mode: "default" });
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- tests/unit/env.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml drizzle.config.ts src/lib/env.ts src/db/client.ts tests/unit/env.test.ts
git commit -m "chore: add local database configuration"
```

### Task 3: Define the Drizzle Schema and Seed Data

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/seed.ts`
- Test: `tests/unit/schema-shape.test.ts`
- Modify: `drizzle.config.ts`

**Interfaces:**
- Produces: tables for categories, tags, concepts, sources, questions, answers, scores, self-assessments, sessions, exports, and jobs.
- Consumes: `db` from `src/db/client.ts`.

- [ ] **Step 1: Write schema shape tests**

Create `tests/unit/schema-shape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { categories, conceptTags, concepts, sourceTrustTierEnum, tags } from "@/db/schema";

describe("schema", () => {
  it("supports many-to-many concepts and tags", () => {
    expect(conceptTags).toBeDefined();
    expect(categories).toBeDefined();
    expect(tags).toBeDefined();
    expect(concepts).toBeDefined();
  });

  it("defines source trust tiers", () => {
    expect(sourceTrustTierEnum.enumValues).toEqual(["tier1", "tier2", "tier3", "tier4"]);
  });
});
```

Run: `npm run test -- tests/unit/schema-shape.test.ts`

Expected: FAIL because schema does not exist.

- [ ] **Step 2: Implement schema**

Create `src/db/schema.ts` with these tables:

```ts
import {
  boolean,
  date,
  datetime,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

export const difficultyEnum = mysqlEnum("difficulty", ["beginner", "intermediate", "advanced"]);
export const sourceTrustTierEnum = mysqlEnum("source_trust_tier", ["tier1", "tier2", "tier3", "tier4"]);
export const sourceStatusEnum = mysqlEnum("source_status", ["active", "failed", "pending"]);
export const jobStatusEnum = mysqlEnum("job_status", ["pending", "running", "succeeded", "failed"]);

export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  description: text("description"),
  displayOrder: int("display_order").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tags = mysqlTable("tags", {
  id: varchar("id", { length: 64 }).primaryKey(),
  categoryId: varchar("category_id", { length: 64 }).notNull().references(() => categories.id),
  name: varchar("name", { length: 96 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  categoryIdx: index("tags_category_idx").on(table.categoryId),
}));

export const concepts = mysqlTable("concepts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  summary: text("summary"),
  currentUnderstanding: text("current_understanding"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
});

export const conceptTags = mysqlTable("concept_tags", {
  conceptId: varchar("concept_id", { length: 64 }).notNull().references(() => concepts.id),
  tagId: varchar("tag_id", { length: 64 }).notNull().references(() => tags.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.conceptId, table.tagId] }),
}));

export const sources = mysqlTable("sources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 240 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  trustTier: sourceTrustTierEnum("trust_tier").notNull(),
  official: boolean("official").default(false).notNull(),
  status: sourceStatusEnum("status").default("pending").notNull(),
  lastFetchedAt: datetime("last_fetched_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conceptSources = mysqlTable("concept_sources", {
  conceptId: varchar("concept_id", { length: 64 }).notNull().references(() => concepts.id),
  sourceId: varchar("source_id", { length: 64 }).notNull().references(() => sources.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.conceptId, table.sourceId] }),
}));

export const questions = mysqlTable("questions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conceptId: varchar("concept_id", { length: 64 }).notNull().references(() => concepts.id),
  sourceId: varchar("source_id", { length: 64 }).references(() => sources.id),
  prompt: text("prompt").notNull(),
  choices: json("choices").$type<Array<{ id: string; label: string; correct: boolean }>>().notNull(),
  difficulty: difficultyEnum("difficulty").notNull(),
  rationale: text("rationale").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const quizDays = mysqlTable("quiz_days", {
  id: varchar("id", { length: 64 }).primaryKey(),
  quizDate: date("quiz_date").notNull().unique(),
  preparedAt: datetime("prepared_at").notNull(),
});

export const quizDayQuestions = mysqlTable("quiz_day_questions", {
  quizDayId: varchar("quiz_day_id", { length: 64 }).notNull().references(() => quizDays.id),
  questionId: varchar("question_id", { length: 64 }).notNull().references(() => questions.id),
  slot: int("slot").notNull(),
  reason: varchar("reason", { length: 64 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.quizDayId, table.questionId] }),
}));

export const answers = mysqlTable("answers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  quizDayId: varchar("quiz_day_id", { length: 64 }).notNull().references(() => quizDays.id),
  questionId: varchar("question_id", { length: 64 }).notNull().references(() => questions.id),
  selectedChoiceId: varchar("selected_choice_id", { length: 16 }).notNull(),
  confidence: int("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  correct: boolean("correct"),
  reasoningQuality: varchar("reasoning_quality", { length: 32 }),
  feedback: text("feedback"),
  scoreDelta: double("score_delta"),
  nextReviewOn: date("next_review_on"),
  answeredAt: datetime("answered_at").notNull(),
});

export const scores = mysqlTable("scores", {
  id: varchar("id", { length: 64 }).primaryKey(),
  subjectType: mysqlEnum("score_subject_type", ["category", "tag", "concept"])("subject_type").notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  value: double("value").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
}, (table) => ({
  subjectIdx: index("scores_subject_idx").on(table.subjectType, table.subjectId),
}));

export const selfAssessments = mysqlTable("self_assessments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  subjectType: mysqlEnum("self_assessment_subject_type", ["category", "tag"])("subject_type").notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  rating: double("rating").notNull(),
  note: text("note"),
  assessedOn: date("assessed_on").notNull(),
});

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  expiresAt: datetime("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const exportRuns = mysqlTable("export_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: jobStatusEnum("status").notNull(),
  outputPath: varchar("output_path", { length: 1024 }),
  error: text("error"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: datetime("finished_at"),
});

export const jobRuns = mysqlTable("job_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 96 }).notNull(),
  status: jobStatusEnum("status").notNull(),
  error: text("error"),
  startedAt: datetime("started_at").notNull(),
  finishedAt: datetime("finished_at"),
});

export const categoryRelations = relations(categories, ({ many }) => ({
  tags: many(tags),
}));
```

- [ ] **Step 3: Add seed data**

Create `src/db/seed.ts` that inserts the five categories, representative tags, concepts, trusted sources, and enough sample questions for a first daily quiz. Use deterministic IDs such as `cat_frontend`, `tag_frontend_typescript`, and `concept_satisfies_operator`.

- [ ] **Step 4: Verify migrations**

Run:

```bash
docker compose up -d mysql
npm run db:generate
npm run db:migrate
npm run db:seed
npm run test -- tests/unit/schema-shape.test.ts
```

Expected: migrations apply, seed completes, and tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/seed.ts drizzle drizzle.config.ts tests/unit/schema-shape.test.ts docker-compose.yml
git commit -m "feat: add skill compass data model"
```

### Task 4: Implement Fixed Password Authentication and 24h Sessions

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/app/actions/auth.ts`
- Create: `src/middleware.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `tests/unit/auth.test.ts`
- Create: `tests/e2e/login.spec.ts`

**Interfaces:**
- Produces: `verifyPassword(input: string): boolean`, `createSessionCookie(): Promise<string>`, `getSession(): Promise<SessionState>`, `logoutAction()`, `loginAction(formData)`.
- Consumes: `env.SKILL_COMPASS_PASSWORD` and `env.SESSION_SECRET`.

- [ ] **Step 1: Write auth unit tests**

Create `tests/unit/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifyFixedPassword } from "@/lib/auth/password";

describe("verifyFixedPassword", () => {
  it("accepts the configured password", () => {
    expect(verifyFixedPassword("secret", "secret")).toBe(true);
  });

  it("rejects an incorrect password", () => {
    expect(verifyFixedPassword("secret", "wrong")).toBe(false);
  });
});
```

Run: `npm run test -- tests/unit/auth.test.ts`

Expected: FAIL because auth helpers do not exist.

- [ ] **Step 2: Implement password and session helpers**

Create `src/lib/auth/password.ts`:

```ts
export function verifyFixedPassword(expected: string, actual: string): boolean {
  return expected.length > 0 && actual === expected;
}
```

Create `src/lib/auth/session.ts` with a signed cookie named `skill_compass_session`, an expiry of 24 hours from creation, and helpers that redirect unauthenticated users to `/login`.

- [ ] **Step 3: Add login/logout server actions and middleware**

Create `src/app/actions/auth.ts` to validate the password, set the session cookie, and redirect to `/dashboard`.

Create `src/middleware.ts` so `/dashboard`, `/today`, `/skills`, `/concepts`, `/sources`, and `/settings` require a valid session.

- [ ] **Step 4: Add login page**

Create `src/app/(auth)/login/page.tsx` with a single password field and submit button. Keep copy generic and public-safe.

- [ ] **Step 5: Verify**

Run:

```bash
npm run test -- tests/unit/auth.test.ts
npm run test:e2e -- tests/e2e/login.spec.ts
```

Expected: login succeeds with `SKILL_COMPASS_PASSWORD` and protected routes redirect when no session exists.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth src/app/actions/auth.ts src/middleware.ts src/app/'(auth)'/login tests/unit/auth.test.ts tests/e2e/login.spec.ts
git commit -m "feat: add fixed password authentication"
```

### Task 5: Implement Deterministic Scoring and Gap Calculation

**Files:**
- Create: `src/lib/scoring/types.ts`
- Create: `src/lib/scoring/rules.ts`
- Create: `src/lib/scoring/gaps.ts`
- Test: `tests/unit/scoring.test.ts`

**Interfaces:**
- Produces: `calculateScoreDelta(input: ScoreInput): ScoreDelta`, `calculateGap(selfRating: number, measuredScore: number): SkillGap`.
- Consumes: answer correctness, confidence, reasoning quality, and misconception severity.

- [ ] **Step 1: Write scoring tests**

Create `tests/unit/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateGap } from "@/lib/scoring/gaps";
import { calculateScoreDelta } from "@/lib/scoring/rules";

describe("calculateScoreDelta", () => {
  it("rewards correct high-confidence good reasoning", () => {
    expect(
      calculateScoreDelta({
        correct: true,
        confidence: 5,
        reasoningQuality: "good",
        misconceptionSeverity: "none",
      }).delta,
    ).toBeGreaterThan(0.08);
  });

  it("keeps correct low-confidence answers as review candidates", () => {
    const result = calculateScoreDelta({
      correct: true,
      confidence: 1,
      reasoningQuality: "partial",
      misconceptionSeverity: "minor",
    });

    expect(result.delta).toBeGreaterThan(0);
    expect(result.reviewSoon).toBe(true);
  });

  it("penalizes major misconceptions", () => {
    expect(
      calculateScoreDelta({
        correct: false,
        confidence: 5,
        reasoningQuality: "poor",
        misconceptionSeverity: "major",
      }).delta,
    ).toBeLessThan(-0.08);
  });
});

describe("calculateGap", () => {
  it("detects overconfidence", () => {
    expect(calculateGap(0.9, 0.5).label).toBe("overconfidence");
  });
});
```

- [ ] **Step 2: Implement scoring rules**

Create `src/lib/scoring/types.ts`:

```ts
export type ReasoningQuality = "good" | "partial" | "poor";
export type MisconceptionSeverity = "none" | "minor" | "major";

export type ScoreInput = {
  correct: boolean;
  confidence: number;
  reasoningQuality: ReasoningQuality;
  misconceptionSeverity: MisconceptionSeverity;
};

export type ScoreDelta = {
  delta: number;
  reviewSoon: boolean;
  nextReviewDays: number;
};

export type SkillGap = {
  value: number;
  label: "aligned" | "underconfidence" | "overconfidence";
};
```

Create deterministic rules in `src/lib/scoring/rules.ts`:

```ts
import type { ScoreDelta, ScoreInput } from "./types";

export function calculateScoreDelta(input: ScoreInput): ScoreDelta {
  const confidence = Math.min(5, Math.max(1, input.confidence));
  let delta = input.correct ? 0.06 : -0.04;

  if (input.correct && confidence >= 4 && input.reasoningQuality === "good") delta += 0.05;
  if (input.correct && confidence <= 2) delta -= 0.03;
  if (!input.correct && input.reasoningQuality === "partial") delta += 0.03;
  if (input.misconceptionSeverity === "major") delta -= 0.08;
  if (input.misconceptionSeverity === "minor") delta -= 0.02;

  const reviewSoon = !input.correct || confidence <= 2 || input.misconceptionSeverity !== "none";
  const nextReviewDays = reviewSoon ? 2 : input.correct && confidence >= 4 ? 14 : 7;

  return { delta: Number(delta.toFixed(3)), reviewSoon, nextReviewDays };
}
```

Create `src/lib/scoring/gaps.ts`:

```ts
import type { SkillGap } from "./types";

export function calculateGap(selfRating: number, measuredScore: number): SkillGap {
  const value = Number((selfRating - measuredScore).toFixed(3));
  if (value >= 0.2) return { value, label: "overconfidence" };
  if (value <= -0.2) return { value, label: "underconfidence" };
  return { value, label: "aligned" };
}
```

- [ ] **Step 3: Verify**

Run: `npm run test -- tests/unit/scoring.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scoring tests/unit/scoring.test.ts
git commit -m "feat: add deterministic scoring rules"
```

### Task 6: Implement LLM Provider and Quiz Evaluation Abstractions

**Files:**
- Create: `src/lib/llm/types.ts`
- Create: `src/lib/llm/deterministic-provider.ts`
- Create: `src/lib/llm/provider.ts`
- Create: `src/lib/quiz/evaluate-answer.ts`
- Test: `tests/unit/evaluate-answer.test.ts`

**Interfaces:**
- Produces: `LlmProvider`, `getLlmProvider()`, `evaluateAnswer(input): Promise<EvaluatedAnswer>`.
- Consumes: question choices, selected choice, confidence, free-text reasoning, and deterministic scoring rules.

- [ ] **Step 1: Write evaluation test**

Create `tests/unit/evaluate-answer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateAnswer } from "@/lib/quiz/evaluate-answer";
import { deterministicLlmProvider } from "@/lib/llm/deterministic-provider";

describe("evaluateAnswer", () => {
  it("marks correctness deterministically and attaches score delta", async () => {
    const result = await evaluateAnswer(
      {
        question: {
          id: "q1",
          choices: [
            { id: "a", label: "A", correct: false },
            { id: "b", label: "B", correct: true },
          ],
        },
        selectedChoiceId: "b",
        confidence: 5,
        reasoning: "Because the official docs describe this behavior.",
      },
      deterministicLlmProvider,
    );

    expect(result.correct).toBe(true);
    expect(result.scoreDelta.delta).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement provider types**

Create `src/lib/llm/types.ts`:

```ts
import type { MisconceptionSeverity, ReasoningQuality } from "@/lib/scoring/types";

export type LlmEvaluationInput = {
  prompt: string;
  correctChoiceLabel: string;
  selectedChoiceLabel: string;
  reasoning: string;
};

export type LlmEvaluationMetadata = {
  reasoningQuality: ReasoningQuality;
  misconceptionSeverity: MisconceptionSeverity;
  feedback: string;
};

export interface LlmProvider {
  evaluateReasoning(input: LlmEvaluationInput): Promise<LlmEvaluationMetadata>;
}
```

Create `src/lib/llm/deterministic-provider.ts`:

```ts
import type { LlmProvider } from "./types";

export const deterministicLlmProvider: LlmProvider = {
  async evaluateReasoning(input) {
    const reasoning = input.reasoning.toLowerCase();
    const selectedCorrect = input.selectedChoiceLabel === input.correctChoiceLabel;
    return {
      reasoningQuality: selectedCorrect && reasoning.length > 20 ? "good" : reasoning.length > 10 ? "partial" : "poor",
      misconceptionSeverity: selectedCorrect ? "none" : reasoning.includes("guess") ? "minor" : "major",
      feedback: selectedCorrect
        ? "Correct. The reasoning is consistent with the expected answer."
        : "Review the linked source and compare the selected answer with the expected behavior.",
    };
  },
};
```

- [ ] **Step 3: Implement answer evaluation**

Create `src/lib/quiz/evaluate-answer.ts` to combine selected-choice correctness, LLM metadata, and `calculateScoreDelta`. If the provider throws, use correctness plus `reasoningQuality: "partial"`, `misconceptionSeverity: "minor"`, and feedback that evaluation will be retried.

- [ ] **Step 4: Verify**

Run: `npm run test -- tests/unit/evaluate-answer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm src/lib/quiz/evaluate-answer.ts tests/unit/evaluate-answer.test.ts
git commit -m "feat: add replaceable answer evaluation provider"
```

### Task 7: Implement Daily Quiz Selection

**Files:**
- Create: `src/lib/quiz/select-daily-quiz.ts`
- Create: `src/lib/quiz/types.ts`
- Test: `tests/unit/select-daily-quiz.test.ts`

**Interfaces:**
- Produces: `selectDailyQuiz(input: QuizSelectionInput): SelectedQuizQuestion[]`.
- Consumes: available questions, scores, answer history, self-assessment gaps, and existing prepared questions.

- [ ] **Step 1: Write quiz selection tests**

Create `tests/unit/select-daily-quiz.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectDailyQuiz } from "@/lib/quiz/select-daily-quiz";

describe("selectDailyQuiz", () => {
  it("selects five questions with required reason mix when available", () => {
    const selected = selectDailyQuiz({
      today: "2026-07-08",
      questions: Array.from({ length: 12 }, (_, index) => ({
        id: `q${index}`,
        conceptId: `c${index}`,
        categoryId: index < 4 ? "frontend" : index < 8 ? "backend" : "sql",
        difficulty: "intermediate",
        sourceTrustTier: index === 0 ? "tier1" : "tier2",
      })),
      weakConceptIds: ["c0", "c1"],
      strongConceptIds: ["c2"],
      underrepresentedCategoryIds: ["sql"],
      gapCategoryIds: ["backend"],
      recentlyAnsweredQuestionIds: [],
    });

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.reason)).toContain("weakness");
    expect(selected.map((item) => item.reason)).toContain("strength_extension");
    expect(selected.map((item) => item.reason)).toContain("latest_catchup");
    expect(selected.map((item) => item.reason)).toContain("balancing");
  });
});
```

- [ ] **Step 2: Implement selection**

Create `src/lib/quiz/types.ts` and `src/lib/quiz/select-daily-quiz.ts` with deterministic slot filling:

1. Select two weakness questions from `weakConceptIds`.
2. Select one strength extension question from `strongConceptIds`.
3. Select one latest catch-up question prioritizing `tier1` or `tier2` source trust.
4. Select one balancing question from underrepresented or gap categories.
5. Avoid recently answered questions when alternatives exist.
6. If any slot cannot be filled, reuse existing active questions.

- [ ] **Step 3: Verify**

Run: `npm run test -- tests/unit/select-daily-quiz.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/quiz/select-daily-quiz.ts src/lib/quiz/types.ts tests/unit/select-daily-quiz.test.ts
git commit -m "feat: add daily quiz selection"
```

### Task 8: Build Authenticated App Shell and Dashboard

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/app-nav.tsx`
- Create: `src/components/dashboard/radar-chart.tsx`
- Create: `src/components/dashboard/dashboard-summary.tsx`
- Create: `src/lib/dashboard/get-dashboard.ts`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Produces: `/dashboard` as the default authenticated screen.
- Consumes: category scores, quiz progress, streak, weekly accuracy, weak points, improving tags, self-vs-measured gaps, and review prompts.

- [ ] **Step 1: Implement dashboard data query**

Create `src/lib/dashboard/get-dashboard.ts` returning:

```ts
export type DashboardData = {
  categoryScores: Array<{ categoryId: string; name: string; measured: number; selfRating: number | null; gap: number | null }>;
  todayQuiz: { answered: number; total: number };
  streakDays: number;
  weeklyAccuracy: number;
  weakPoints: Array<{ conceptId: string; title: string; score: number }>;
  improvingTags: Array<{ tagId: string; name: string; delta: number }>;
  prompts: Array<{ id: string; label: string; href: string }>;
};
```

- [ ] **Step 2: Build dashboard UI**

Create a quiet dashboard-first UI with:

- five-axis radar chart
- today's quiz progress
- streak
- weekly accuracy
- top weak points
- improving tags
- self-vs-measured gaps
- weekly/monthly review prompts

Use `recharts` for the radar chart and simple CSS modules or global utility classes; avoid a marketing landing page.

- [ ] **Step 3: Verify**

Run:

```bash
npm run build
npm run test:e2e -- tests/e2e/dashboard.spec.ts
```

Expected: dashboard is reachable after login and shows all five skill axes.

- [ ] **Step 4: Commit**

```bash
git add src/app/'(app)' src/components src/lib/dashboard tests/e2e/dashboard.spec.ts
git commit -m "feat: add dashboard-first app shell"
```

### Task 9: Build Today's Quiz Flow

**Files:**
- Create: `src/app/(app)/today/page.tsx`
- Create: `src/app/actions/quiz.ts`
- Create: `src/components/quiz/quiz-question-card.tsx`
- Create: `src/components/quiz/confidence-input.tsx`
- Create: `src/lib/quiz/get-today-quiz.ts`
- Create: `src/lib/quiz/submit-answer.ts`
- Test: `tests/integration/submit-answer.test.ts`
- Test: `tests/e2e/quiz-flow.spec.ts`

**Interfaces:**
- Produces: daily five-question quiz page and answer submission flow.
- Consumes: selected daily quiz, `evaluateAnswer`, scoring rules, answer table, score table, and review scheduling.

- [ ] **Step 1: Write integration test**

Create `tests/integration/submit-answer.test.ts` that seeds one question, submits a correct answer with confidence and reasoning, and asserts:

- answer is saved
- correctness is stored
- feedback is stored
- score delta is deterministic
- next review date is populated

- [ ] **Step 2: Implement quiz loading and submission**

Create `src/lib/quiz/get-today-quiz.ts` to load or prepare today's quiz.

Create `src/lib/quiz/submit-answer.ts` to:

1. Save the raw answer immediately.
2. Evaluate correctness and reasoning.
3. Update answer evaluation fields.
4. Update concept score.
5. Derive tag and category scores from lower-level scores.
6. Continue saving the answer even when LLM evaluation fails.

- [ ] **Step 3: Build quiz UI**

Create a form for each unanswered question with:

- 4-choice selection
- confidence score from 1 to 5
- short reasoning text area
- immediate feedback after submission

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- tests/integration/submit-answer.test.ts
npm run test:e2e -- tests/e2e/quiz-flow.spec.ts
```

Expected: a logged-in user can complete a five-question daily quiz.

- [ ] **Step 5: Commit**

```bash
git add src/app/'(app)'/today src/app/actions/quiz.ts src/components/quiz src/lib/quiz tests/integration/submit-answer.test.ts tests/e2e/quiz-flow.spec.ts
git commit -m "feat: add daily quiz flow"
```

### Task 10: Build Skills, Concepts, Sources, and Settings Screens

**Files:**
- Create: `src/app/(app)/skills/page.tsx`
- Create: `src/app/(app)/concepts/page.tsx`
- Create: `src/app/(app)/sources/page.tsx`
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/app/actions/sources.ts`
- Create: `src/app/actions/self-assessments.ts`
- Create: `src/lib/skills/get-skills.ts`
- Create: `src/lib/concepts/get-concepts.ts`
- Create: `src/lib/sources/get-sources.ts`
- Test: `tests/e2e/mvp-navigation.spec.ts`

**Interfaces:**
- Produces: all required MVP screens.
- Consumes: schema, scoring, self-assessment, source trust tiers, and export settings.

- [ ] **Step 1: Implement read models**

Add query modules for:

- skills by category and tag score
- concepts with related tags, score, next review, and sources
- sources with trust tier, official status, fetch status, and related concept count
- settings status for provider names, export directory, and session behavior

- [ ] **Step 2: Implement self-assessment update**

Create `src/app/actions/self-assessments.ts` to save category-level self ratings between `0` and `1`. Recalculate dashboard gaps through `calculateGap`.

- [ ] **Step 3: Implement source management**

Create `src/app/actions/sources.ts` to add or update user sources with title, URL, trust tier, and official flag. New sources start as `pending`.

- [ ] **Step 4: Build pages**

Build:

- `/skills`: category cards, tag rows, measured score, self rating, gap label.
- `/concepts`: searchable concept list with related tags, current understanding, score, and next review.
- `/sources`: source table with trust tier labels and failure state.
- `/settings`: provider status, export path, session policy, and logout control.

- [ ] **Step 5: Verify**

Run:

```bash
npm run test:e2e -- tests/e2e/mvp-navigation.spec.ts
npm run build
```

Expected: every required MVP screen is reachable from authenticated navigation.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(app)'/skills src/app/'(app)'/concepts src/app/'(app)'/sources src/app/'(app)'/settings src/app/actions/sources.ts src/app/actions/self-assessments.ts src/lib/skills src/lib/concepts src/lib/sources tests/e2e/mvp-navigation.spec.ts
git commit -m "feat: add MVP management screens"
```

### Task 11: Implement Markdown Note Writer and Export Sync

**Files:**
- Create: `src/lib/notes/types.ts`
- Create: `src/lib/notes/markdown.ts`
- Create: `src/lib/notes/filesystem-writer.ts`
- Create: `src/lib/notes/export-sync.ts`
- Test: `tests/unit/markdown-notes.test.ts`
- Test: `tests/integration/export-sync.test.ts`

**Interfaces:**
- Produces: `NoteWriter`, `renderDailyLog`, `renderConceptNote`, `renderWeeklyLog`, `renderMonthlyLog`, `syncMarkdownExport`.
- Consumes: quiz answers, concepts, scores, sources, weekly summaries, monthly reviews, and `env.MARKDOWN_EXPORT_DIR`.

- [ ] **Step 1: Write Markdown tests**

Create `tests/unit/markdown-notes.test.ts` asserting daily logs include:

- answered questions
- correctness
- confidence
- reasoning
- feedback
- score changes
- next review dates

- [ ] **Step 2: Implement Markdown rendering**

Create pure renderers in `src/lib/notes/markdown.ts` for:

- `daily/YYYY-MM-DD.md`
- `concepts/<concept-id>.md`
- `weekly/YYYY-Www.md`
- `monthly/YYYY-MM.md`
- `sources/index.md`

Keep generated Markdown free of private local paths except the user-configured export root, which is never committed.

- [ ] **Step 3: Implement writer abstraction**

Create `src/lib/notes/types.ts`:

```ts
export type NoteFile = {
  relativePath: string;
  contents: string;
};

export interface NoteWriter {
  write(files: NoteFile[]): Promise<void>;
}
```

Create `src/lib/notes/filesystem-writer.ts` using `fs/promises.mkdir` and `fs/promises.writeFile`.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- tests/unit/markdown-notes.test.ts tests/integration/export-sync.test.ts
```

Expected: Markdown output matches snapshots or explicit string assertions, and export sync writes under a temporary directory in tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes tests/unit/markdown-notes.test.ts tests/integration/export-sync.test.ts
git commit -m "feat: add portable markdown export"
```

### Task 12: Implement Scheduled Job Commands

**Files:**
- Create: `src/lib/jobs/types.ts`
- Create: `src/lib/jobs/registry.ts`
- Create: `src/lib/jobs/cli.ts`
- Create: `src/lib/jobs/daily-quiz-preparation.ts`
- Create: `src/lib/jobs/source-ingestion.ts`
- Create: `src/lib/jobs/weekly-summary.ts`
- Create: `src/lib/jobs/monthly-self-assessment.ts`
- Create: `src/lib/jobs/markdown-export-sync.ts`
- Test: `tests/unit/jobs.test.ts`
- Test: `tests/integration/jobs.test.ts`

**Interfaces:**
- Produces: `npm run job -- <job-name>` for `daily-quiz-preparation`, `source-ingestion`, `weekly-summary`, `monthly-self-assessment`, and `markdown-export-sync`.
- Consumes: quiz selection, source status helpers, note export, deterministic LLM provider, and job run table.

- [ ] **Step 1: Write job tests**

Create `tests/unit/jobs.test.ts` asserting that all required job names are registered and unknown job names return a non-zero CLI result.

- [ ] **Step 2: Implement job interface**

Create `src/lib/jobs/types.ts`:

```ts
export type JobContext = {
  now: Date;
};

export type JobResult = {
  ok: boolean;
  message: string;
};

export interface ScheduledJob {
  name: string;
  run(context: JobContext): Promise<JobResult>;
}
```

- [ ] **Step 3: Implement commands**

Implement application-level jobs:

- `daily-quiz-preparation`: prepare five questions for today; reuse existing questions if generation fails.
- `source-ingestion`: fetch or mark source status; failed sources must avoid verified factual claims.
- `weekly-summary`: calculate score changes, weak points, strong points, and next-week focus.
- `monthly-self-assessment`: create a monthly review prompt when due.
- `markdown-export-sync`: write Markdown artifacts; if export fails, leave database state intact and record a failed job run.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- tests/unit/jobs.test.ts tests/integration/jobs.test.ts
npm run job -- daily-quiz-preparation
npm run job -- markdown-export-sync
```

Expected: tests pass, job commands exit successfully, and failures are recorded without corrupting database state.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs tests/unit/jobs.test.ts tests/integration/jobs.test.ts
git commit -m "feat: add portable scheduled jobs"
```

### Task 13: Polish Public Documentation and Release Checks

**Files:**
- Modify: `README.md`
- Create: `docs/development.md`
- Create: `docs/public-boundary.md`
- Modify: `.env.example`
- Test: `tests/unit/public-boundary.test.ts`

**Interfaces:**
- Produces: public-safe setup docs and a lightweight guard against accidental private terms.
- Consumes: all previous project scripts and public repository constraints.

- [ ] **Step 1: Add public-boundary test**

Create `tests/unit/public-boundary.test.ts` that scans committed Markdown and source files for disallowed literal terms:

```ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blocked = [
  ["Company", "Vault"].join(""),
  ["SLACK", "BOT", "TOKEN"].join("_"),
  ["X", "API", "KEY"].join("_"),
  ["OPENAI", "API", "KEY"].join("_") + "=",
];

describe("public boundary", () => {
  it("does not include blocked private markers", () => {
    const files = execSync("git ls-files", { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((file) => /\.(md|ts|tsx|js|mjs|json|yml|yaml|env\.example)$/.test(file));

    const matches = files.flatMap((file) => {
      const contents = readFileSync(file, "utf8");
      return blocked.filter((term) => contents.includes(term)).map((term) => `${file}: ${term}`);
    });

    expect(matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Update docs**

Update `README.md` with:

- product summary
- MVP screen list
- local setup
- Docker Compose MySQL
- migrations and seed commands
- auth environment variables
- scheduled job commands
- Markdown export behavior
- public repository boundary

Create `docs/development.md` with day-to-day commands and test strategy.

Create `docs/public-boundary.md` explaining what must not be committed and how `.env.example` differs from `.env.local`.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
git status --short
```

Expected: all checks pass, and only intentional files are modified.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/development.md docs/public-boundary.md .env.example tests/unit/public-boundary.test.ts
git commit -m "docs: add public setup and safety guidance"
```

## Execution Order and Review Gates

Implement tasks in order. Each task has its own verification and commit so regressions are easy to locate. Review especially carefully at these gates:

1. After Task 3, confirm the data model supports category/tag/concept scoring and many-to-many concept relationships.
2. After Task 6, confirm LLM metadata cannot directly mutate final scores.
3. After Task 9, confirm failed evaluation still saves the raw answer.
4. After Task 11, confirm generated Markdown is portable and no export files are committed.
5. After Task 13, run the public-boundary test and inspect `git diff --cached` before pushing.

## Self-Review

- Spec coverage: the plan covers all required MVP screens, five skill axes, difficulty model, daily quiz mix, deterministic scoring, self-assessment gap calculation, sources and trust tiers, Markdown export, scheduled jobs, authentication, Docker Compose, MySQL, Drizzle, and public repository boundaries.
- Placeholder scan: no implementation task relies on private specs, hidden credentials, or unspecified internal services.
- Type consistency: shared interfaces are named once and reused by later tasks: `LlmProvider`, `NoteWriter`, `ScheduledJob`, `calculateScoreDelta`, `calculateGap`, `selectDailyQuiz`, and `evaluateAnswer`.
