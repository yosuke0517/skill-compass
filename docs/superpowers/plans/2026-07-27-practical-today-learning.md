# Practical Today Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace definition-first Today quizzes with 70 reviewed practical cases and make every quiz assignment, answer, score, self-assessment, and history query user-scoped across Web, MCP, scheduled lessons, and Voice/Live.

**Architecture:** Keep reviewed lesson content shared in MySQL and move all learner state behind explicit `userId` repository boundaries. Store each practical case as structured question fields and typed JSON artifacts/choices, validate the complete bank before seeding, and expose two DTOs: a learner-safe question and a complete scheduled-lesson instructor pack. Web, MCP, Dashboard, Skills, Concepts, History, and the Today Assistant all call the same user-scoped services.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, React 19, MySQL, Drizzle ORM, Vitest, Testing Library, Playwright, MCP TypeScript SDK.

## Global Constraints

- Keep exactly five initial Today questions per user and local date.
- Store exactly 70 active reviewed questions: ten in each of seven categories.
- Every declared subtopic has at least one active question.
- Every question has exactly four unique choices and exactly one correct choice.
- Legacy definition-first questions remain queryable for history but are inactive for new assignment.
- Never accept an authoritative `userId` from a browser form, route body, or MCP tool input.
- Derive the user from the authenticated Web session or MCP bearer token.
- Learner-safe responses never expose correctness, rationale, decision criteria, explanations, consequences, or practical notes before submission.
- Scheduled lesson preparation may return the complete instructor pack but must never submit an answer.
- Supporting artifacts render as escaped source text and are never executed.
- TypeScript artifacts contain TypeScript rather than JavaScript mislabeled as TypeScript.
- All new production behavior follows test-first red-green-refactor cycles.

---

## File Structure

- `drizzle/0016_practical_user_scoped_today.sql` — backfill singleton learning state to `user_local`, add ownership and practical-question columns, and add user-scoped indexes.
- `src/db/schema.ts` — typed Drizzle definitions for question artifacts, explained choices, case type, and user-owned learning rows.
- `src/lib/quiz/content/types.ts` — canonical reviewed-question and artifact types.
- `src/lib/quiz/content/catalog.ts` — seven categories and required subtopics.
- `src/lib/quiz/content/questions/*.ts` — reviewed fixtures split by learning category.
- `src/lib/quiz/content/validate-question-bank.ts` — deterministic bank quality validation.
- `src/lib/quiz/content/question-bank.ts` — single exported 70-question bank.
- `src/db/seed.ts` — idempotent taxonomy/question upsert and legacy deactivation.
- `src/lib/quiz/types.ts` — richer selection metadata and explicit user-scoped inputs.
- `src/lib/quiz/select-daily-quiz.ts` — deterministic user-specific balanced selection.
- `src/lib/quiz/get-today-quiz.ts` — user-scoped quiz creation and read model.
- `src/lib/quiz/extend-daily-quiz.ts` — ownership-checked additional practice.
- `src/lib/quiz/submit-answer.ts` — user-scoped answer and score repository.
- `src/lib/quiz/today-service.ts` — learner-safe and instructor-pack DTOs.
- `src/lib/history/get-history.ts` — user-scoped archive.
- `src/lib/dashboard/get-dashboard.ts` — user-scoped dashboard.
- `src/lib/concepts/get-concepts.ts` — user-scoped concept scores and reviews.
- `src/lib/skills/get-skills.ts` — user-scoped scores and self-assessments.
- `src/components/quiz/question-artifacts.tsx` — safe structured artifact renderer.
- `src/components/quiz/quiz-question-card.tsx` — scenario-first question and post-answer teaching sequence.
- `src/lib/translation/translate-quiz-card.ts` — translation DTO for scenario and teaching prose while preserving code.
- `src/lib/assistant/today-assistant.ts` — practical-case hint context without hidden-answer leakage.
- `src/lib/mcp/server.ts` — updated Today tool descriptions only; the DTO comes from the Today service.
- `src/lib/mcp/architecture/manifest.ts` — reviewed public-safe multi-user learning architecture facts.
- `docs/showcase/skill-compass-architecture.html` — renamed whole-product architecture story.
- `README.md`, `docs/README.md`, `docs/runbooks/chatgpt-mcp.md` — updated links and operational instructions.

---

### Task 1: Practical Question Schema and User-Owned Learning Migration

**Files:**
- Create: `drizzle/0016_practical_user_scoped_today.sql`
- Modify: `src/db/schema.ts`
- Modify: `tests/unit/schema-shape.test.ts`
- Create: `tests/unit/practical-today-migration.test.ts`

**Interfaces:**
- Produces: `QuestionArtifact`, `QuestionChoice`, and `QuestionCaseType` schema types.
- Produces: required `userId` on `quizDays`, `answers`, `scores`, and `selfAssessments`.
- Produces: unique `(userId, quizDate)` quiz-day ownership and unique `(userId, subjectType, subjectId)` score ownership.
- Preserves: legacy question and answer IDs.

- [ ] **Step 1: Write failing schema-shape tests**

Add assertions equivalent to:

```ts
expect(Object.keys(questions)).toEqual(
  expect.arrayContaining([
    "scenario",
    "artifacts",
    "caseType",
    "decisionCriteria",
    "practicalNotes",
    "checkQuestion",
  ]),
);
expect(Object.keys(quizDays)).toContain("userId");
expect(Object.keys(answers)).toContain("userId");
expect(Object.keys(scores)).toContain("userId");
expect(Object.keys(selfAssessments)).toContain("userId");
```

