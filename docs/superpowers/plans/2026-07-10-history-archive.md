# History Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first `/history` archive where answered Today quiz records can be browsed by year, month, and day, with day-level answer details.

**Architecture:** The database remains the source of truth. A focused `src/lib/history/get-history.ts` module queries `answers`, `quiz_days`, `questions`, and `concepts`, then builds year/month/day groups and day detail rows. The UI adds a protected `/history` route plus a Dashboard entry point and app navigation item.

**Tech Stack:** Next.js App Router, TypeScript, MySQL, Drizzle ORM, Vitest, Playwright.

## Global Constraints

- Public repository: do not commit credentials, private local details, raw internal specs, vault details, API keys, social media operations, or unpublished operational context.
- Mobile-first UI only; desktop should continue centering the mobile app surface.
- DB is canonical; Markdown export remains future work.
- Start with browseable archive and day detail. Full free-text search is a follow-up.

---

### Task 1: History Data Builder

**Files:**
- Create: `src/lib/history/get-history.ts`
- Test: `tests/unit/history.test.ts`

**Interfaces:**
- Produces: `buildHistoryArchive(input: HistoryBuildInput): HistoryArchiveData`
- Produces: `buildHistoryDay(input: HistoryBuildInput, day: string): HistoryDayData`

- [ ] **Step 1: Write failing unit tests**

Add `tests/unit/history.test.ts` that imports `buildHistoryArchive` and `buildHistoryDay`.

Expected assertions:
- Archive groups answers into `2026 -> 07 -> 10`.
- Day summary includes `answered`, `correct`, and `accuracy`.
- Day detail includes prompt, concept title, selected answer label, correct answer label, reasoning, and feedback.

- [ ] **Step 2: Run red test**

Run: `pnpm test -- tests/unit/history.test.ts`
Expected: FAIL because `@/lib/history/get-history` does not exist.

- [ ] **Step 3: Implement data builders**

Create `src/lib/history/get-history.ts` with:
- row types for quiz days, answers, questions, and concepts
- `buildHistoryArchive`
- `buildHistoryDay`
- date grouping helpers
- accuracy helper

- [ ] **Step 4: Run green test**

Run: `pnpm test -- tests/unit/history.test.ts`
Expected: PASS.

### Task 2: History Route UI

**Files:**
- Create: `src/app/(app)/history/page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/history.test.ts`

**Interfaces:**
- Consumes: `getHistoryArchive(day?: string)` from `src/lib/history/get-history.ts`

- [ ] **Step 1: Extend data module with DB query**

Add `getHistoryArchive(selectedDay?: string)` to query DB rows and return both archive and optional selected day detail.

- [ ] **Step 2: Add `/history` page**

Create a protected page that renders:
- header: `Archive`
- grouped year/month/day list
- day links as `?day=YYYY-MM-DD`
- selected day answer cards
- empty state when no answers exist

- [ ] **Step 3: Add CSS**

Add mobile-first archive styles to `src/app/globals.css` using existing surface/card visual language.

- [ ] **Step 4: Run focused checks**

Run:
- `pnpm typecheck`
- `pnpm test -- tests/unit/history.test.ts`

Expected: both PASS.

### Task 3: Dashboard and Navigation Entry Points

**Files:**
- Modify: `src/components/app-nav.tsx`
- Modify: `src/components/dashboard/dashboard-summary.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/history.spec.ts`

**Interfaces:**
- Consumes: `/history`

- [ ] **Step 1: Write failing E2E test**

Add `tests/e2e/history.spec.ts`:
- login as `local@example.com`
- answer one Today question if needed
- open Dashboard
- click Archive
- assert `/history`
- assert date group and answer detail are visible

- [ ] **Step 2: Run red E2E**

Run: `pnpm test:e2e -- tests/e2e/history.spec.ts`
Expected: FAIL because Archive navigation does not exist yet.

- [ ] **Step 3: Add entry points**

Add:
- app nav item `History`
- dashboard section/link `Archive`

- [ ] **Step 4: Run green E2E**

Run: `pnpm test:e2e -- tests/e2e/history.spec.ts`
Expected: PASS.

### Task 4: Final Verification and Commit

**Files:**
- Update: `docs/superpowers/progress/skill-compass-mvp.md`

- [ ] **Step 1: Update progress log**

Add one public-safe line noting that the Today answer archive is available at `/history`.

- [ ] **Step 2: Run verification**

Run:
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `DATABASE_URL='mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass' SESSION_SECRET='12345678901234567890123456789012' pnpm build`
- public-safe scan

- [ ] **Step 3: Commit**

Commit message: `feat: add quiz history archive`
