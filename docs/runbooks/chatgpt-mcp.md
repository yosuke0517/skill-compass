# ChatGPT MCP Runbook

## Purpose

Run the Skill Compass production server on `localhost:3001`, publish it through the existing Cloudflare Tunnel at `agent.finegate.xyz`, and connect two OAuth-protected ChatGPT MCP apps:

- The learning MCP exposes seven Today, Podcast, and read-only X tools backed by shared domain services.
- The Architecture MCP exposes three read-only technical-interview tools backed only by a reviewed public-safe manifest.

Neither resource exposes MySQL or local ports directly.

## Prerequisites

- MySQL is running and `DATABASE_URL` points to the Skill Compass database.
- `.env.local` contains the existing application secrets plus:

```dotenv
MCP_ISSUER_URL=https://agent.finegate.xyz
MCP_RESOURCE_URL=https://agent.finegate.xyz/mcp
MCP_ARCHITECTURE_RESOURCE_URL=https://agent.finegate.xyz/mcp/architecture
MCP_ACCESS_TOKEN_TTL_SECONDS=3600
MCP_REFRESH_TOKEN_TTL_SECONDS=15552000
MCP_ALLOWED_USER_ID=the-existing-skill-compass-user-id
X_DAILY_POST_READ_BUDGET=30
X_PUBLIC_POST_CACHE_TTL_SECONDS=86400
```

- `/Users/yosukemini/.cloudflared/config.yml` maps `agent.finegate.xyz` to `http://localhost:3001`.
- The configured Skill Compass account is active and has the required Podcast Pro entitlements.
- X OAuth is connected with `tweet.read users.read bookmark.read offline.access`.
  No X write scope is used. The X client secret remains in macOS Keychain.

Do not place OAuth codes, MCP access tokens, database credentials, Gemini keys, or Cloudflare credentials in this repository or in command history.

## Build, back up, migrate, and seed

```bash
cd /Users/yosukemini/work/skill-compass
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm install --frozen-lockfile
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm build
```

Before running the migrator in production, create and verify a restorable
database backup using the database provider's approved procedure. This backup
is mandatory before `0012_mcp_oauth.sql`, `0013_mcp_refresh_tokens.sql`,
`0014_x_post_cache.sql`, `0015_x_daily_tech_digest_cache.sql`, and
`0016_practical_user_scoped_today.sql`. Do not continue when the backup is
missing or its restore check fails.

After the verified backup:

```bash
cd /Users/yosukemini/work/skill-compass
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm db:migrate
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm db:seed
mkdir -p /Users/yosukemini/Library/Logs/skill-compass
```

The seed step is idempotent. It publishes the reviewed 70-question bank,
learner-safe Concept synopses, and per-subtopic authoritative references
without resetting user answers, scores, self-assessments, or history.

## Verify the origin manually

Start the production server:

```bash
cd /Users/yosukemini/work/skill-compass
/Users/yosukemini/.asdf/shims/npm run start -- --port 3001
```

In another terminal:

```bash
curl --fail --silent --show-error \
  http://localhost:3001/.well-known/oauth-protected-resource/mcp
```

Expected: JSON whose `resource` is `https://agent.finegate.xyz/mcp`.

Verify the Architecture metadata:

```bash
curl --fail --silent --show-error \
  http://localhost:3001/.well-known/oauth-protected-resource/mcp/architecture
```

Expected: JSON whose `resource` is `https://agent.finegate.xyz/mcp/architecture`.

An unauthenticated MCP request must return `401`:

```bash
curl --include --request POST \
  --header 'x-forwarded-host: agent.finegate.xyz' \
  --header 'x-forwarded-proto: https' \
  --header 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
  http://localhost:3001/mcp
```

The same check for the Architecture MCP must also return `401`:

```bash
curl --include --request POST \
  --header 'x-forwarded-host: agent.finegate.xyz' \
  --header 'x-forwarded-proto: https' \
  --header 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
  http://localhost:3001/mcp/architecture
```

## Start the existing Cloudflare Tunnel

```bash
/opt/homebrew/bin/cloudflared tunnel \
  --config /Users/yosukemini/.cloudflared/config.yml run
```

Verify externally:

```bash
curl --fail --silent --show-error \
  https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp
curl --fail --silent --show-error \
  https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp/architecture
```

Do not continue if either external metadata document has the wrong issuer/resource or if either MCP endpoint does not return `401` without a bearer token.

## Install launchd jobs

Review the example files before copying them:

```bash
plutil -lint ops/launchd/xyz.finegate.skill-compass-web.plist.example
plutil -lint ops/launchd/xyz.finegate.skill-compass-tunnel.plist.example
```

Copy them to `~/Library/LaunchAgents` without the `.example` suffix, then load them:

```bash
launchctl bootstrap gui/$(id -u) \
  /Users/yosukemini/Library/LaunchAgents/xyz.finegate.skill-compass-web.plist
launchctl bootstrap gui/$(id -u) \
  /Users/yosukemini/Library/LaunchAgents/xyz.finegate.skill-compass-tunnel.plist
```

Inspect:

```bash
launchctl print gui/$(id -u)/xyz.finegate.skill-compass-web
launchctl print gui/$(id -u)/xyz.finegate.skill-compass-tunnel
```

## Connect ChatGPT

1. Add `https://agent.finegate.xyz/mcp` as the remote Skill Compass MCP app/server.
2. ChatGPT discovers the OAuth metadata and dynamically registers its callback.
3. Log in to the permitted Skill Compass account.
4. Review the requested Today, Podcast, public X Post, and
   personalized-trend-guided public-search access and select **Connect**.
5. Confirm ChatGPT lists exactly:
   - `get_today`
   - `submit_today_answer`
   - `list_podcast_episodes`
   - `get_podcast_episode`
   - `ask_about_podcast`
   - `get_x_post`
   - `get_daily_tech_posts`

Add a second custom app named **Skill Compass Architecture**:

1. Add `https://agent.finegate.xyz/mcp/architecture` as its MCP URL.
2. Complete the same Skill Compass OAuth login and authorization.
3. Confirm ChatGPT lists exactly:
   - `get_architecture_overview`
   - `explain_security_and_privacy`
   - `answer_technical_interview_question`

Do not paste a database password, local environment value, provider credential, or MCP bearer token into either custom app. The custom app uses the OAuth connection.

## Token lifetime and mobile reconnection

New connections receive a one-hour access token and a rotating refresh token.
The refresh-token family has an absolute 180-day lifetime measured from the
original authorization. Each successful refresh replaces the refresh token but
does not extend that deadline. ChatGPT refreshes server-to-server without a
Skill Compass browser session.

Learning and Architecture are separate OAuth connections. Existing legacy
30-day access tokens remain valid until their recorded expiration, but they do
not receive refresh tokens. Reconnect each app once after deploying
`0013_mcp_refresh_tokens.sql` to move both connections to the new policy.

Manual reconnection is required after 180 days, after manual revocation, or if
refresh-token replay protection revokes a connection family. Mobile
reconnection works while `agent.finegate.xyz` is reachable. With the current
deployment, the Mac must be awake and both the Next.js production service and
Cloudflare Tunnel launchd job must be running.

If a consumed refresh token is presented again, Skill Compass returns
`invalid_grant` and revokes all access and refresh tokens in that family. The
response intentionally does not reveal whether a token was expired, replayed,
revoked, mismatched, or unknown.

The separate X provider token is refreshed by Skill Compass when expired or
within five minutes of expiry. Refreshes for the same user are serialized so a
rotating X refresh token is not used concurrently. The confidential-client
refresh request authenticates with HTTP Basic and does not duplicate
`client_id` in its form body. X authorization requests only
`tweet.read users.read offline.access`.

A local launchd preflight runs at 06:35 Asia/Tokyo:

```bash
plutil -lint ops/launchd/xyz.finegate.skill-compass-x-preflight.plist.example
npm run x:preflight
```

The preflight uses the same on-demand token provider as the MCP tools. It does
not poll X or fetch Posts: it checks the stored expiry and refreshes only when
needed. The 06:45 ChatGPT task remains the first data API call. If X rejects
the refresh, the preflight exits nonzero and the X tools return
`x_reconnect_required`; reconnect X from Podcast settings. Provider token
values and response bodies are never returned through MCP or preflight logs.

## X Post privacy and cost boundary

`get_x_post` accepts only HTTPS Post URLs with an exact `x.com`,
`www.x.com`, `twitter.com`, or `www.twitter.com` host and an exact
`/{username}/status/{numericId}` path. It ignores share query parameters,
rejects credentials, custom ports, fragments, and extra path components, and
never fetches the supplied URL. Only fixed `https://api.x.com` API endpoints
are called.

Public Post snapshots may be cached for 24 hours without a Skill Compass user
ID. A daily result may be cached per user and Tokyo local date for 24 hours.
Selected technical trend names and selected public-search Posts may appear in
that daily cache. Discarded public-search candidates, request headers, and
provider tokens are not persisted. The current collector does not call a
personal-feed endpoint.