Assert that the TypeScript `QuestionChoice` shape accepts
`{ id, label, correct, explanation, consequence }` and that artifact kinds are
limited to `code | sql | schema | api | config | diagram`.

- [ ] **Step 2: Run the schema tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/schema-shape.test.ts
```

Expected: failure because the practical fields and user ownership columns do
not exist.

- [ ] **Step 3: Update Drizzle schema types**

Add:

```ts
export const questionCaseTypeValues = [
  "basic_application",
  "common_failure",
  "design_tradeoff",
  "debugging_performance",
  "maintainability_safety",
] as const;

export type QuestionArtifact = {
  kind: "code" | "sql" | "schema" | "api" | "config" | "diagram";
  title: string;
  language?: string;
  content: string;
};

export type QuestionChoice = {
  id: "a" | "b" | "c" | "d";
  label: string;
  correct: boolean;
  explanation: string;
  consequence: string;
};
```

Add non-null question fields with safe empty JSON defaults only for migration;
the seed replaces them for active questions. Add `userId` foreign keys and
user-scoped indexes to learner-state tables. Include `userId` in answer lookup
indexes even though quiz-day ownership also exists.

- [ ] **Step 4: Write migration contract tests**

Read `drizzle/0016_practical_user_scoped_today.sql` as text and assert it:

```ts
expect(sql).toContain("UPDATE `quiz_days` SET `user_id` = 'user_local'");
expect(sql).toContain("UPDATE `answers` SET `user_id` = 'user_local'");
expect(sql).toContain("UPDATE `scores` SET `user_id` = 'user_local'");
expect(sql).toContain("UPDATE `self_assessments` SET `user_id` = 'user_local'");
expect(sql).toContain("UNIQUE INDEX `quiz_days_user_date_idx`");
expect(sql).not.toMatch(/DELETE FROM `questions`/i);
expect(sql).not.toMatch(/DELETE FROM `answers`/i);
```

Also assert the migration adds nullable ownership, backfills, then makes
ownership non-null. A fresh database succeeds because the learner-state tables
are empty at migration time; an existing seeded database succeeds because its
legacy owner is `user_local`.

- [ ] **Step 5: Run migration tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/practical-today-migration.test.ts
```

Expected: failure because migration `0016` does not exist.

- [ ] **Step 6: Create the SQL migration**

Implement this order:

1. add practical question columns;
2. add nullable `user_id` columns;
3. backfill all singleton rows to `user_local`;
4. drop singleton unique indexes that conflict with per-user rows;
5. make ownership columns non-null;
6. add foreign keys and user-scoped indexes.

Do not rewrite quiz-day IDs or answer IDs in place. Existing singleton rows
remain historical. New code creates user-specific quiz IDs.

- [ ] **Step 7: Verify Task 1**

Run:

```bash
pnpm vitest run tests/unit/schema-shape.test.ts tests/unit/practical-today-migration.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add drizzle/0016_practical_user_scoped_today.sql src/db/schema.ts tests/unit/schema-shape.test.ts tests/unit/practical-today-migration.test.ts
git commit -m "feat: add practical user-scoped Today schema"
```

---

### Task 2: Reviewed Question Catalog and Quality Validator

**Files:**
- Create: `src/lib/quiz/content/types.ts`
- Create: `src/lib/quiz/content/catalog.ts`
- Create: `src/lib/quiz/content/validate-question-bank.ts`
- Create: `tests/unit/question-bank-validator.test.ts`

**Interfaces:**
- Produces: `ReviewedQuestion`, `LearningCategory`, and `LearningSubtopic`.
- Produces: `validateQuestionBank(questions: ReviewedQuestion[]): void`.
- Produces: `learningCatalog`, the exact seven-category taxonomy.

- [ ] **Step 1: Write failing validator tests**

Cover one behavior per test:

```ts
expect(() => validateQuestionBank(validBank)).not.toThrow();
expect(() => validateQuestionBank(validBank.slice(1))).toThrow("question_bank_count");
expect(() => validateQuestionBank(withTwoCorrectChoices)).toThrow("question_choice_correctness");
expect(() => validateQuestionBank(withMissingSubtopic)).toThrow("question_subtopic_coverage");
expect(() => validateQuestionBank(withGenericRationale)).toThrow("question_rationale_not_grounded");
expect(() => validateQuestionBank(withMislabeledTypeScript)).toThrow("question_typescript_artifact");
```

The validator test fixture contains 70 minimal valid rows generated in test
code from the seven-category catalog. Individual failure tests mutate one row.

- [ ] **Step 2: Run validator tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/question-bank-validator.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Define the catalog and canonical types**

The catalog IDs are:

```ts
{
  cs_foundations: ["data_structures", "algorithms", "operating_systems", "networking", "databases"],
  web_backend: ["http", "apis", "authentication", "caching", "async_processing"],
  frontend: ["typescript", "browsers", "state_management", "accessibility"],
  infrastructure: ["cloud", "containers", "ci_cd", "observability"],
  security: ["authorization", "vulnerabilities", "secret_handling", "supply_chain"],
  software_design: ["distributed_systems", "maintainability", "tradeoffs"],
  ai_engineering: ["llms", "rag", "agents", "mcp", "evaluation", "safety"],
}
```

