# Cloudflare Phase 2 Podcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stopped Mac polling worker with idempotent Cloudflare Cron and Queue workers that generate Podcast scripts and audio into D1 and R2.

**Architecture:** A dedicated Podcast Worker shares domain services with the Web application but has separate Cron, generation Queue, audio Queue, and dead-letter bindings. D1 remains the durable job state and R2 remains audio storage. Queue messages contain identifiers only and may be retried safely.

**Tech Stack:** Cloudflare Workers, Queues, Cron Triggers, D1, R2, Gemini Script/TTS APIs, Terraform, Wrangler, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-cloudflare-migration-design.md`

## Global Constraints

- Phase 1 production must be stable before enabling Podcast consumers.
- Existing five ready episodes and R2 objects are immutable migration inputs.
- Queue messages contain no OAuth tokens, Gemini keys, scripts, answer data, or audio bytes.
- Every producer and consumer operation is idempotent.
- Failed messages terminate in a dead-letter queue with bounded retries.

---

### Task 1: Extract idempotent Podcast job services

**Files:**
- Create: `src/lib/podcast/jobs/repository.ts`
- Create: `src/lib/podcast/jobs/service.ts`
- Create: `src/lib/podcast/jobs/messages.ts`
- Modify: `src/lib/podcast/worker.ts`
- Modify: `src/app/actions/podcast.ts`
- Create: `tests/unit/podcast-job-service.test.ts`

**Interfaces:**
- Produces `enqueueEpisode(userId, requestedFor): Promise<EnqueueResult>`
- Produces message schemas `GenerateScriptMessage` and `GenerateAudioChunkMessage`

- [ ] Write failing tests for duplicate manual requests, duplicate Cron runs, redelivered messages, concurrent claims, completed jobs, and failed retries.
- [ ] Define messages containing version, job ID, episode ID, user ID, and chunk index only.
- [ ] Move idempotency and status transitions out of the polling loop into transactional D1 repository operations.
- [ ] Make the Web action and legacy worker call the same service during the transition.
- [ ] Run Podcast service and pipeline tests.
- [ ] Commit with `git commit -m "refactor: extract idempotent Podcast jobs"`.

### Task 2: Queue and dead-letter infrastructure

**Files:**
- Modify: `infra/cloudflare/queues.tf`
- Modify: `infra/cloudflare/workers.tf`
- Modify: `infra/cloudflare/outputs.tf`
- Create: `wrangler.podcast.jsonc`
- Create: `workers/podcast/index.ts`
- Create: `tests/unit/podcast-worker-contract.test.ts`

**Interfaces:**
- Bindings: `PODCAST_GENERATION_QUEUE`, `PODCAST_AUDIO_QUEUE`, `PODCAST_DLQ`, `DB`, `PODCAST_AUDIO`

- [ ] Write a failing contract test requiring queue and scheduled handlers and rejecting request-path imports from the Next.js application.
- [ ] Add staging and production generation, audio, and dead-letter queues with bounded retries and retention.
- [ ] Add a dedicated Worker configuration with D1/R2/Queue bindings and no public route.
- [ ] Implement handler dispatch that validates message schemas and delegates to job services.
- [ ] Apply staging Terraform, deploy the staging Podcast Worker, and verify a malformed message reaches controlled failure without leaking content.
- [ ] Commit with `git commit -m "infra: add Podcast queue workers"`.

### Task 3: Cron and manual enqueueing

**Files:**
- Modify: `src/lib/podcast/scheduler.ts`
- Modify: `workers/podcast/index.ts`
- Modify: `src/app/actions/podcast.ts`
- Create: `tests/unit/podcast-cron.test.ts`

**Interfaces:**
- Produces scheduled handler using UTC Cron and user timezone calculations
- Produces one queue message per idempotency key

- [ ] Write failing tests for Asia/Tokyo daily, weekday, weekly, disabled/manual schedules, repeated Cron delivery, and daylight-independent date keys.
- [ ] Implement Cron as a due-schedule scan that creates D1 job state before sending a generation message.
- [ ] Change manual generation to create the same durable job and send through the same Queue binding.
- [ ] Verify repeated scheduled and manual requests produce one episode.
- [ ] Commit with `git commit -m "feat: enqueue Podcast generation from Cron"`.

### Task 4: Script generation consumer

**Files:**
- Create: `src/lib/podcast/workers/generate-script.ts`
- Modify: `src/lib/podcast/context-collector.ts`
- Modify: `src/lib/podcast/content-collector.ts`
- Modify: `src/lib/podcast/news-collector.ts`
- Modify: `src/lib/podcast/providers/gemini-script-generator.ts`
- Create: `tests/integration/podcast-script-consumer.test.ts`

**Interfaces:**
- Consumes `GenerateScriptMessage`
- Produces D1 script and `GenerateAudioChunkMessage[]`

- [ ] Write failing integration tests for successful sources, partial collector failure, Gemini rate limit, message redelivery after D1 commit, and encrypted connected-service tokens.
- [ ] Make collectors Workers-compatible and bound every outbound request with timeouts and response-size limits.
- [ ] Claim the generation job atomically, generate and persist the script once, then enqueue missing chunks by deterministic index.
- [ ] Classify retryable and terminal errors without storing provider response bodies.
- [ ] Verify redelivery does not call Gemini twice after a persisted script exists.
- [ ] Commit with `git commit -m "feat: generate Podcast scripts in Queue consumer"`.

### Task 5: Audio generation and R2 finalization

**Files:**
- Create: `src/lib/podcast/workers/generate-audio.ts`
- Create: `src/lib/podcast/workers/finalize-audio.ts`
- Modify: `src/lib/podcast/providers/gemini-speech-synthesizer.ts`
- Modify: `src/lib/podcast/audio-storage-provider.ts`
- Create: `tests/integration/podcast-audio-consumer.test.ts`

**Interfaces:**
- Consumes `GenerateAudioChunkMessage`
- Writes deterministic R2 chunk and final keys

- [ ] Write failing tests for chunk redelivery, existing R2 chunk, Gemini unavailable, partial completion, finalization races, and final ready transition.
- [ ] Generate each chunk with a deterministic R2 key and record metadata only after successful object storage.
- [ ] Make finalization claim exclusive, read ordered chunks, validate WAV headers, assemble within Workers memory limits, and store the final key used by existing playback APIs.
- [ ] Enforce a 64 MiB maximum combined WAV size before allocation; mark larger episodes with terminal code `audio_too_large` and keep their ready chunks for an explicitly requested shorter retry.
- [ ] Verify two finalizers cannot create conflicting assets or ready transitions.
- [ ] Commit with `git commit -m "feat: generate Podcast audio into R2"`.

### Task 6: Failure recovery and operations

**Files:**
- Create: `src/lib/podcast/workers/errors.ts`
- Create: `scripts/cloudflare/replay-podcast-dlq.ts`
- Create: `docs/runbooks/podcast-cloudflare-operations.md`
- Modify: `src/app/(app)/podcast/page.tsx`
- Create: `tests/unit/podcast-dlq.test.ts`

**Interfaces:**
- Produces redacted failure codes and explicit replay command

- [ ] Write failing tests for retry classification, retry exhaustion, DLQ payload redaction, authorized retry, and duplicate replay.
- [ ] Persist bounded error codes and attempt metadata while keeping tokens, provider bodies, scripts, and audio out of logs and Queue messages.
- [ ] Add an operator replay command that checks current D1 state before requeueing and requires explicit environment and job ID.
- [ ] Update the Podcast page to distinguish queued, processing, retryable failure, terminal failure, and ready.
- [ ] Run failure injection against staging and verify dead-letter and replay behavior.
- [ ] Commit with `git commit -m "feat: add Podcast queue recovery"`.

### Task 7: Staging validation and production enablement

**Files:**
- Create: `tests/e2e/podcast-cloudflare.spec.ts`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `docs/runbooks/cloudflare-staging-checklist.md`
- Modify: `src/lib/mcp/architecture/manifest.ts`

**Interfaces:**
- Produces Podcast generation verification artifact keyed by commit SHA

- [ ] Add staging E2E coverage for manual generation, scheduled enqueue simulation, script processing, all audio chunks, R2 playback, MCP episode listing, and Podcast chat.
- [ ] Run duplicate and failure injection and confirm no duplicate episode or asset.
- [ ] Keep production Queue consumers paused during Terraform apply and deploy.
- [ ] Promote the verified SHA through production approval, then enable consumers and one controlled manual episode.
- [ ] Verify the controlled episode reaches ready and plays with the Mac worker stopped.
- [ ] Disable and remove the local Podcast LaunchAgent or polling process only after production verification.
- [ ] Run the full suite, Terraform no-drift plan, Worker smoke tests, and mobile playback.
- [ ] Update the authenticated migration guide and architecture MCP to mark Phase 2 complete, then commit with `git commit -m "docs: complete Cloudflare Podcast migration"`.