The daily collector uses allowlisted Personalized Trends to guide bounded
recent public searches, always includes a fixed technical fallback query, reads
at most 30 unique public-search candidates, and returns at most ten selected
Posts. The scheduled task requests five. The X Developer Console is
authoritative for current usage and pricing; review it if X changes endpoint
prices. At the design-time estimate, the 30-Post daily ceiling was
approximately USD 4.50 per 30-day month.

## Functional verification

In ChatGPT:

```text
skill-compassのTodayやりたい
```

Answer one question with a choice, confidence, and reasoning. Open the Skill Compass Today page and confirm that the same question is answered with matching feedback.

Then ask ChatGPT to list recent Podcast episodes and ask one grounded question. Confirm the exchange appears in the episode chat.

Test a public X Post:

```text
https://x.com/example/status/1234567890 これどういう意味？
```

Expected: ChatGPT calls `get_x_post`, answers in Japanese, links the original,
separates the Post's claims from its interpretation, and includes a quoted Post
or direct parent only when X makes it available.

Verify the daily X digest:

```text
今日の技術ニュースを日本語で
```

Expected: `get_daily_tech_posts` first attempts the authenticated account's
Personalized Trends. When X accepts that endpoint, the result reports
`trendSource: "personalized"` and lists only allowlisted technical trend names.
Representative Post searches use `sort_order=relevancy`.

If the account, application, or provider does not allow Personalized Trends,
the tool reports `trendSource: "fixed_topics"` and includes
`personalized_trends_unavailable` in `partialFailures`. It then performs one
bounded relevancy search joining AI, Web/backend/database,
cloud/observability, and security terms with explicit `OR`.

The total requested Post candidates must not exceed
`X_DAILY_POST_READ_BUDGET`. The result may contain fewer than five items when
the quality threshold is not met. A low-engagement concrete security advisory
may be retained and labeled, but it must not be described as a popular Post.
Neither provider error bodies nor X subscription details may appear in the MCP
response or logs.

Verify the Architecture app:

```text
Give me a brief overview of how Skill Compass is built.
```

Expected: English current architecture without a production hostname, absolute path, account identifier, or personal content.

```text
このMCPから秘匿情報や個人情報が抜かれにくいのはなぜ？限界も含めて説明して。
```

Expected: Japanese explanation covering the static-manifest answer boundary,
fixed tool schemas, allowlisted responses, database-backed HTTP authentication,
the answer tools' lack of learning-state, user-record, filesystem, storage, or
provider-query capabilities, and the residual risk of unsafe future manifest
or tool changes. It must not claim that disclosure is impossible.

```text
技術面接で「Skill CompassのMCP認証をどう設計したか」に2分で答えたい。
```

Expected: implemented OAuth/PKCE and user-authorization facts separated from audience-scoped tokens labeled as a planned improvement.

## Scheduled-task routing

Keep two independent tasks so an X outage cannot delay Today or Podcast:

- `skill-compass-daily-tech-on-x` runs daily at 06:45 Asia/Tokyo and calls only
  `get_daily_tech_posts` with `limit=5`. It writes five concise Japanese items,
  covers AI, Web/backend/cloud, and security, labels uncorroborated Posts as
  claims, does not guess when retrieval fails, and ends each item with its
  original X URL.
- The 07:00 Asia/Tokyo task calls `get_today` once and publishes a complete
  five-question lesson packet plus the bounded instructor data into its task
  conversation. It also inspects Podcast status with the learning MCP only.
  The packet lets ChatGPT Voice/Live teach from conversation context even
  though Voice/Live cannot call apps directly.

Add these instructions to the 07:00 task:

```text
Immediately prepare today's Skill Compass lesson packet in this task
conversation. Perform the work now; do not create, update, describe, or confirm
a scheduled task.

PREPARATION
1. Call get_today exactly once. Do not call it again during this preparation.
2. Call list_podcast_episodes exactly once and classify the latest episode as
   ready, queued, processing, failed, or absent.
3. Never call submit_today_answer during preparation.
4. If either read tool fails or returns incomplete data, state that fact. Do
   not infer missing lesson or Podcast data.
5. Publish one self-contained packet containing:
   - quiz date and progress;
   - all five LEARNER QUESTIONS in slot order, each with quizDayId, questionId,
     slot, scenario, artifacts, prompt, and choice IDs and labels;
   - an INSTRUCTOR DATA section with all five rows, each containing
     quizDayId, questionId, slot, correctChoiceId, decisionCriteria, rationale,
     every choice explanation and consequence, practicalNotes, checkQuestion,
     and existingAnswer; and
   - the latest Podcast status.
Preparation ends after publishing the packet. Do not answer a question and do
not persist any learner state.

VOICE/LIVE TEACHING
When the user opens Voice/Live in this same conversation and says
「Skill CompassのTodayやりたい」, use only the prepared packet and teach one
question at a time. Do not attempt to call an app during Voice/Live.

For each question:
1. Present its scenario, only the artifacts needed for the decision, its
   prompt, and choice IDs and labels.
2. Ask for the selected choice, confidence from 1 to 5, and reasoning.
3. Withhold correctness and all INSTRUCTOR DATA until the learner commits.
4. If the learner asks for help, give a bounded hint based only on a condition
   explicitly stated in the learner question's scenario, artifacts, or prompt.
   Never add a premise and never expose or paraphrase a hidden answer field.
5. If the reasoning is weak, ask why a plausible alternative is not suitable
   before revealing the answer.
6. After commitment, teach in this order:
   - correctness;
   - the decisive stated condition;
   - practical implementation or operational use;
   - the consequence of the learner's chosen wrong option, when applicable;
   - why the relevant alternatives are unsuitable; and
   - the stored understanding check.
If an instructor row is incomplete, name the incomplete item and move on.
Never invent a constraint or reinterpret the reviewed answer.

SYNC PACK
At the end of Voice/Live, output a SYNC PACK containing one item per completed
question with exactly:
- quizDayId
- questionId
- selectedChoiceId
- confidence
- reasoning

Do not include partial items. Producing the SYNC PACK does not submit it.

NORMAL-CHAT SYNC
After Voice/Live ends, when the user sends
「今日の回答をSkill Compassに同期して」 as normal text, call
submit_today_answer once for each complete SYNC PACK item. Do not submit an
item whose choice, confidence, or reasoning is missing.

When the user asks how Skill Compass was built, or asks about its architecture,
security, privacy, technical tradeoffs, or MCP data boundaries, use the Skill
Compass Architecture app. Separate current implementation facts from planned
improvements.
```

Run the task manually once after editing it:

- The automatic run calls only `get_today` and `list_podcast_episodes`.
- Its visible response contains five questions and five instructor-data rows.
- It does not call `submit_today_answer`.
- Open Voice/Live in the generated task conversation and confirm that
  「Skill CompassのTodayやりたい」 starts with question one without attempting
  an app call.
- Exit Voice/Live and send the sync phrase as normal text before verifying
  persisted answers.
- A follow-up technical question in the same task conversation can call the Architecture app.
- Japanese follow-ups receive Japanese answers.

## Architecture manifest review

The Architecture MCP answer tools have no general repository retrieval and can
return only the checked-in public-safe manifest through fixed response shapes.
The HTTP layer is a separate boundary that authenticates bearer tokens and
checks the current user through persistent auth/application records before any
answer tool runs.

Whenever that manifest changes:

1. Review every claim status against the current implementation.
2. Run `tests/unit/mcp-architecture-manifest.test.ts`.
3. Confirm there are no emails, production URLs, absolute paths, credential markers, environment assignments, or user content.
4. Run the complete typecheck, lint, test, and build suite.

These controls reduce disclosure risk through capability isolation and review. They do not prove that disclosure is impossible: a reviewer could approve unsafe text, or a future change could add an unsafe capability.

## Token smoke test

For local diagnostics only, place a temporary access token in the process environment without writing it to disk:

```bash
SKILL_COMPASS_MCP_TOKEN='redacted' \
  /Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm \
  mcp:smoke -- https://agent.finegate.xyz/mcp
```

The command prints the server name, tool names, and safe Today result. It never prints the token.

## Revoke and rollback

To revoke a refresh-capable connection, set `revoked_at` for every row sharing
its `family_id` in both `mcp_access_tokens` and `mcp_refresh_tokens`. Legacy
tokens have a null family ID and can still be revoked by their token hash.
Never search logs for or store a raw token.

For emergency rollback, stop the public tunnel first:

```bash
launchctl bootout \
  gui/$(id -u)/xyz.finegate.skill-compass-tunnel
```

Then stop the web origin:

```bash
launchctl bootout \
  gui/$(id -u)/xyz.finegate.skill-compass-web
```

The database and R2 objects remain intact.