`ReviewedQuestion` includes all fields from the approved design and a
`categoryId`, `subtopicId`, `conceptId`, `sourceId`, and stable question ID.

- [ ] **Step 4: Implement deterministic validation**

Validate:

- exactly 70 total rows;
- exactly ten rows per category;
- every catalog subtopic covered;
- stable unique IDs and normalized unique prompt/scenario pairs;
- non-empty scenario, prompt, decision criteria, rationale, notes, and check;
- four IDs in exact `a,b,c,d` order with one correct;
- all explanations and consequences non-empty;
- supported case type and difficulty;
- each category covers all five case types;
- no answer ID exceeds 40% of the whole bank;
- rationale is rejected when it matches banned generic wording;
- TypeScript artifact language and syntax are checked with the TypeScript
  compiler's `createSourceFile`.

Artifacts are always treated as source text. Security lessons may legitimately
contain strings such as `<script>` or event-handler examples; safety is
enforced by the renderer never interpreting artifact content as HTML.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
pnpm vitest run tests/unit/question-bank-validator.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/quiz/content/types.ts src/lib/quiz/content/catalog.ts src/lib/quiz/content/validate-question-bank.ts tests/unit/question-bank-validator.test.ts
git commit -m "feat: validate reviewed practical question banks"
```

---

### Task 3: Author the 70-Question Practical Bank and Idempotent Seed

**Files:**
- Create: `src/lib/quiz/content/questions/cs-foundations.ts`
- Create: `src/lib/quiz/content/questions/web-backend.ts`
- Create: `src/lib/quiz/content/questions/frontend.ts`
- Create: `src/lib/quiz/content/questions/infrastructure.ts`
- Create: `src/lib/quiz/content/questions/security.ts`
- Create: `src/lib/quiz/content/questions/software-design.ts`
- Create: `src/lib/quiz/content/questions/ai-engineering.ts`
- Create: `src/lib/quiz/content/question-bank.ts`
- Modify: `src/db/seed.ts`
- Create: `tests/unit/practical-question-bank.test.ts`

**Interfaces:**
- Produces: `reviewedQuestionBank: ReviewedQuestion[]`.
- Consumes: `validateQuestionBank`.
- Seed upserts all canonical question fields and choices, then deactivates
  legacy questions not present in the reviewed bank.

- [ ] **Step 1: Write failing complete-bank tests**

```ts
expect(reviewedQuestionBank).toHaveLength(70);
expect(() => validateQuestionBank(reviewedQuestionBank)).not.toThrow();
expect(groupCount(reviewedQuestionBank, "categoryId")).toEqual({
  cs_foundations: 10,
  web_backend: 10,
  frontend: 10,
  infrastructure: 10,
  security: 10,
  software_design: 10,
  ai_engineering: 10,
});
```

Add focused assertions that:

- the index-design case contains the `orders` query and a composite index
  decision;
- the `satisfies` case contains valid TypeScript;
- an API-contract case distinguishes compatible and breaking changes;
- a design-token case includes multiple clients and theme/brand constraints;
- a reverse-proxy case includes TLS/routing and a forward-proxy distractor;
- security cases include authorization and supply-chain scenarios; and
- AI cases distinguish retrieval, evaluation, agent permissions, and MCP
  capability boundaries.

- [ ] **Step 2: Run complete-bank tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/practical-question-bank.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Author the bank from this reviewed coverage map**

Use these stable IDs and scenario themes. Each category cycles through the five
case types twice and distributes correct IDs `a,b,c,d` without a visible
pattern.

| ID prefix and number | Subtopic | Scenario theme |
|---|---|---|
| `q_cs_01` | data structures | choose queue vs stack for job processing |
| `q_cs_02` | data structures | memory/lookup trade-off for membership checks |
| `q_cs_03` | algorithms | select complexity for growing input |
| `q_cs_04` | algorithms | diagnose accidental quadratic behavior |
| `q_cs_05` | operating systems | blocking I/O vs CPU-bound concurrency |
| `q_cs_06` | operating systems | process isolation and shared-state failure |
| `q_cs_07` | networking | timeout/retry behavior under packet loss |
| `q_cs_08` | networking | DNS/TLS/HTTP failure-layer diagnosis |
| `q_cs_09` | databases | `orders` composite-index column order |
| `q_cs_10` | databases | write-heavy index/storage trade-off |
| `q_web_01` | HTTP | safe/idempotent retry after timeout |
| `q_web_02` | HTTP | caching with `ETag` and stale data constraints |
| `q_web_03` | APIs | parallel development from an explicit contract |
| `q_web_04` | APIs | backward-compatible response evolution |
| `q_web_05` | authentication | session vs token choice for first-party Web |
| `q_web_06` | authentication | OAuth callback/state/PKCE failure prevention |
| `q_web_07` | caching | cache invalidation after write |
| `q_web_08` | caching | prevent cache stampede |
| `q_web_09` | async processing | move slow side effect behind a durable queue |
| `q_web_10` | async processing | idempotent consumer after redelivery |
| `q_front_01` | TypeScript | `satisfies` preserves inference |
| `q_front_02` | TypeScript | reject unsafe `as` assertion |
| `q_front_03` | browsers | main-thread performance diagnosis |
| `q_front_04` | browsers | cookie/storage boundary for sensitive state |
| `q_front_05` | state management | local vs server vs global state ownership |
| `q_front_06` | state management | stale async response/race prevention |
| `q_front_07` | accessibility | keyboard and semantic control choice |
| `q_front_08` | accessibility | accessible form error association |
| `q_front_09` | TypeScript | discriminated-union exhaustive handling |
| `q_front_10` | browsers | design tokens across Web/mobile/dark mode |
| `q_infra_01` | cloud | managed service vs self-hosting trade-off |
| `q_infra_02` | cloud | region/redundancy decision from RTO/RPO |
| `q_infra_03` | containers | image layering and reproducible build |
| `q_infra_04` | containers | resource limits and OOM diagnosis |
| `q_infra_05` | CI/CD | prevent untested artifact promotion |
| `q_infra_06` | CI/CD | safe database migration rollout |
| `q_infra_07` | observability | metrics/logs/traces signal selection |
| `q_infra_08` | observability | high-cardinality telemetry failure |
| `q_infra_09` | cloud | reverse proxy TLS/routing/load balancing |
| `q_infra_10` | observability | SLO-based alert instead of noisy threshold |
| `q_sec_01` | authorization | object-level authorization/IDOR prevention |
| `q_sec_02` | authorization | role check vs resource ownership |
| `q_sec_03` | vulnerabilities | parameterized SQL query |
| `q_sec_04` | vulnerabilities | output encoding and XSS boundary |
| `q_sec_05` | secret handling | move credentials out of repository/config |
| `q_sec_06` | secret handling | rotation without outage |
| `q_sec_07` | supply chain | lockfile/provenance/version pinning |
| `q_sec_08` | supply chain | compromised package response |
| `q_sec_09` | vulnerabilities | CSRF defense for cookie session |
| `q_sec_10` | authorization | least-privilege service credentials |
| `q_design_01` | distributed systems | consistency choice for inventory |
| `q_design_02` | distributed systems | duplicate event and idempotency |
| `q_design_03` | distributed systems | timeout/circuit breaker behavior |
| `q_design_04` | maintainability | dependency boundary for provider swap |
| `q_design_05` | maintainability | schema/API ownership to reduce coupling |
| `q_design_06` | maintainability | refactor vs abstraction from one use case |
| `q_design_07` | tradeoffs | normalization vs read model |
| `q_design_08` | tradeoffs | synchronous simplicity vs queue durability |
| `q_design_09` | distributed systems | outbox for DB/event atomicity |
| `q_design_10` | tradeoffs | monolith/module split from team constraints |
| `q_ai_01` | LLMs | prompt context vs model fine-tuning |
| `q_ai_02` | LLMs | structured output validation |
| `q_ai_03` | RAG | retrieval failure vs generation failure |
| `q_ai_04` | RAG | chunking/metadata/filter decision |
| `q_ai_05` | agents | bounded tools and approval for side effects |
| `q_ai_06` | agents | stop condition and retry budget |
| `q_ai_07` | MCP | explicit tool schema and least capability |
| `q_ai_08` | MCP | untrusted tool output/prompt injection |
| `q_ai_09` | evaluation | task-specific eval set and regression gate |
| `q_ai_10` | safety | PII/secrets boundary before model call |

Every scenario states enough workload, consistency, compatibility, security, or
operational constraints to leave one answer. Keep prose short; put exact code,
SQL, API, or configuration details in artifacts.

- [ ] **Step 4: Run content tests until GREEN**

Run after each category file:

```bash
pnpm vitest run tests/unit/practical-question-bank.test.ts
```

Expected progression: category-count or coverage failures until all seven files
exist, then PASS.

- [ ] **Step 5: Make seed behavior idempotent**

Replace generated `Which statement best describes...` rows with
`reviewedQuestionBank`. Seed behavior must:

```ts
validateQuestionBank(reviewedQuestionBank);
await db.update(questions).set({ active: false });
for (const question of reviewedQuestionBank) {
  await db.insert(questions).values(toQuestionRow(question))
    .onDuplicateKeyUpdate({ set: toQuestionUpdate(question) });
}
```

Upsert every canonical field including choices. Do not modify answers or
scores. Upsert categories, tags, concepts, and links needed by the catalog.

- [ ] **Step 6: Add seed-shape tests**

Test pure helpers extracted from `seed.ts`:

- reviewed IDs become active;
- legacy IDs are absent from the active ID set;
- all choice explanations survive row conversion; and
- two conversions produce equal rows.

- [ ] **Step 7: Verify Task 3**

Run:

```bash
pnpm vitest run tests/unit/practical-question-bank.test.ts tests/unit/question-bank-validator.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/lib/quiz/content src/db/seed.ts tests/unit/practical-question-bank.test.ts
git commit -m "feat: add reviewed practical Today question bank"
```

---

### Task 4: User-Specific Balanced Daily Selection

**Files:**
- Modify: `src/lib/quiz/types.ts`
- Modify: `src/lib/quiz/select-daily-quiz.ts`
- Modify: `src/lib/quiz/extend-daily-quiz.ts`
- Modify: `tests/unit/select-daily-quiz.test.ts`
- Modify: `tests/unit/extend-daily-quiz.test.ts`

**Interfaces:**
- `QuizSelectionQuestion` adds `caseType`, `correctChoiceId`, and category data.
- `QuizSelectionInput` adds a deterministic `userId` and
  `recentlyAssignedQuestionIds`.
- `appendAdditionalQuizQuestions(userId, quizDayId)` verifies ownership.

- [ ] **Step 1: Write failing selector behavior tests**

Add separate tests proving:

```ts
expect(selectDailyQuiz(input)).toHaveLength(5);
expect(new Set(result.map((x) => x.question.caseType)).size).toBeGreaterThanOrEqual(4);
expect(maxCategoryCount(result)).toBeLessThanOrEqual(2);
expect(result.map((x) => x.question.id)).not.toContain(recentId);
expect(selectDailyQuiz(input)).toEqual(selectDailyQuiz(input));
expect(selectDailyQuiz({...input, userId: "user_b"})).not.toEqual(result);
expect(maxCorrectIdCount(result)).toBeLessThanOrEqual(2);
```

Use a sufficiently varied fixture so every constraint is satisfiable. Add a
degraded-bank test proving the selector returns fewer than five rather than
using inactive legacy content.

- [ ] **Step 2: Run selector tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/select-daily-quiz.test.ts
```

