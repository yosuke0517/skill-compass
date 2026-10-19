# Admin interview support — local implementation

The isolated implementation includes a ticket-authorized WebSocket relay and Google STT/Vertex adapters. Local end-to-end tests use a development-only signing key and mock providers. The explicitly approved, bounded cloud trial has completed one real Chrome tab-audio → Google STT → Vertex hint flow. Private deployment identifiers and approval evidence are kept in the ignored operator record. Broad model quality, other OS/audio sources, and real-time endurance remain unverified.

## Implemented behavior

- `/admin/interview` and every browser API use the existing signed login session and fresh active admin/`access.manage` check. Pro membership alone never grants access.
- The relay screen asks for audio permission only after a click and before allocating a ticket. It sends interviewer audio only. The original separate-microphone capture test is still available when relay mode is unset. Video is never processed or sent.
- Cookie-authenticated start/reconnect returns a random 256-bit ticket, valid for 30 seconds. Only its SHA-256 hash is stored. Tickets are sent in the first WebSocket frame, never URLs or browser persistent storage.
- The relay authenticates its callback using a Google-signed ID token. The Worker verifies fixed issuer/audience/runtime subject and RS256 against a fixed Google JWKS endpoint. Local test signing keys cannot be selected in production.
- D1 consumes tickets with a single conditional `UPDATE … RETURNING`; SQL triggers atomically reserve duration/hint allowances and enforce one active session. No allowance is created by migration. Concurrent starts, ticket replay, and stale-session revival are rejected.
- Five-minute trials reserve 20 hint attempts; 40-minute sessions reserve 80. Allowances are provisioned explicitly; the approved production trial was only five minutes/20 hints, once. Failures, stopping, cleanup, and reconnect do not refund or create quota. Metadata cleanup never resets the separate allowance row. These are operational controls, not a monetary hard cap.
- Browser heartbeat starts immediately after ticket allocation and is attempted every ten seconds, with both audio callbacks and a fallback timer. Relay renewal is scheduled before the granted deadline (normally every 15 seconds, earlier for a shortened lease). Each lease is capped by the last browser heartbeat plus 30 seconds and the original session deadline. Stop/transport close cancels audio and in-flight hints immediately; failed lease renewal stops the relay. Reconnect needs a new ticket and either confirmed prior release or prior lease expiry. It preserves the original deadline and remaining attempts; missing audio/history is not reconstructed.
- PCM is mono 16 kHz, 100-ms chunks with sequence numbers, acknowledgements, a two-second backlog cap, and real-time rate limits. Authorization timeout is five seconds; WebSocket frames are limited to 4 KiB. No provider is constructed before authorization.
- STT uses V2 gRPC; a four-minute rotation half-closes the old input and drains final results while accepting new audio. A drain failure stops processing rather than silently dropping a seam.
- Final interviewer text triggers hints after coalescing. Every attempt is atomically reserved in D1, with a 2.5-second minimum interval and eight-second abort timeout. Only six recent bounded turns are considered. The complete text prompt is trimmed to 1,800 UTF-8 bytes; generated output is capped at 512 tokens and displayed as two or three lines. These byte controls are conservative input limits, not a measured provider token count.
- The prompt requests clarification points and answer structure, without invented experience or automatic speech. Google responses marked as thoughts are excluded. There is no narration or speech synthesis.
- The mock relay emits explicitly labeled interim/final sample text after fake PCM events; manual sample text is also supported. It does not claim to transcribe audio.

## Data retention and deployment boundary

The browser and relay keep bounded audio/text only in memory. Stop/unmount clears the display, draft, queue, stream, and pending work. D1 stores owner/session/deadline/usage/ticket hashes only. Rows older than expiry plus 24 hours are removed on the next ticket request; this is not a scheduled deletion guarantee. Provider retention and D1 backups are separate from application storage.

The relay must be reachable by the browser and its application authorization protects provider calls. An unauthenticated connection can still consume relay compute. Origin checks, connection/rate limits, and max-instance settings are not complete DDoS protection or a billing hard cap. Public reachability, service identity/permissions, processing regions, and cloud billing require separate approval. Do not deploy the mock configuration.

## Local setup

Use this isolated checkout and the existing local preview D1 binding, always `--local`. Existing app dependencies and disposable admin accounts must be set up as in `scripts/interview/create-local-fixtures.mjs`; do not import production data.

```sh
node scripts/interview/setup-local-relay.mjs
./node_modules/.bin/wrangler d1 execute skill-compass-preview --env preview --local --file drizzle-d1/0002_interview_relay.sql
./node_modules/.bin/wrangler d1 execute skill-compass-preview --env preview --local --file drizzle-d1/0003_interview_developer.sql
./node_modules/.bin/wrangler d1 execute skill-compass-preview --env preview --local --file drizzle-d1/0004_interview_learning.sql
./node_modules/.bin/wrangler d1 execute skill-compass-preview --env preview --local --file drizzle-d1/0005_interview_end_reason.sql
./node_modules/.bin/wrangler d1 execute skill-compass-preview --env preview --local --file .private/interview/relay-local-budget.sql
NEXT_DEV_WRANGLER_ENV=preview npm run dev -- --webpack --hostname 127.0.0.1 --port 4320
```

