# Today notifications

Settings → Today reminder controls this browser's daily reminder. Choose a time in Japan time and enable notifications. Notification permission is requested only by that button. An iPhone/iPad must open Skill Compass from its Home Screen. Notifications open `/today`; the existing login flow retains the destination if the session expired.

Daily notifications are skipped when all active assigned Today questions are graded (correct or incorrect). No quiz is created by the scheduler. Default is off. Each device/browser opts in independently. Times are saved per device; delivery can be delayed by the device or network.

## Deployment

The existing OpenNext Worker now also handles a `* * * * *` scheduled event. Wrangler owns this schedule. Each environment uses its own persistent VAPID key pair. No X token, LLM, or external notification SaaS is used.

Run `pnpm exec tsx scripts/cloudflare/provision-push-keys.ts staging` (or `production`) once with authorized GitHub access. The script generates a P-256 key pair and writes one encrypted GitHub environment secret, `VAPID_CONFIG`, containing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. It does not print or save key values locally, and refuses to replace an existing configuration. Each environment has its own pair. Do not regenerate on every deploy: browser subscriptions depend on the public key. These are application-generated signing keys, not expiring Cloudflare or X API credentials.

The deployment workflow uploads keys using Wrangler secret bulk without displaying them. Missing keys leave notification setup unavailable and scheduled delivery inactive. An absent GitHub secret does not overwrite existing Worker keys. Removing GitHub secrets alone does not revoke an already provisioned Worker key; use the normal Worker secret removal process if decommissioning. Existing SESSION_SECRET and OAuth keys are unchanged.

The workflow executes only `drizzle-d1/0001_today_notifications.sql` before deploying new code. This migration is additive and repeat-safe. It does not replay the original schema or modify existing quizzes. Do not run all D1 migrations against the existing production database without reconciling its migration history.

## Delivery semantics and operations

A single D1 conditional update claims a device/date before sending. The tradeoff is at-most-one send attempt per day, not guaranteed delivery: an ambiguous network failure or crash after the claim is not retried that day. The next day's reminder remains scheduled. Push TTL is 15 minutes; stale invocations are advanced without delivering an old-day backlog. Provider responses 404/410 disable the endpoint. Other failures show a safe error code in settings. Tests are rate-limited to one per minute per enabled device.

The service worker never caches authenticated pages. It displays notifications and opens a fixed same-origin `/today` URL. Provider endpoints are limited to known Apple, Google, Mozilla and Microsoft HTTPS push hosts; requests cannot follow redirects. Storage reads and writes are scoped to the signed-in active user, and POST requests require the same Origin. Endpoint/key values are never logged. A reused subscription belonging to another account must be removed in the browser before registering that account; there is no silent transfer.

Check Worker logs for `today_notifications` counts, including failures. A success count means the push provider accepted a message, not proof of phone delivery. Users can disable notifications in app settings or browser/OS settings. If browser permission was revoked, delivery may not fail immediately.

## Verification before rollout

1. Run unit tests, typecheck, lint, OpenNext build, and Wrangler dry-run.
2. Deploy to staging with its keys; log in on a real browser, enable explicitly, set a future time, and send a test.
3. Close the app; verify scheduled delivery, click to Today, and login return if expired.
4. Complete Today and verify its scheduled reminder is skipped.
5. Turn off reminders and verify no later notification is sent.
6. On iPhone verify Home Screen installation and notification permission. Desktop automated tests alone do not prove iOS delivery.