Expected: failures for missing metadata and balance behavior.

- [ ] **Step 3: Implement deterministic ranking**

Build a stable seed from `userId + today`. Rank candidates by:

1. due/weak concept need;
2. not recently assigned;
3. category count in current result;
4. case-type count in current result;
5. correct-choice-ID count in current result;
6. source trust and difficulty fit; and
7. deterministic hash then stable ID.

Keep the existing selection-reason vocabulary for history compatibility.

- [ ] **Step 4: Add ownership tests for additional practice**

Test that `appendAdditionalQuizQuestions("user_b", userAQuizId)` throws
`quiz_not_found`, and that inactive legacy rows are never appended.

- [ ] **Step 5: Implement additional-practice ownership**

Load the quiz day by `(id, userId)` before reading assignments. Pass the user's
recently assigned rows into selection and keep the 30-question daily cap.

- [ ] **Step 6: Verify Task 4**

Run:

```bash
pnpm vitest run tests/unit/select-daily-quiz.test.ts tests/unit/extend-daily-quiz.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/lib/quiz/types.ts src/lib/quiz/select-daily-quiz.ts src/lib/quiz/extend-daily-quiz.ts tests/unit/select-daily-quiz.test.ts tests/unit/extend-daily-quiz.test.ts
git commit -m "feat: personalize balanced Today selection"
```