The setup script creates an ignored, local-only RSA signing fixture and loopback configuration. It does not issue Google credentials. The local budget SQL deliberately resets test metadata and test allowance; never run it against a remote database or as a runtime recovery mechanism.

In a second terminal:

```sh
cd services/interview-relay
npm ci
node --env-file=../../.private/interview/relay.env --import tsx src/index.ts
```

Open `http://127.0.0.1:4320/login?next=/admin/interview` and use the disposable local admin fixture. Its random password is in the ignored fixture file; do not paste it into chat or commits. Selecting a real input in mock mode only validates/discards PCM and produces clearly labeled sample events.

To use the original HTTP mock screen again, remove the `INTERVIEW_RELAY_*` settings and `INTERVIEW_LOCAL_JWKS` from `.env.local`; leave the original development mock flag. Never turn off authorization checks to troubleshoot a connection.

## Verification commands

```sh
npm run lint
npm run typecheck
npm test
cd services/interview-relay
npm run typecheck
npm test
```

From the app root, with both local servers running and a freshly initialized **local** test allowance:

```sh
node scripts/interview/verify-relay-local.mjs
```

This browser test consumes its 5-minute and 40-minute reservations (without waiting their full real durations). It verifies anonymous/normal/pro denial, authenticated PCM acknowledgement, sample hints, ticket replay rejection, same-deadline reconnect, stop cleanup, logout, and desktop/390px rendering. Screenshots are written under ignored `test-results/`.

## Cloud configuration

App configuration: `INTERVIEW_RELAY_MODE=google`, fixed `INTERVIEW_RELAY_URL` (`wss`), `INTERVIEW_RELAY_AUDIENCE` (the HTTPS redeem URL), and the numeric `INTERVIEW_RELAY_SUBJECT` of the approved runtime service account. Do not configure local JWKS in production.

Relay configuration: the same mode/audience, fixed `INTERVIEW_BROWSER_ORIGIN`, `INTERVIEW_GOOGLE_ENABLED=1`, `GOOGLE_CLOUD_PROJECT`, and selected `INTERVIEW_GEMINI_MODEL`. The implementation defaults to STT `us`/`chirp_3` and Vertex `global`/`gemini-3.1-flash-lite`. Google service-account keys are not required. An isolated container recipe is supplied in `services/interview-relay/Dockerfile`; container execution has been verified on Cloud Run.

The runtime permissions are `speech.recognizers.recognize`, `aiplatform.endpoints.predict`, and `serviceusage.services.use`. The approved API activation, service identity, Cloud Run/image resources, public entrance, and production D1 migration/allowance have been provisioned. The Worker has also been deployed; an authenticated browser trial has successfully produced real transcription and three hint lines. Each initial test and actual use consumes the already provisioned allowance; replenishment is an explicit operator action.

The local relay's health endpoint is `/health`; its container update is pending a registry connectivity fix. The initially used `/healthz` returned a Google frontend 404 in the deployed environment, while ordinary paths reached the container.

## Developer testing

The `developer` option requests a server-authorized testing session. It does not grant access. A separately provisioned `interview_relay_developers` row must match the existing authenticated user's immutable ID and be enabled. Migration grants nobody; no email matching, client role claim, shared admin auto-enrollment, or browser endpoint can create this permission. Fresh active-admin checks remain mandatory for starts and relay callbacks.

Developer sessions do not consume the normal five-minute/20-hint or 40-minute/80-hint reservation pool. Starts and total hint attempts have no fixed count limit, but each connection ends after 40 minutes. The singleton, 30-second ticket, generation/nonce, heartbeat/lease, hint rate limit, manual stop, and no-persistent-conversation rules remain unchanged. Reconnect preserves the original mode/deadline; it cannot upgrade a standard session.

A separate persistent estimate budget bounds paid testing. SQL triggers atomically reserve $0.03 per minute of authorized audio/relay time and $0.002 per hint attempt **before** provider processing. Time is prepaid through each lease deadline; paused/reconnected intervals can be conservatively counted, and stopping does not refund prepaid time. Failed hint attempts count. Exhaustion or disabling the owner row denies subsequent grants; outstanding processing stops by its already reserved lease deadline. Session cleanup cannot refill this budget. This accounting is deliberately conservative, not Google's invoice or an absolute cloud billing cap; image storage, unrelated requests, taxes, and future price changes are separate. No actual calls above the approved operational spending scope are authorized by choosing this option.

The UI shows the server-confirmed mode, elapsed session time, displayed hint count, and periodically refreshed server attempt count. Displayed hints count only this page's received results; the attempt count can include failed/discarded generations. No credentials or unrelated roles are created or changed.

## Official references

- https://docs.cloud.google.com/docs/authentication/get-id-token
- https://docs.cloud.google.com/run/docs/authenticating/service-to-service
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://cloud.google.com/speech-to-text/v2/docs/streaming-recognize
- https://cloud.google.com/speech-to-text/v2/quotas
- https://cloud.google.com/run/docs/triggering/websockets

