# Cloudflare Phase 1 Application Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Web, Today, MCP, OAuth, X, user data, and existing Podcast playback from local MySQL and the Mac origin to Cloudflare Workers, D1, and R2.

**Architecture:** Convert the application persistence layer from MySQL Drizzle to D1/SQLite Drizzle, while retaining a read-only MySQL export adapter solely for migration. Validate the full application in isolated staging, then promote an exact staging commit through a manually approved production workflow and short read-only cutover window.

**Tech Stack:** Next.js/OpenNext, Cloudflare Workers, D1, R2, Drizzle ORM SQLite/D1, Terraform, Wrangler, GitHub Actions, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-14-cloudflare-migration-design.md`

## Global Constraints

- Phase 0 must be complete and staging deployment green.
- Existing production stays on the Mac until the explicit cutover task.
- MySQL is never dual-written with D1.
- Production schema changes use `expand -> migrate -> contract`.
- OAuth token-encryption and session-signing secrets are preserved securely.
- The five existing R2 Podcast assets are reused, not copied or regenerated.

---

### Task 1: Inventory MySQL and runtime incompatibilities

**Files:**
- Create: `scripts/migration/inventory-mysql.ts`
- Create: `tests/integration/mysql-inventory.test.ts`
- Create: `docs/runbooks/mysql-d1-migration-inventory.md`

**Interfaces:**
- Produces redacted `MigrationInventory` containing table counts, schema features, and MySQL-specific query sites

- [ ] Write a failing test that requires every table in `src/db/schema.ts` to appear in the inventory and rejects row values or secrets in serialized output.
- [ ] Implement schema and source scanning for enums, JSON, timestamps, upserts, affected-row assumptions, raw SQL, indexes, and transaction use.
- [ ] Run inventory against a disposable fixture and current production schema, saving only counts and feature classifications.
- [ ] Classify every incompatibility with a concrete replacement documented in the runbook.
- [ ] Commit with `git commit -m "chore: inventory MySQL to D1 migration"`.

### Task 2: D1 schema and database client boundary

**Files:**
- Move: `src/db/schema.ts` to `src/db/mysql-schema.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/client-types.ts`
- Modify: `src/db/client.ts`
- Create: `src/db/mysql-export-client.ts`
- Create: `drizzle.d1.config.ts`
- Modify: `drizzle.config.ts`
- Modify: `tests/unit/schema-shape.test.ts`
- Create: `tests/unit/d1-schema-shape.test.ts`

**Interfaces:**
- Produces D1 application schema from `src/db/schema.ts`
- Produces `getDb(): Promise<D1DatabaseClient>`
- Produces migration-only `getMySqlExportDb()`

- [ ] Write failing schema tests requiring SQLite tables, indexes, JSON serialization, nullable optional confidence, and all current foreign-key relationships.
- [ ] Translate MySQL enums to validated text columns, timestamps to integer or ISO text columns consistently, and JSON to Drizzle text JSON mode.
- [ ] Replace the module-level MySQL pool with request-safe D1 binding resolution and `drizzle(env.DB, { schema })`.
- [ ] Isolate `mysql2` behind `mysql-export-client.ts` so it is unreachable from Worker request imports.
- [ ] Generate D1 migrations and run them against a disposable local D1 database.
- [ ] Run schema tests and OpenNext bundle inspection to confirm `mysql2` is absent from the Worker bundle.
- [ ] Commit with `git commit -m "refactor: move application persistence to D1"`.

### Task 3: Query compatibility conversion

**Files:**
- Modify: all modules under `src/lib/` and `src/app/actions/` importing `@/db/client`
- Modify: MCP OAuth repositories under `src/lib/mcp/auth/`
- Modify: integration tests under `tests/integration/`
- Create: `tests/integration/d1-application-queries.test.ts`

**Interfaces:**
- Consumes `getDb()` instead of a process-global `db`
- Produces D1-compatible application query behavior

- [ ] Add fixture-driven failing tests for login, access resolution, Today assignment, answer idempotency, scoring, history, self-assessment, source settings, OAuth code exchange, refresh rotation, X token retrieval, Podcast listing, asset authorization, and chat.
- [ ] Replace MySQL `onDuplicateKeyUpdate` with SQLite `onConflictDoUpdate` or `onConflictDoNothing` using explicit conflict targets.
- [ ] Replace MySQL affected-row branching with returned-row or follow-up-state assertions that are atomic under D1 transactions/batches.
- [ ] Replace MySQL-specific SQL expressions and timestamp handling with SQLite equivalents.
- [ ] Convert direct `db` imports to request-scoped `await getDb()` without widening data access across users.
- [ ] Run D1 integration tests plus the full existing suite after each bounded module group.
- [ ] Commit with `git commit -m "refactor: make application queries D1 compatible"`.

### Task 4: Runtime secret providers and R2 bindings

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/lib/secrets/keychain.ts`
- Modify: `src/lib/integrations/oauth-client.ts`
- Modify: `src/lib/integrations/x-oauth.ts`
- Modify: `src/lib/podcast/audio-storage-provider.ts`
- Create: `src/lib/runtime/bindings.ts`
- Modify: `tests/unit/env.test.ts`
- Modify: `tests/unit/audio-storage.test.ts`
- Create: `tests/unit/runtime-bindings.test.ts`

**Interfaces:**
- Produces typed Worker bindings and secrets through `getRuntimeBindings()`
- Keeps keychain providers local-only