---

### Task 5: User-Scoped Today, Answer, Score, Dashboard, Skills, Concepts, and History Services

**Files:**
- Modify: `src/lib/quiz/get-today-quiz.ts`
- Modify: `src/lib/quiz/submit-answer.ts`
- Modify: `src/lib/quiz/today-service.ts`
- Modify: `src/lib/history/get-history.ts`
- Modify: `src/lib/dashboard/get-dashboard.ts`
- Modify: `src/lib/concepts/get-concepts.ts`
- Modify: `src/lib/skills/get-skills.ts`
- Modify: `src/app/actions/quiz.ts`
- Modify: `src/app/actions/self-assessments.ts`
- Modify: `src/app/(app)/today/page.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/history/page.tsx`
- Modify: `src/app/(app)/concepts/page.tsx`
- Modify: `src/app/(app)/skills/page.tsx`
- Modify: `src/app/api/assistant/today/route.ts`
- Modify: `tests/unit/get-today-quiz.test.ts`
- Modify: `tests/unit/today-service.test.ts`
- Modify: `tests/integration/submit-answer.test.ts`
- Modify: `tests/unit/history.test.ts`
- Modify: `tests/unit/dashboard.test.ts`
- Modify: `tests/unit/quiz-action.test.ts`
- Modify: `tests/unit/today-assistant-route.test.ts`
- Create: `tests/unit/concepts.test.ts`
- Create: `tests/unit/skills.test.ts`
- Create: `tests/unit/self-assessment-action.test.ts`

**Interfaces:**
- `getTodayQuiz(userId: string, today?: string): Promise<TodayQuiz>`.
- `submitTodayAnswer(input: SubmitAnswerInput & { userId: string })`.
- `getHistoryArchive(userId: string, selectedDay?: string, searchQuery?: string)`.
- `getDashboardData(userId: string, today?: string)`.
- `getConceptsData(userId: string)`.
- `getSkillsData(userId: string)`.
- Browser callers obtain `user.id` through `requireCurrentUser()`.

- [ ] **Step 1: Write failing two-user service tests**

Extend Today and submission tests with two users:

```ts
const quizA = await getTodayForUser({ userId: "user_a", today }, deps);
const quizB = await getTodayForUser({ userId: "user_b", today }, deps);
expect(quizA.quizDayId).not.toBe(quizB.quizDayId);

await expect(
  submitTodayForUser({ userId: "user_b", quizDayId: quizA.quizDayId, ...answer }, deps),
).rejects.toThrow("today_quiz_not_found");
```