The ticket-and-callback protocol is application code, not a vendor-provided combined product. Mock identity and transport tests do not establish production IAM correctness.

## Verification record — 2026-10-09

- Application: ESLint and TypeScript passed; 102 test files / 507 tests passed.
- Relay: clean offline lockfile install, TypeScript, and 18 tests passed. Google wire behavior was initially tested with fake transports; the bounded production trial subsequently exercised both real providers.
- Chrome + local D1 + local signed-ID relay: anonymous/normal/pro denial; fake PCM to labeled interim/final sample text and automatic hints; ticket replay denial; reconnect with unchanged deadline; stop clears tracks/text; logout fails closed. Desktop and 390px screenshots were inspected for overflow/readability.
- Next.js standalone build and OpenNext Cloudflare Worker bundling passed. Existing middleware deprecation/bundler warnings remain. The approved production Worker deployment has since completed; private deployment identifiers are recorded in the ignored operator record.
- Cloud Run container execution and real Google ID-token callbacks passed in the approved production trial. Chrome shared-tab audio produced the expected Japanese question transcript and three structure/clarification hints. No personal microphone was captured. Stop cleared capture and all displayed conversation.
- The first connection exceeded the old eight-second deadline; reconnect within the same trial succeeded. Cold start is plausible but not established as the cause. The client now allows 20 seconds, within the 30-second ticket lifetime; three regression tests cover delayed readiness, timeout, and immediate manual stop.
- Other OS/system-audio sources, broader STT/model quality, measured latency/cost, and wall-clock 40-minute endurance remain unverified. The one trial allocation is consumed; do not reset or replenish it automatically.

## Optional text history

Start failures expose safe diagnostic codes: `STANDARD_ALLOWANCE_EXHAUSTED`, `DEVELOPER_NOT_ALLOWED`, `DEVELOPER_BUDGET_EXHAUSTED`, `DEVELOPER_ACCESS_CHANGED`, `ACTIVE_SESSION`, or `START_DATABASE_ERROR`. Unknown database faults return 503 rather than being described as a quota conflict. Raw database errors and owner IDs are not returned. Failed starts do not create learning history, so historical failures cannot be reconstructed from that history. When the normal trial allowance is unavailable but the authenticated owner already has developer permission and sufficient estimate budget, the page initially selects developer mode. This read-only selection does not issue a ticket, grant permission, replenish funds, or start capture.

Text history is off by default. After migration `0004_interview_learning.sql` and a compatible relay are deployed, set `INTERVIEW_LEARNING_ENABLED=1` to expose the opt-in checkbox. Do not enable the flag with an older relay. No audio is persisted. Mock mode supports the same record pipeline without provider calls; its model is labeled `mock-no-provider`.

Consenting sessions retain final transcript text, the exact prepared Vertex request (bounded context, instruction, model, prompt version and generation settings), output, attempt status and wall-clock latency. A prepared request can fail or abort before network submission; it is not proof that the provider accepted it. Generation success, WebSocket send and visible-page render acknowledgement are separate fields. Render acknowledgement does not prove that the user read the hint. Logging failures show a warning while the audio session continues; history may be incomplete.

`/admin/interview/history` allows the owning active administrator to review, evaluate, export and delete records. Export downloads JSON locally and never reruns a model. Each database read returns at most ten turns and ten generations; export gathers all pages. Avoid exporting an active session if a stable comparison snapshot is required. Session ownership is checked for every operation. Deletion cannot be undone by late relay callbacks.

History expires 30 days after session creation. Expired records immediately disappear from reads and writes. The existing scheduled worker deletes batches of up to 100 expired sessions with cascading children; maintenance mode suspends scheduled deletion. Database backups have independent platform retention. Relay authorization metadata still follows its separate 24-hour cleanup policy.

Rollout order: additive migration, Worker with learning flag off, compatible relay (`/health` returns `learningVersion: 1`), then enable the flag. Rollback by disabling the flag for new sessions and reverting the relay only after consenting sessions finish. Retain the new Worker purge job and schema so existing saved records can still be read/deleted and expire normally. No new storage bucket or IAM role is required.

Local verification: run the `interview-learning`, `interview-relay-store`, and `relay-interview-panel` Vitest suites; run `node --import tsx --test tests/*.test.ts` in `services/interview-relay`. All provider tests inject synthetic responses. Live capture and paid-provider verification must be performed separately using the user's manual Start action.

## Connection-end diagnostics

Apply additive migration `0005_interview_end_reason.sql` before deploying the updated Worker, then deploy the compatible relay. The relay reports a bounded end-reason code through its authenticated callback before releasing its lease. Metadata is copied to opted-in history and exported with it. `endedAt` is the Worker receipt time, not an exact audio-stop timestamp; failed network delivery or process termination can leave it unset. Reconnecting clears the previous generation’s end metadata. This does not extend authorization, increase allowances, or store audio.

The lease regression test simulates two minutes of differently phased browser and relay renewals. Separate tests retain hard lease/session expiry. Real browser background throttling, sustained Google processing and deployed history must still be verified on the approved practice audio after each relevant rollout.
