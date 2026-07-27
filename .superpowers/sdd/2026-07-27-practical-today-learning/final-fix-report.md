# Final whole-branch fix report

## Status

All final-review Critical/Important findings and both deferred Task 3 minors are
addressed locally. No external deployment, restart, scheduled task, Voice/Live
smoke, or production database mutation was attempted in this fix wave.

## 1. Complete deterministic selection with recent fallback

Root cause: both selectors switched to a fresh-only candidate list whenever
even one fresh row existed. A day with two fresh rows therefore returned two
questions even when eligible recent active rows could fill the requested five.

- `selectDailyQuiz` now treats due and fresh questions as the preferred pool.
  When that pool is partial, recent active questions enter only as fallback.
- Combination ranking first maximizes preferred rows, then preserves the
  existing need, trust, difficulty, and user/date deterministic tie-breaks.
- Partial preferred rows are reserved inside the bounded 25-candidate search
  pool, so a large bank cannot rank them out before the combination search.
- Existing category, case-type, and correct-choice balance constraints remain.
- Additional practice concatenates independently sorted fresh and recent
  active pools, then fills the requested bounded batch.
- Existing owner checks, active-only filtering, prepared-ID exclusion,
  deterministic ordering, insert-ignore persistence, and the 30-question cap
  remain intact.

RED coverage proved the previous 2/5 result in both selectors and proved that
two fresh rows could disappear outside the bounded pool in a 70-row bank.

### Re-review fix: reserve balance dimensions before bulk preferred fill

A second whole-branch review found that the bounded pool still bulk-filled all
preferred rows before reserving balance representatives. With 70 fresh rows,
40 high-need rows sharing one category, case type, and answer ID could occupy
all 25 search slots. The hard category and answer constraints then made every
five-row combination invalid, even though balanced fresh candidates existed
later in the ranked bank.

- The bounded pool now reserves the best deterministic representative for
  case type, answer ID, and category before bulk-filling preferred rows.
- Representative lookup still uses the existing due/need, trust, difficulty,
  and user/date ranking, and combination scoring continues to maximize
  preferred questions before other scores.
- The 25-candidate and 75,000-node bounds are unchanged.
- A 70-row pathological regression verifies five balanced results, stable
  ordering, and inclusion of the due question from the homogeneous high-need
  group.

The new test was RED with a zero-question result before the ordering change
and GREEN afterward. Existing partial-fresh fallback, due precedence, large
bank, deterministic, and balance tests remain green.

## 2. Active-only Dashboard and finalized-only progress

Root cause: Dashboard loaded assignment IDs without joining question
activation, and Today/streak logic treated the recoverable raw answer row as a
completed answer before evaluation finalized `correct`.

- Dashboard assignment reads now join `questions` and project `active`.
- Today total counts active assignments only.
- Today answered count, weekly accuracy, and streaks use only
  `correct IS NOT NULL` finalized rows.
- Inactive legacy assignments remain stored and remain available to History.
- Raw answer rows remain untouched for the existing retry/finalization path.

RED coverage includes a current day containing active, inactive legacy, and
unfinalized assignments, plus an unfinalized-only day that must not create a
streak.

## 3. Finalized-only History

History archive summaries, selected-day cards, and search results now exclude
`correct = NULL` raw answer rows. The row is not deleted or rewritten, so the
one-time evaluation recovery path remains available. A shared builder helper
keeps archive and search filtering consistent; selected-day filtering applies
the same boundary.

RED coverage proved that one raw row previously changed archive accuracy,
appeared as an answer card, and was searchable by its reasoning text.

## 4. Learner-safe Concepts

Root cause: the seed copied each exact hidden `question.rationale` into the
shared Concept `currentUnderstanding`, which the pre-answer Concepts page
returned directly.

- Added 31 reviewed subtopic definitions with learner-safe conceptual
  synopses, independent of any question answer or rationale.
- The seed writes those synopses rather than hidden rationales.
- The Concepts projection derives the canonical synopsis from the reviewed
  category/subtopic tag, so an already-stored leaked rationale cannot pass
  through while a deployment is converging.
- Legacy/noncanonical concepts retain their existing shared description.
- Concept content is shared by design; user answers, scores,
  self-assessments, and history are not updated. Existing score and
  self-assessment seed writes remain insert-ignore only.

Tests compare every one of the 70 concept rows against its hidden rationale and
exercise the public Concepts projection with an intentionally leaked stored
value.

## 5. Authoritative reviewed sources

- Added one claim-focused authoritative source for every one of the 31
  subtopics instead of nine broad category landing pages.
- `defineQuestion` resolves its source from category/subtopic, making the
  mapping structural for all 70 questions.
- The question-bank validator rejects a source that does not match the
  reviewed subtopic mapping.
- Seed reruns upsert the 31 canonical source rows and replace only the
  reviewed concepts' shared source links. Historical question rows and their
  old source references are preserved.
- Tests require HTTPS, a non-root path, tier 1, official status, a reviewed
  authoritative hostname, complete subtopic coverage, and a valid source for
  every active question.

The new links use primary or first-party documentation from MIT OpenCourseWare,
IETF/RFC Editor, MySQL, OpenAPI, OAuth BCP, AWS, RabbitMQ, TypeScript, MDN,
React, W3C, Docker, SLSA, OpenTelemetry, OWASP, Microsoft, OpenAI, and MCP.

## 6. HTTP revalidation lesson

`q_web_02` now explicitly requires:

- `Cache-Control: no-cache`;
- a stable representation-specific `ETag`;
- `If-None-Match` revalidation; and
- `304 Not Modified` for unchanged content.

The correct label, explanation, rationale, practical note, and regression test
all reflect the complete mandatory-revalidation contract.

## 7. Deployment runbook

The ChatGPT MCP runbook now orders the deployment as:

1. install and build;
2. create and restore-check a production backup;
3. run migrations, explicitly including backup protection for `0016`;
4. run `db:seed`; and
5. continue origin/startup verification.

It explains that the idempotent seed publishes the reviewed questions, safe
Concept synopses, and canonical references without resetting user learning
state.

## Verification

- Focused RED/GREEN suites: passed.
- Full Vitest suite: **65 files, 294 tests passed**.
- `TZ=UTC` boundary suite: **4 files, 10 tests passed**.
- `TZ=Asia/Tokyo` boundary suite: **6 files, 26 tests passed**.
- TypeScript: passed.
- Full ESLint: passed.
- Production build: passed with build-only non-secret local validation
  placeholders for required environment variables.
- `git diff --check`: passed.
- Learner-safe rationale, legacy broad active-source, and ownership/finalization
  scans: passed.

The existing Next.js multiple-workspace-lockfile root warning remains. It does
not affect compilation or page generation. The worktree-local `node_modules`
symlink is untracked and is not staged.