Add repository-level assertions that every answer and score query includes the
user. Add Dashboard, History, Concepts, and Skills builder fixtures containing
rows for two users and assert only the requested user's values are provided to
the builders. Add a self-assessment action test proving the action writes the
authenticated user's ID and ignores any forged `userId` form field.

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/get-today-quiz.test.ts tests/unit/today-service.test.ts tests/integration/submit-answer.test.ts tests/unit/history.test.ts tests/unit/dashboard.test.ts
```

Expected: signature and isolation failures.

- [ ] **Step 3: Make Today creation user-specific**

Create IDs with a bounded hash:

```ts
export function createQuizDayId(userId: string, today: string) {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  return `quiz_${owner}_${today.replaceAll("-", "")}`;
}
```

Query quiz days, assignments, recent answers, and scores by the authenticated
user. Do not load all users and filter only in memory.

- [ ] **Step 4: Scope submission and score updates**

Repository signatures require `userId`. Fetch a question assignment through a
quiz day owned by that user before saving. Answer IDs include an owner hash.
Score lookup and upsert use `(userId, subjectType, subjectId)`.

- [ ] **Step 5: Scope all read models**

Filter History, Dashboard, Concepts, Skills, and self-assessment reads in SQL.
Pure builders may remain user-agnostic after repositories pass only owned rows.

- [ ] **Step 6: Pass authenticated users from every Web entry point**

At page, quiz action, self-assessment action, and assistant-route boundaries:

```ts
const user = await requireCurrentUser();
const quiz = await getTodayQuiz(user.id);
```

Never read a user ID from `FormData`, JSON input, query parameters, or hidden
fields.

- [ ] **Step 7: Verify Task 5**

Run:

```bash
pnpm vitest run tests/unit/get-today-quiz.test.ts tests/unit/today-service.test.ts tests/integration/submit-answer.test.ts tests/unit/history.test.ts tests/unit/dashboard.test.ts tests/unit/concepts.test.ts tests/unit/skills.test.ts tests/unit/quiz-action.test.ts tests/unit/self-assessment-action.test.ts tests/unit/today-assistant-route.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/lib/quiz src/lib/history/get-history.ts src/lib/dashboard/get-dashboard.ts src/lib/concepts/get-concepts.ts src/lib/skills/get-skills.ts src/app/actions/quiz.ts src/app/actions/self-assessments.ts src/app/'(app)' src/app/api/assistant/today/route.ts tests
git commit -m "feat: isolate Today learning state by user"
```

---

### Task 6: Scenario-First Web Card, Safe Artifacts, and Rich Answer Review

**Files:**
- Create: `src/components/quiz/question-artifacts.tsx`
- Modify: `src/components/quiz/quiz-question-card.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/translation/types.ts`
- Modify: `src/lib/translation/translate-quiz-card.ts`
- Modify: `src/lib/translation/translate-today-question.ts`
- Modify: `tests/unit/translate-quiz-card.test.ts`
- Create: `tests/unit/question-artifacts.test.tsx`
- Create: `tests/unit/quiz-question-card.test.tsx`
- Modify: `tests/e2e/quiz-flow.spec.ts`

**Interfaces:**
- `QuestionArtifacts({ artifacts })` renders escaped preformatted content.
- `TranslatedQuizCard` adds translated scenario, decision criteria, choice
  explanations, consequences, notes, and check question; artifact code remains
  canonical.

- [ ] **Step 1: Write failing artifact renderer tests**

Render code, SQL, and diagram fixtures. Assert titles and source text are
visible and `<script>alert(1)</script>` appears as text rather than an element.
Assert the renderer uses `<pre><code>` and a horizontal-scroll container.

- [ ] **Step 2: Write failing card disclosure tests**

Before answer:

```ts
expect(screen.getByText(question.scenario)).toBeVisible();
expect(screen.queryByText(question.rationale)).not.toBeInTheDocument();
expect(screen.queryByText(question.decisionCriteria[0])).not.toBeInTheDocument();
expect(screen.queryByText(question.choices[1].explanation)).not.toBeInTheDocument();
```

After answer, assert the ordered headings:

`Result`, `Decision point`, `Why`, `Options`, `Practical notes`,
`Check your understanding`.

- [ ] **Step 3: Run component tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/question-artifacts.test.tsx tests/unit/quiz-question-card.test.tsx
```

Expected: missing renderer and missing practical sections.

- [ ] **Step 4: Implement safe artifact and card rendering**

Render artifact content only through React text children. Never use
`dangerouslySetInnerHTML`. Preserve the current choice/confidence/reasoning
form and one-card navigator.

Add responsive CSS:

```css
.question-artifact {
  max-width: 100%;
  overflow-x: auto;
}
.question-artifact pre {
  min-width: max-content;
  white-space: pre;
}
```

Use existing design tokens and mobile breakpoints.

- [ ] **Step 5: Extend translation tests and implementation**

Translate prose fields separately using the existing cache purposes extended
with precise new purposes. Keep choice IDs, artifact language, artifact source,
correctness, and scores unchanged. Translate artifact titles, but not code,
SQL, schemas, API examples, configs, or diagrams.

- [ ] **Step 6: Update E2E flow**

Assert a seeded practical scenario and artifact appear, submit choice,
confidence, and reasoning, then assert the practical review sections appear.

- [ ] **Step 7: Verify Task 6**

Run:

```bash
pnpm vitest run tests/unit/question-artifacts.test.tsx tests/unit/quiz-question-card.test.tsx tests/unit/translate-quiz-card.test.ts
pnpm playwright test tests/e2e/quiz-flow.spec.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/components/quiz src/app/globals.css src/lib/translation tests/unit/question-artifacts.test.tsx tests/unit/quiz-question-card.test.tsx tests/unit/translate-quiz-card.test.ts tests/e2e/quiz-flow.spec.ts
git commit -m "feat: teach practical judgment in Today cards"
```

---

### Task 7: Learner-Safe MCP DTO and Complete Voice Instructor Pack

**Files:**
- Modify: `src/lib/quiz/today-service.ts`
- Modify: `src/lib/assistant/today-assistant.ts`
- Modify: `src/lib/mcp/server.ts`
- Modify: `tests/unit/today-service.test.ts`
- Modify: `tests/unit/today-assistant.test.ts`
- Modify: `tests/unit/mcp-tools.test.ts`
- Modify: `tests/integration/mcp-route.test.ts`
- Modify: `docs/runbooks/chatgpt-mcp.md`

