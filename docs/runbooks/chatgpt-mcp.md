# ChatGPT MCP Runbook

## Purpose

Run the Skill Compass production server on `localhost:3001`, publish it through the existing Cloudflare Tunnel at `agent.finegate.xyz`, and connect two OAuth-protected ChatGPT MCP apps:

- The learning MCP exposes five Today and Podcast tools backed by shared domain services.
- The Architecture MCP exposes three read-only technical-interview tools backed only by a reviewed public-safe manifest.

Neither resource exposes MySQL or local ports directly.

## Prerequisites

- MySQL is running and `DATABASE_URL` points to the Skill Compass database.
- `.env.local` contains the existing application secrets plus:

```dotenv
MCP_ISSUER_URL=https://agent.finegate.xyz
MCP_RESOURCE_URL=https://agent.finegate.xyz/mcp
MCP_ARCHITECTURE_RESOURCE_URL=https://agent.finegate.xyz/mcp/architecture
MCP_ACCESS_TOKEN_TTL_SECONDS=2592000
MCP_ALLOWED_USER_ID=the-existing-skill-compass-user-id
```

- `/Users/yosukemini/.cloudflared/config.yml` maps `agent.finegate.xyz` to `http://localhost:3001`.
- The configured Skill Compass account is active and has the required Podcast Pro entitlements.

Do not place OAuth codes, MCP access tokens, database credentials, Gemini keys, or Cloudflare credentials in this repository or in command history.

## Build and migrate

```bash
cd /Users/yosukemini/work/skill-compass
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm install --frozen-lockfile
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm build
/Users/yosukemini/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm db:migrate
mkdir -p /Users/yosukemini/Library/Logs/skill-compass
```

Back up the database before applying `0012_mcp_oauth.sql` in production.

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
  --header 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
  http://localhost:3001/mcp
```

The same check for the Architecture MCP must also return `401`:

```bash
curl --include --request POST \
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
4. Review the requested Today and Podcast access and select **Connect**.
5. Confirm ChatGPT lists exactly:
   - `get_today`
   - `submit_today_answer`
   - `list_podcast_episodes`
   - `get_podcast_episode`
   - `ask_about_podcast`

Add a second custom app named **Skill Compass Architecture**:

1. Add `https://agent.finegate.xyz/mcp/architecture` as its MCP URL.
2. Complete the same Skill Compass OAuth login and authorization.
3. Confirm ChatGPT lists exactly:
   - `get_architecture_overview`
   - `explain_security_and_privacy`
   - `answer_technical_interview_question`

Do not paste a database password, local environment value, provider credential, or MCP bearer token into either custom app. The custom app uses the OAuth connection.

## Functional verification

In ChatGPT:

```text
skill-compassのTodayやりたい
```

Answer one question with a choice, confidence, and reasoning. Open the Skill Compass Today page and confirm that the same question is answered with matching feedback.

Then ask ChatGPT to list recent Podcast episodes and ask one grounded question. Confirm the exchange appears in the episode chat.

Verify the Architecture app:

```text
Give me a brief overview of how Skill Compass is built.
```

Expected: English current architecture without a production hostname, absolute path, account identifier, or personal content.

```text
このMCPから秘匿情報や個人情報が抜かれにくいのはなぜ？限界も含めて説明して。
```

Expected: Japanese explanation covering the static-manifest boundary, fixed tool schemas, allowlisted responses, authentication, absence of filesystem/database capabilities, and the residual risk of unsafe future manifest or tool changes. It must not claim that disclosure is impossible.

```text
技術面接で「Skill CompassのMCP認証をどう設計したか」に2分で答えたい。
```

Expected: implemented OAuth/PKCE and user-authorization facts separated from audience-scoped tokens labeled as a planned improvement.

## Scheduled-task routing

The 07:00 Asia/Tokyo task continues to prepare Today and inspect Podcast status with the learning MCP only. Add these instructions to the task:

```text
When the user asks how Skill Compass was built, or asks about its architecture,
security, privacy, technical tradeoffs, or MCP data boundaries, use the Skill
Compass Architecture app. Separate current implementation facts from planned
improvements. Do not call Architecture tools during the automatic 07:00 Today
and Podcast preparation.
```

Run the task manually once after editing it:

- The automatic run calls only `get_today` and `list_podcast_episodes`.
- A follow-up technical question in the same task conversation can call the Architecture app.
- Japanese follow-ups receive Japanese answers.

## Architecture manifest review

The Architecture MCP has no general repository retrieval. It can return only the checked-in public-safe manifest through fixed response shapes.

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

To revoke a connection, set `revoked_at` for its hashed row in `mcp_access_tokens`. Never search logs for or store the raw token.

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
