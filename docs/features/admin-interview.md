# Admin interview support — local mock

This change adds `/admin/interview` to the existing admin shell. It does not enable a cloud provider or deploy a service. Admin access uses the same predicate as `requireAdmin`: a fresh active database user with `role=admin` and `access.manage`. A pro plan alone is not sufficient. No existing role/plan data is modified.

All six POST operations under `/api/admin/interview/[operation]` resolve the signed login session and current database permissions before parsing input: start, stop, reconnect, pulse, audio, hint. Role/user fields supplied by clients are ignored. Sessions are owner-scoped and responses are no-store. Same-origin, bounded bodies, audio sequence validation, rate and duration limits apply. No bearer provider credential reaches the browser.

## What works

- Manual start/stop; repeated starts replace a user's old session. Stop clears displayed samples/hints and stops media tracks. Pending responses cannot restore stopped text.
- Three deterministic structure hints from a user-supplied sample question, explicitly labeled mock. No generated autobiographical answers or speech.
- Interviewer tab/system capture or selected audio input, optional separate self microphone, independent meters. PCM is mono 16 kHz, 100 ms / 3200 byte chunks. Screen video is never read, rendered or sent.
- Audio test validates/discards PCM on the local server; it does **not** recognize speech. Browser permissions are requested only after a manual start. The browser may not offer system/application audio on a given OS.
- Forty-minute absolute session deadline, 15-second heartbeat, 60-second idle expiry, bounded audio queue, eight-second fetch timeout, and manual reconnect retaining the deadline/last acknowledged sequence. On network failure capture stops; no offline audio backlog is kept. Missing audio is not reconstructed.
- At most 80 sample hints per session and one hint per 2.5 seconds. These are operational limits, not monetary caps.
- No audio/text database writes, localStorage, download, or transcript logs. Only ephemeral session metadata lives on the server. The browser retains at most six sample questions until stop/unmount. Typed question draft is cleared on stop.

The process-local mock is intentionally enabled only with **both** `NODE_ENV=development` and `INTERVIEW_LOCAL_MOCK=1`. Production APIs return 503. The map is not a distributed session store; deployment is not supported at this stage. Restart/HMR can invalidate sessions. Old inactive metadata is removed on the next request; it contains no audio or transcript.

## Local setup

Use an isolated checkout, install locked dependencies (`pnpm install --frozen-lockfile`), and use the existing local Cloudflare preview binding, never `--remote`.

1. Create an ignored `.env.local` with a fresh local SESSION_SECRET (32+ characters), a syntactically valid dummy DATABASE_URL (the app uses D1), `NEXT_DEV_WRANGLER_ENV=preview`, and `INTERVIEW_LOCAL_MOCK=1`.
2. `pnpm exec wrangler d1 execute skill-compass-preview --env preview --local --file drizzle-d1/0000_adorable_prism.sql`
3. Run `node scripts/interview/create-local-fixtures.mjs`, then `pnpm exec wrangler d1 execute skill-compass-preview --env preview --local --file .private/interview/seed.sql`. These create disposable admin/free, normal/free and normal/pro users. The random local-only password is in ignored `.private/interview/credentials.json`; admin email is `preview_admin@skill-compass.invalid`. Do not use production database exports or credentials.
4. `NEXT_DEV_WRANGLER_ENV=preview pnpm exec next dev --webpack --hostname 127.0.0.1 --port 4320`
5. Visit `http://127.0.0.1:4320/login?next=/admin/interview`, log in with the local admin fixture, start, and send a sample question. Audio test needs Chrome/OS permission.

Validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`. `tests/unit/interview.test.ts` exercises each operation for anonymous, normal/free, normal/pro, admin-without-required-entitlement, and role revocation, plus origin/body limits, PCM validation, owner isolation, reconnect and accelerated 40-minute expiry. Browser verification additionally uses real session cookies and local D1: `node scripts/interview/verify-local.mjs` (Chrome installed at the macOS default path). It creates screenshots under ignored `test-results/`.

## Cloud connection boundary / proposal only

The current host is Next.js/OpenNext on Cloudflare Workers, with D1. Google's STT streaming is gRPC-only; Workers lists `node:http2` as a nonfunctional stub. Therefore the existing standalone Node Google STT adapter cannot simply be bundled into the Worker.

Proposed route: authenticated SkillCompass page → same-origin admin gateway → dedicated Node WebSocket/gRPC relay → Google STT and Vertex REST. A Cloud Run container is a candidate, not provisioned or approved. Keep Google credentials in the relay's service identity, not a browser or shared Owner credential. Relay access must use short-lived, audience-bound, one-session tickets issued after fresh admin verification; validate ticket ownership on reconnect, and recheck admin authorization during active use with fail-closed expiry. A browser role flag or a hidden page is insufficient. Choose a trusted gateway/relay authentication mechanism before implementing external connections.

Preserve the standalone adapter's four-minute STT rollover and half-close drain. Google's streaming limit is five minutes, not forty. The existing standalone rotation tests remain available separately; this mock integration does not claim to exercise gRPC rollover. Relay lifetime/deadline must survive transport reconnects, with quotas/revocation coordinated across instances. Do not keep transcripts in a shared persistence store just to reconnect. An interrupted process can end the session explicitly, requiring manual restart, instead of claiming lossless recovery.

Cloud Run supports WebSockets with configurable request timeouts up to 60 minutes, but reconnect can reach another instance and open connections incur compute billing. A 40-minute wall-clock and real OS capture test remain required, including seam accuracy, disconnects, token expiry, sleep and tab closure. The local mock HTTP-per-chunk transport is a test seam only, not a production audio transport.

Minimum follow-up approvals/configuration: enable Speech/Vertex services in the user-chosen project; establish a dedicated least-privilege runtime identity (Speech recognition and Vertex prediction); if selecting Cloud Run, approve its API/build/artifact/hosting resources and service-to-service permissions; choose processing regions/model and budget. No API enablement, IAM change, credential creation, paid inference, new cloud service or deployment has occurred in this task. STT usage, Vertex tokens, relay compute/network and Cloudflare gateway usage are separate cost components; monetary totals and credit application are not measured. Confirm a quote after region/runtime sizing, before provisioning.

Official references checked 2026-10-08:
- https://cloud.google.com/speech-to-text/v2/docs/streaming-recognize
- https://cloud.google.com/speech-to-text/v2/quotas
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/#non-functional-stub-modules
- https://cloud.google.com/run/docs/triggering/websockets

## Verification record (2026-10-08)

- `vitest run`: 98 files, 493 tests passed (including 33 interview tests).
- Whole-repository ESLint and TypeScript no-emit checks passed.
- Local Chrome + local D1: anonymous 401; normal/free and normal/pro 403 for all six API operations; admin/free can render/start/use the mock. Client role spoof fields do not grant access.
- Browser: three sample hints, clearing on stop, fake-device PCM accepted, meters, all acquired audio tracks end on stop, desktop/mobile screenshots.
- Unit timing simulation: 40-minute deadline survives heartbeat/reconnect, cannot be extended, and expires at the boundary; idle expiry and stop invalidate the session. Late hint results, repeated clicks and failed-start reconnect are covered.
- No paid calls or deployment. Real system capture, actual cloud model accuracy/latency, real-time 40-minute endurance, distributed relay/rollover, token expiry and production Cloudflare build remain unverified.