**Interfaces:**
- Learner-safe `nextQuestion` includes scenario, artifacts, prompt, and labels.
- `instructorPack` includes all reviewed teaching fields.
- Existing `submit_today_answer` input schema remains choice, confidence,
  reasoning, quiz ID, and question ID only.

- [ ] **Step 1: Write failing non-disclosure tests**

Serialize `nextQuestion` and assert:

```ts
expect(json).not.toContain("correctChoiceId");
expect(json).not.toContain(question.rationale);
expect(json).not.toContain(question.decisionCriteria[0]);
expect(json).not.toContain(question.choices[0].explanation);
```

Assert scenario, artifacts, prompt, IDs, and labels are present.

- [ ] **Step 2: Write failing instructor-pack completeness tests**

For all five rows, assert:

```ts
expect(row).toMatchObject({
  scenario: expect.any(String),
  artifacts: expect.any(Array),
  correctChoiceId: expect.stringMatching(/^[a-d]$/),
  decisionCriteria: expect.any(Array),
  rationale: expect.any(String),
  practicalNotes: expect.any(Array),
  checkQuestion: expect.any(String),
});
expect(row.choices.every((c) => c.explanation && c.consequence)).toBe(true);
```

- [ ] **Step 3: Run MCP tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/today-service.test.ts tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts
```

Expected: missing practical fields.

- [ ] **Step 4: Implement DTO mapping**

Use explicit projection functions:

```ts
toLearnerQuestion(question)
toInstructorQuestion(question, existingAnswer)
```

Do not spread database question objects into MCP output.

- [ ] **Step 5: Improve Today Assistant hint context**

Before answer, the assistant may use scenario, artifacts, prompt, labels, and
decision-oriented guidance but not the stored answer. Its system instruction
must tell it to point to stated constraints, never add a premise, and never
reveal hidden fields.

- [ ] **Step 6: Update scheduled lesson and Voice/Live runbook**

The scheduled prompt must:

- call `get_today` exactly once;
- publish five learner questions and compact instructor data;
- never call `submit_today_answer`;
- collect choice, confidence, and reasoning per question;
- hint before reveal;
- teach correctness, decision point, practical use, wrong-choice consequence,
  and understanding check;
- ask why alternatives are wrong when reasoning is weak; and
- emit complete SYNC PACK items for later normal-chat submission.

- [ ] **Step 7: Verify Task 7**

Run:

```bash
pnpm vitest run tests/unit/today-service.test.ts tests/unit/today-assistant.test.ts tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/lib/quiz/today-service.ts src/lib/assistant/today-assistant.ts src/lib/mcp/server.ts tests/unit/today-service.test.ts tests/unit/today-assistant.test.ts tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts docs/runbooks/chatgpt-mcp.md
git commit -m "feat: enrich Today MCP teaching packets"
```

---

### Task 8: Whole-Product Architecture Documentation and Architecture MCP Facts

**Files:**
- Create: `docs/showcase/skill-compass-architecture.html`
- Delete: `docs/showcase/podcast-studio.html`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `src/lib/mcp/architecture/manifest.ts`
- Modify: `src/lib/mcp/architecture/answers.ts`
- Modify: `tests/unit/mcp-architecture-manifest.test.ts`
- Modify: `tests/unit/mcp-architecture-answers.test.ts`

**Interfaces:**
- README links point to the whole-product showcase.
- Architecture MCP states shared reviewed content and user-owned learning state
  without exposing live content or account data.

- [ ] **Step 1: Write failing architecture fact tests**

Assert the reviewed manifest:

```ts
expect(serialized).toContain("shared reviewed lesson content");
expect(serialized).toContain("user-scoped learning state");
expect(serialized).not.toContain("singleton Today storage");
expect(serialized).not.toContain("user_local");
```

Assert interview answers distinguish current implementation from the planned
diagnostic exam and cloud deployment.

- [ ] **Step 2: Run Architecture MCP tests and verify RED**

Run:

```bash
pnpm vitest run tests/unit/mcp-architecture-manifest.test.ts tests/unit/mcp-architecture-answers.test.ts
```

Expected: old singleton wording or missing new facts.

- [ ] **Step 3: Update public-safe architecture facts**

Explain:

- reviewed common lesson bank;
- authenticated user-specific assignment and progress;
- shared services behind Web and learning MCP;
- scheduled context bridge for Voice/Live;
- capability-limited MCP output;
- database isolation tests; and
- residual risks from future schema/tool changes.

Do not add live question text, personal answers, hostnames, paths, user IDs, or
secrets.

- [ ] **Step 4: Replace the showcase**

Preserve the approved problem story:

1. LLM adoption reduced motivation for traditional catch-up;
2. engineers still need specialist judgment to direct and review LLM work;
3. Skill Compass began as a Web app;
4. ChatGPT Voice/Live shifted its main role toward canonical learning data and
   capability-limited MCP delivery;
5. practical cases train decisions rather than definitions;
6. the product includes Today, Podcast, X news, and Architecture MCP;
7. security separates common content, user state, and tool capabilities; and
8. diagnostic exam and cloud migration are clearly labeled future work.

Reuse the existing visual language, responsive behavior, and public-safe
content. Rename headings and navigation so no card implies Podcast is the whole
product.

- [ ] **Step 5: Update README links**

Replace every `podcast-studio.html` architecture-showcase link with
`skill-compass-architecture.html` and describe it as the whole Skill Compass
architecture.

- [ ] **Step 6: Verify Task 8**

Run:

```bash
pnpm vitest run tests/unit/mcp-architecture-manifest.test.ts tests/unit/mcp-architecture-answers.test.ts
rg -n "podcast-studio\\.html|singleton Today storage" README.md docs src/lib/mcp/architecture
```

Expected: tests pass and `rg` returns no stale references.

Open the HTML locally at desktop and mobile widths and verify no horizontal
overflow, clipped labels, or false current/future claims.

- [ ] **Step 7: Commit Task 8**

```bash
git add README.md docs/README.md docs/showcase src/lib/mcp/architecture tests/unit/mcp-architecture-manifest.test.ts tests/unit/mcp-architecture-answers.test.ts
git commit -m "docs: explain practical multi-user Skill Compass"
```

---

### Task 9: Full Migration, Regression, and Production Smoke Verification

**Files:**
- Modify only if verification reveals an in-scope defect.
- Update: `docs/superpowers/progress/skill-compass-mvp.md`

**Interfaces:**
- Confirms one deployable release with preserved history and new practical
  Today behavior.

- [ ] **Step 1: Run focused unit and integration suites**

```bash
pnpm vitest run tests/unit/practical-today-migration.test.ts tests/unit/question-bank-validator.test.ts tests/unit/practical-question-bank.test.ts tests/unit/select-daily-quiz.test.ts tests/unit/extend-daily-quiz.test.ts tests/unit/get-today-quiz.test.ts tests/unit/today-service.test.ts tests/integration/submit-answer.test.ts tests/unit/history.test.ts tests/unit/dashboard.test.ts tests/unit/question-artifacts.test.tsx tests/unit/quiz-question-card.test.tsx tests/unit/translate-quiz-card.test.ts tests/unit/today-assistant.test.ts tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts tests/unit/mcp-architecture-manifest.test.ts tests/unit/mcp-architecture-answers.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run the complete static and automated suite**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass with no warnings introduced by this feature.

