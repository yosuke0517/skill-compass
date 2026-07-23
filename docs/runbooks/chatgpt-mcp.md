# ChatGPT MCP Runbook

## Purpose

Run the Skill Compass production server on `localhost:3001`, publish it through the existing Cloudflare Tunnel at `agent.finegate.xyz`, connect ChatGPT through OAuth, and verify the five MCP tools without exposing MySQL or local ports directly.

## Prerequisites

- MySQL is running and `DATABASE_URL` points to the Skill Compass database.
- `.env.local` contains the existing application secrets plus:

```dotenv
MCP_ISSUER_URL=https://agent.finegate.xyz
MCP_RESOURCE_URL=https://agent.finegate.xyz/mcp
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

An unauthenticated MCP request must return `401`:

```bash
curl --include --request POST \
  --header 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
  http://localhost:3001/mcp
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
```

Do not continue if the external metadata has the wrong issuer/resource or if `/mcp` does not return `401` without a bearer token.

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

## Functional verification

In ChatGPT:

```text
skill-compassのTodayやりたい
```

Answer one question with a choice, confidence, and reasoning. Open the Skill Compass Today page and confirm that the same question is answered with matching feedback.

Then ask ChatGPT to list recent Podcast episodes and ask one grounded question. Confirm the exchange appears in the episode chat.

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