- [ ] Write failing tests proving Cloudflare runtime reads Gemini, X, Google, session, and encryption secrets from bindings and never invokes macOS Keychain.
- [ ] Add runtime detection with explicit local and Cloudflare provider branches; missing production secrets fail closed with their names but never values.
- [ ] Replace S3 API credential use for application R2 reads with the native R2 binding while retaining the migration-only S3 client outside request imports.
- [ ] Validate existing R2 asset authorization and byte-range playback in OpenNext preview.
- [ ] Run secret-redaction and audio-storage tests.
- [ ] Commit with `git commit -m "refactor: use Workers secrets and R2 bindings"`.

### Task 5: Deterministic MySQL-to-D1 migration tool

**Files:**
- Create: `scripts/migration/export-mysql.ts`
- Create: `scripts/migration/import-d1.ts`
- Create: `scripts/migration/verify-migration.ts`
- Create: `scripts/migration/types.ts`
- Create: `tests/integration/mysql-to-d1-migration.test.ts`
- Create: `docs/runbooks/mysql-to-d1-cutover.md`

**Interfaces:**
- Produces encrypted local export artifact with manifest and table chunks
- Produces `MigrationReport` with counts, key checks, and redacted failures

- [ ] Create a fixture containing users, sessions, Today history, OAuth refresh families, encrypted integration tokens, Podcast assets, and chats; write a failing round-trip test comparing safe fields and ciphertext bytes.
- [ ] Implement stable table ordering and chunked export with no secret values printed to stdout.
- [ ] Implement D1 import using idempotent explicit primary keys and transaction batches within D1 limits.
- [ ] Implement verification of counts, primary keys, foreign references, latest Today progress, OAuth family counts, and R2 storage keys.
- [ ] Run dry-run and repeated-import tests to prove deterministic results.
- [ ] Document backup location, retention, deletion, and the exact maintenance-mode sequence.
- [ ] Commit with `git commit -m "feat: add verified MySQL to D1 migration"`.

### Task 6: Complete staging application verification

**Files:**
- Create: `tests/e2e/cloudflare-staging.spec.ts`
- Create: `scripts/cloudflare/mcp-smoke.ts`
- Create: `docs/runbooks/cloudflare-staging-checklist.md`
- Modify: `.github/workflows/deploy-staging.yml`

**Interfaces:**
- Produces a GitHub artifact `staging-verification.json` keyed by commit SHA

- [ ] Add automated staging tests for login, migration guide, Today read/write, scoring, history, OAuth metadata, MCP initialize/tools/list, controlled MCP answer submission in the staging user, X lookup/fallback, and existing Podcast playback.
- [ ] Add negative tests for cross-user access, open redirects, missing secrets, production resource names, and mutating public smoke tests.
- [ ] Connect a staging ChatGPT MCP app and manually exercise authorization and refresh without production credentials.
- [ ] Publish the exact commit SHA, staging URL, D1 migration version, Terraform plan digest, and test results as the verification artifact.
- [ ] Run the mobile manual checklist and record only pass/fail evidence without tokens or personal content.
- [ ] Commit with `git commit -m "test: verify Cloudflare staging application"`.

### Task 7: Production Terraform and approval workflow

**Files:**
- Modify: `infra/cloudflare/d1.tf`
- Modify: `infra/cloudflare/r2.tf`
- Modify: `infra/cloudflare/dns.tf`
- Modify: `infra/cloudflare/workers.tf`
- Create: `.github/workflows/deploy-production.yml`
- Create: `scripts/cloudflare/verify-staging-sha.ts`
- Create: `tests/unit/verify-staging-sha.test.ts`

**Interfaces:**
- Consumes `workflow_dispatch` input `commit_sha`
- Requires GitHub Environment `production`
- Produces production GitHub Deployment

- [ ] Write failing tests rejecting an unverified SHA, a moving branch name, a failed staging deployment, and a staging artifact whose SHA differs from the requested production SHA.
- [ ] Import the existing production R2 bucket and production DNS/tunnel record into Terraform state; verify the first plan does not replace or delete them.
- [ ] Add production D1 with lifecycle `prevent_destroy` and keep the existing Tunnel route active.
- [ ] Configure the manual workflow to check out the exact SHA, verify staging evidence, wait for production approval, show a fresh plan, and stop on any replacement of D1/R2.
- [ ] Add production Workers Secrets through the protected environment without writing them to Terraform or artifacts.
- [ ] Run a production dry run that stops before DNS routing and application writes.
- [ ] Commit with `git commit -m "ci: add approved production promotion"`.

### Task 8: Read-only cutover and public verification

**Files:**
- Create: `src/lib/runtime/maintenance.ts`
- Create: `src/app/maintenance/page.tsx`
- Create: `tests/unit/maintenance-mode.test.ts`
- Create: `scripts/cloudflare/production-smoke.ts`
- Modify: `docs/runbooks/mysql-to-d1-cutover.md`
- Modify: `docs/runbooks/chatgpt-mcp.md`

**Interfaces:**
- Consumes signed `MAINTENANCE_MODE=read_only`
- Produces final production cutover report

- [ ] Write failing tests proving read-only mode permits login and reads but blocks answer submission, OAuth token mutation, settings writes, and Podcast enqueueing with a clear response.
- [ ] Implement maintenance guards at shared mutation boundaries and render the maintenance page.
- [ ] Execute final MySQL backup, enable Mac read-only mode, export the final delta, import D1, and run verification.
- [ ] Promote the staging-verified SHA, route `agent.finegate.xyz` to the Worker, and run public login/OAuth/MCP/Today/X/Podcast playback smoke tests.
- [ ] Verify ChatGPT's existing Skill Compass connection; if reauthorization is required, execute and document the tested reconnect path.
- [ ] Enable Cloudflare writes only after verification; leave Mac and MySQL read-only for the observation period.
- [ ] Run full tests, OpenNext build, Terraform no-drift plan, and external smoke tests.
- [ ] Commit the redacted cutover evidence with `git commit -m "docs: record Cloudflare production cutover"`.