- [ ] **Step 3: Back up and migrate the local production database**

Create a timestamped MySQL backup outside the repository using the existing
private `DATABASE_URL`. Do not print credentials or backup contents. Apply:

```bash
pnpm db:migrate
pnpm db:seed
```

Verify counts without printing personal rows:

- 70 active reviewed questions;
- zero active legacy definition questions;
- existing answer count unchanged;
- no null learner-state `user_id`;
- exactly one user-scoped score row per owned subject; and
- one user-scoped current quiz day for `user_local`.

- [ ] **Step 4: Run Web smoke verification**

Log in as the existing Pro user:

1. open Today;
2. confirm scenario and artifact rendering;
3. confirm no answer teaching data is visible before submission;
4. answer with choice, confidence, and reasoning;
5. confirm the complete teaching sequence;
6. confirm Dashboard, Skills, Concepts, and History reflect the same user; and
7. verify the preserved legacy answer remains visible in History.

- [ ] **Step 5: Run MCP and scheduled-lesson smoke verification**

Use the connected Skill Compass app:

1. call `get_today`;
2. confirm five practical cases and the complete instructor pack;
3. confirm no automatic answer submission;
4. run one normal-chat answer and verify Web synchronization;
5. run the scheduled Daily Lesson once;
6. enter Voice/Live and complete one hint/reasoning/understanding-check cycle;
7. return to normal chat and sync one complete SYNC PACK item; and
8. verify the answer appears in Web History.

- [ ] **Step 6: Verify tenant isolation with a test user**

In an isolated test database, prepare the same date for `user_local` and
`user_member`. Confirm distinct quiz IDs and assignments. Attempt cross-user
read and submission through service tests and confirm not-found/forbidden.
Remove only test-database rows; do not delete production learner history.

- [ ] **Step 7: Update progress documentation**

Record:

- migration identifier;
- 70-question/category validation result;
- user-isolation verification;
- Web/MCP/Voice smoke results;
- full test counts; and
- any explicitly deferred work.

Do not record tokens, account identifiers, personal answers, or database
connection details.

- [ ] **Step 8: Commit verification notes**

```bash
git add docs/superpowers/progress/skill-compass-mvp.md
git commit -m "docs: record practical Today verification"
```

---

## Final Acceptance Checklist

- [ ] Exactly 70 active reviewed questions exist, ten per category.
- [ ] Every declared subtopic and all five case types are covered.
- [ ] Legacy definition questions are inactive and historical answers remain readable.
- [ ] Two users receive isolated quiz days, answers, scores, self-assessments, and history.
- [ ] Today selection uses only the authenticated user's history and scores.
- [ ] Web hides teaching data before answer and shows the full practical review afterward.
- [ ] Learner-safe MCP output contains no hidden answer data.
- [ ] Instructor pack contains five complete teacher rows.
- [ ] Scheduled preparation never submits an answer.
- [ ] Voice/Live asks choice, confidence, reasoning, hints before reveal, and checks understanding.
- [ ] Normal-chat SYNC PACK submission updates the same Web learning state.
- [ ] Architecture HTML, READMEs, Architecture MCP, and runbook describe the implemented system accurately.
- [ ] Lint, typecheck, full tests, build, migration, seed, Web smoke, and MCP smoke all pass.
