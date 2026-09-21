# Today Push Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** User-controlled daily Today web push reminders.
**Architecture:** PWA client -> authenticated notification API -> D1; scheduled Cloudflare handler -> encrypted Web Push -> service worker -> /today.
**Tech Stack:** Next.js, React, Cloudflare Worker/D1, Web Crypto Web Push.
**Spec:** docs/superpowers/specs/2026-09-21-today-push-design.md

## Global Constraints
Default off; Japan time; per-device; no LLM; preserve existing user data; separate staging/production keys; no secret logging; same-origin and owner checks; no offline caching.

## Task 1: Client PWA and settings
Files: src/components/notifications/notification-settings.tsx, src/app/(app)/settings/page.tsx, src/app/manifest.ts, src/app/layout.tsx, public/sw.js, public/icons/*, tests/unit/notification-settings.test.tsx and pwa tests.
API contract: GET /api/notifications returns {configured:boolean,publicKey:string|null}. POST accepts {action:'status'|'save'|'disable'|'test',endpoint?:string,subscription?:{endpoint,keys:{p256dh,auth}},time?:'HH:mm'}. Status/save response {enabled:boolean,time:string,lastError:string|null}; absent status defaults false/09:00. Other success {ok:true}; errors {error:string} with non-2xx. Save enables; disable keeps browser subscription but disables server record. UI handles failed resubscriptions and account ownership conflict safely.
- [x] Add failing UI tests for default off, denied/unsupported guidance, save/time and test flows.
- [x] Implement settings controls, permission only on explicit click, register SW before enable, no permission on mount.
- [x] Add installable manifest and icons, push handler visible notification, click only fixed /today and focus/navigate matching client.
- [x] Run UI and service-worker tests and review diff.

## Task 2: Backend and scheduled delivery
Files: src/lib/notifications/{validation,schedule,repository,sender,dispatch}.ts, src/app/api/notifications/route.ts, src/db/schema.ts, drizzle-d1/0001_today_notifications.sql, custom-worker.ts.
- [x] Add failing tests for safe endpoint validation, JST schedule, concurrent atomic claims, ownership, completion skipping, disable on 410, transient failure handling.
- [x] Implement storage migration and parameterized repository using explicit D1 binding, no Next runtime inside scheduled handler.
- [x] Implement encrypted sender with @block65/webcrypto-web-push and timeout/no redirects.
- [x] Implement authenticated same-origin API matching Task 1; test rate limit and fixed payload.
- [x] Implement due processing and scheduled entrypoint reusing generated OpenNext fetch handler.
- [x] Run targeted backend tests.

## Task 3: Deployment and verification
Files: wrangler.jsonc, scripts/cloudflare/render-deploy-config.ts (only if needed), .github/workflows/deploy-staging.yml and deploy-production.yml, docs/guides/today-notifications.md.
- [x] Configure every-minute triggers and VAPID environment inputs; apply only additive notification SQL idempotently before deployment (do not replay initial schema).
- [x] Add migration/build/config tests and operator instructions for keys and real-device verification.
- [x] Run full tests, typecheck, lint, OpenNext build and Wrangler dry run.
- [ ] Create feature PR and verify staging deployment; final report distinguishes automated verification from real-device push permission/delivery.

## Review rulings

- Follow the approved design without another permission round; implementation and a reviewable PR are authorized.
- Stale prior-day jobs advance without claiming the current day. Use actual execution time, not the cron scheduled timestamp.
- Treat an expired endpoint as off; unsubscribe before browser re-registration.
- One atomic GitHub VAPID_CONFIG secret avoids partial key provisioning. Staging keys provisioned; production provisioning remains a rollout step.
- Automated tests cover browser API behavior and actual service-worker handlers; real iPhone delivery remains a device check.
