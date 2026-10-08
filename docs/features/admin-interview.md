# Admin interview support — local implementation

The isolated implementation now includes a ticket-authorized WebSocket relay and Google STT/Vertex adapters. Local end-to-end tests use a development-only signing key and mock providers. No cloud services, IAM changes, paid requests, or deployments have been performed. Real Google identity verification, model quality, actual OS audio capture, and real-time endurance remain unverified.

## Implemented behavior

- `/admin/interview` and every browser API use the existing signed login session and fresh active admin/`access.manage` check. Pro membership alone never grants access.
- The relay screen asks for audio permission only after a click and before allocating a ticket. It sends interviewer audio only. The original separate-microphone capture test is still available when relay mode is unset. Video is never processed or sent.
- Cookie-authenticated start/reconnect returns a random 256-bit ticket, valid for 30 seconds. Only its SHA-256 hash is stored. Tickets are sent in the first WebSocket frame, never URLs or browser persistent storage.
- The relay authenticates its callback using a Google-signed ID token. The Worker verifies fixed issuer/audience/runtime subject and RS256 against a fixed Google JWKS endpoint. Local test signing keys cannot be selected in production.
- D1 consumes tickets with a single conditional `UPDATE … RETURNING`; SQL triggers atomically reserve duration/hint allowances and enforce one active session. No allowance is created by migration. Concurrent starts, ticket replay, and stale-session revival are rejected.
- Five-minute trials reserve 20 hint attempts; 40-minute sessions reserve 80. The initial allowance is 45 minutes/100 hints. Failures, stopping, cleanup, and reconnect do not refund or create quota. Metadata cleanup never resets the separate allowance row. These are operational controls, not a monetary hard cap.
- Browser heartbeat and relay lease renewal occur every 15 seconds. Each lease is capped by the last browser heartbeat plus 30 seconds and the original session deadline. Stop/transport close cancels audio and in-flight hints immediately; failed lease renewal stops the relay. Reconnect needs a new ticket and either confirmed prior release or prior lease expiry. It preserves the original deadline and remaining attempts; missing audio/history is not reconstructed.
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

## Cloud configuration prepared, not applied

App configuration: `INTERVIEW_RELAY_MODE=google`, fixed `INTERVIEW_RELAY_URL` (`wss`), `INTERVIEW_RELAY_AUDIENCE` (the HTTPS redeem URL), and the numeric `INTERVIEW_RELAY_SUBJECT` of the approved runtime service account. Do not configure local JWKS in production.

Relay configuration: the same mode/audience, fixed `INTERVIEW_BROWSER_ORIGIN`, `INTERVIEW_GOOGLE_ENABLED=1`, `GOOGLE_CLOUD_PROJECT`, and selected `INTERVIEW_GEMINI_MODEL`. The implementation defaults to STT `us`/`chirp_3` and Vertex `global`/`gemini-3.1-flash-lite`. Google service-account keys are not required. An isolated container recipe is supplied in `services/interview-relay/Dockerfile`; container execution is not yet verified.

The proposed initial runtime permissions are `speech.recognizers.recognize`, `aiplatform.endpoints.predict`, and `serviceusage.services.use`. API activation, service identity, Cloud Run/image resources, public entrance, production D1 migration/allowance, and Worker deployment have not been executed. Each initial test and actual use consumes the already provisioned allowance; replenishment is an explicit operator action.

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
- Relay: clean offline lockfile install, TypeScript, and 18 tests passed. Google wire behavior was tested with fake transports; real provider APIs were never called.
- Chrome + local D1 + local signed-ID relay: anonymous/normal/pro denial; fake PCM to labeled interim/final sample text and automatic hints; ticket replay denial; reconnect with unchanged deadline; stop clears tracks/text; logout fails closed. Desktop and 390px screenshots were inspected for overflow/readability.
- Next.js standalone build and OpenNext Cloudflare Worker bundling passed. Existing middleware deprecation/bundler warnings remain; no deployment was attempted.
- Docker CLI is present, but its daemon socket is unavailable. Container execution was not verified. Real Google identity, real STT/Vertex accuracy/latency, OS system audio, and wall-clock 40-minute endurance remain pending.
