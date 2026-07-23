# Skill Compass ChatGPT MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Skill Compass Today and Podcast workflows as authenticated MCP tools so ChatGPT can read and update the same learning state, then make the connection available through `agent.finegate.xyz` and run a daily 07:00 Asia/Tokyo scheduled check.

**Architecture:** Extract user-scoped Today and Podcast application services from the current web routes, then register five stateless Streamable HTTP MCP tools over those services. Protect `/mcp` with a small OAuth 2.1 authorization-code/PKCE implementation backed by MySQL and the existing Skill Compass login session; publish only the Next.js origin through the existing Cloudflare Tunnel.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, MySQL, Drizzle ORM, Vitest, Playwright, `@modelcontextprotocol/sdk` v1, Zod 4, JOSE, Cloudflare Tunnel

## Global Constraints

- MCP endpoint: `https://agent.finegate.xyz/mcp`.
- MCP transport: stateless Streamable HTTP; do not add legacy SSE.
- Tools: `get_today`, `submit_today_answer`, `list_podcast_episodes`, `get_podcast_episode`, `ask_about_podcast`.
- Never return correct-answer flags, rationale, or hidden feedback for unanswered Today questions.
- Never accept an arbitrary user ID in a tool input.
- The first release authorizes only `MCP_ALLOWED_USER_ID`, matching the current singleton Today storage model.
- Japanese user input produces Japanese output; otherwise output defaults to English.
- Podcast tools enforce ownership and the existing Pro entitlements.
- Reuse the existing quiz evaluation, Podcast chat, Gemini, MySQL, and R2 behavior.
- Do not migrate MySQL, Podcast workers, Keychain secrets, or R2.
- The scheduled task prepares and reports state; it never submits a quiz answer.
- Preserve the user-owned `next-env.d.ts` working-tree change.

## File Structure

### Create

- `src/lib/language/detect-response-language.ts` — deterministic Japanese/English response-language selection.
- `src/lib/quiz/today-service.ts` — user-facing Today read and submit boundary shared by web and MCP.
- `src/lib/podcast/podcast-service.ts` — ownership-checked Podcast list/read/ask boundary shared by web and MCP.
- `src/lib/mcp/auth/repository.ts` — OAuth client, authorization-code, and token persistence.
- `src/lib/mcp/auth/service.ts` — PKCE validation, token issuance, token hashing, and authenticated-user resolution.
- `src/lib/mcp/server.ts` — server factory and five tool registrations.
- `src/lib/mcp/http-handler.ts` — bearer authentication and Web Request/Response transport adapter.
- `src/app/mcp/route.ts` — public stateless MCP HTTP route.
- `src/app/.well-known/oauth-protected-resource/mcp/route.ts` — protected-resource metadata.
- `src/app/.well-known/oauth-authorization-server/route.ts` — authorization-server metadata.
- `src/app/oauth/register/route.ts` — dynamic client registration.
- `src/app/oauth/authorize/decision/route.ts` — authorization approval POST and redirect.
- `src/app/oauth/token/route.ts` — authorization-code exchange with PKCE.
- `src/app/oauth/authorize/page.tsx` — explicit Skill Compass connection approval UI.
- `src/lib/mcp/cli.ts` — local MCP smoke client for initialize/list/call verification.
- `tests/unit/response-language.test.ts`
- `tests/unit/today-service.test.ts`
- `tests/unit/podcast-service.test.ts`
- `tests/unit/mcp-auth.test.ts`
- `tests/unit/mcp-tools.test.ts`
- `tests/integration/mcp-route.test.ts`
- `tests/e2e/mcp-oauth.spec.ts`
- `drizzle/0012_mcp_oauth.sql`
- `docs/runbooks/chatgpt-mcp.md`
- `ops/launchd/xyz.finegate.skill-compass-web.plist.example`
- `ops/launchd/xyz.finegate.skill-compass-tunnel.plist.example`

### Modify

- `package.json` and `pnpm-lock.yaml` — MCP SDK dependency and smoke command.
- `.env.example` — MCP issuer/audience, token TTL, and Cloudflare tunnel configuration.
- `src/db/schema.ts` — OAuth clients, codes, and access-token tables.
- `src/app/api/assistant/today/route.ts` — call the shared Today service without changing its HTTP contract.
- `src/app/api/podcast/episodes/[episodeId]/chat/route.ts` — call the shared Podcast service without changing its HTTP contract.
- `src/proxy.ts` — keep MCP and OAuth discovery/token routes public while authorization approval still requires login.
- `docs/superpowers/progress/skill-compass-mvp.md` — record verified MCP integration and deployment state.

---

### Task 1: Response Language and Shared Today Service

**Files:**
- Create: `src/lib/language/detect-response-language.ts`
- Create: `src/lib/quiz/today-service.ts`
- Create: `tests/unit/response-language.test.ts`
- Create: `tests/unit/today-service.test.ts`
- Modify: `src/app/api/assistant/today/route.ts`

**Interfaces:**
- Produces: `detectResponseLanguage(text: string): "ja" | "en"`.
- Produces: `getTodayForUser(input: { userId: string; today?: string }): Promise<McpTodayResult>`.
- Produces: `submitTodayForUser(input: SubmitTodayForUserInput): Promise<SubmitTodayForUserResult>`.
- Consumes: existing `getTodayQuiz()` and `submitTodayAnswer()`.

- [ ] **Step 1: Write failing language tests**

```ts
import { describe, expect, it } from "vitest";
import { detectResponseLanguage } from "@/lib/language/detect-response-language";

describe("detectResponseLanguage", () => {
  it("uses Japanese when the latest message contains Japanese script", () => {
    expect(detectResponseLanguage("skill-compassのTodayやりたい")).toBe("ja");
  });

  it("defaults to English", () => {
    expect(detectResponseLanguage("Start today's quiz")).toBe("en");
    expect(detectResponseLanguage("123")).toBe("en");
  });
});
```

- [ ] **Step 2: Run the language tests and verify failure**

Run: `pnpm vitest run tests/unit/response-language.test.ts`

Expected: FAIL because `detect-response-language.ts` does not exist.

- [ ] **Step 3: Implement deterministic language selection**

```ts
const japaneseScript = /[\u3040-\u30ff\u3400-\u9fff]/u;

export function detectResponseLanguage(text: string): "ja" | "en" {
  return japaneseScript.test(text) ? "ja" : "en";
}
```

- [ ] **Step 4: Write failing Today service tests**

Use injected repositories so tests prove that hidden answer metadata is removed and submission delegates to the existing evaluator:

```ts
it("returns only the next unanswered question without correctness metadata", async () => {
  const result = await getTodayForUser(
    { userId: "user_1", today: "2026-07-24" },
    { getQuiz: async () => quizWithOneAnsweredAndOneUnanswered },
  );

  expect(result.nextQuestion).toEqual({
    quizDayId: "quiz_2026-07-24",
    questionId: "q2",
    slot: 2,
    prompt: "Choose the correct index.",
    choices: [{ id: "b", label: "Composite index" }],
  });
  expect(JSON.stringify(result)).not.toContain('"correct"');
  expect(JSON.stringify(result)).not.toContain("rationale");
});
```

- [ ] **Step 5: Implement the shared Today boundary**

Define explicit public result types and map only safe fields:

```ts
export type McpTodayResult = {
  quizDate: string;
  progress: { answered: number; total: number };
  complete: boolean;
  nextQuestion: {
    quizDayId: string;
    questionId: string;
    slot: number;
    prompt: string;
    choices: Array<{ id: string; label: string }>;
  } | null;
};
```

`getTodayForUser` and `submitTodayForUser` reject any `userId` other than `MCP_ALLOWED_USER_ID`, because Today storage is currently singleton rather than user-scoped. `submitTodayForUser` then validates that `questionId` and `selectedChoiceId` belong to the current quiz before calling `submitTodayAnswer`. MCP tools obtain this user from the bearer token and never accept a user ID from tool input.

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run tests/unit/response-language.test.ts tests/unit/today-service.test.ts tests/unit/today-assistant-route.test.ts tests/unit/get-today-quiz.test.ts tests/integration/submit-answer.test.ts`

Expected: PASS.

- [ ] **Step 7: Refactor the Today assistant route to use the shared read boundary**

Keep the existing request/response body unchanged. Replace direct quiz lookup with the shared service, and keep the existing active-question assistant context behavior.

- [ ] **Step 8: Re-run focused tests and commit**

Run: `pnpm vitest run tests/unit/response-language.test.ts tests/unit/today-service.test.ts tests/unit/today-assistant-route.test.ts`

Expected: PASS.

```bash
git add src/lib/language/detect-response-language.ts src/lib/quiz/today-service.ts src/app/api/assistant/today/route.ts tests/unit/response-language.test.ts tests/unit/today-service.test.ts
git commit -m "refactor: add shared Today service"
```

---

### Task 2: Shared Podcast Service

**Files:**
- Create: `src/lib/podcast/podcast-service.ts`
- Create: `tests/unit/podcast-service.test.ts`
- Modify: `src/app/api/podcast/episodes/[episodeId]/chat/route.ts`

**Interfaces:**
- Produces: `listPodcastEpisodesForUser(user: CurrentUserAccess, limit?: number)`.
- Produces: `getPodcastEpisodeForUser(user: CurrentUserAccess, episodeId: string)`.
- Produces: `askPodcastForUser(input: AskPodcastForUserInput, deps?: PodcastServiceDeps)`.
- Consumes: `getPodcastEpisodes`, `askPodcastChat`, `podcastChatMessages`, and entitlement IDs.

- [ ] **Step 1: Write failing ownership and entitlement tests**

```ts
it("does not return an episode owned by another user", async () => {
  await expect(
    getPodcastEpisodeForUser(proUser, "episode_other", {
      findEpisode: async () => null,
    }),
  ).rejects.toThrow("podcast_episode_not_found");
});

it("requires podcast.chat before asking a question", async () => {
  await expect(
    askPodcastForUser({ user: freeUser, episodeId: "episode_1", question: "Explain this" }),
  ).rejects.toThrow("podcast_chat_forbidden");
});
```

- [ ] **Step 2: Run the Podcast service tests and verify failure**

Run: `pnpm vitest run tests/unit/podcast-service.test.ts`

Expected: FAIL because `podcast-service.ts` does not exist.

- [ ] **Step 3: Implement bounded list/read results**

Return at most 20 owned episodes. `getPodcastEpisodeForUser` returns:

```ts
export type PodcastEpisodeDetail = {
  id: string;
  title: string;
  localDate: string;
  language: "ja" | "en";
  status: string;
  durationSeconds: number | null;
  transcript: Array<{ speaker: string; text: string }>;
  sources: Array<{ title: string; url: string }>;
};
```

Do not return storage keys, audio bytes, provider keys, user IDs, or job internals.

- [ ] **Step 4: Implement the shared ask operation**

Move the route’s key resolution, episode lookup, `askPodcastChat` call, message persistence, and optional voice generation behind `askPodcastForUser`. Persist the user and assistant messages only after a non-empty assistant answer is returned.

- [ ] **Step 5: Refactor the existing Podcast chat route**

Keep GET/POST payloads and status codes compatible. The route parses HTTP input, calls `requireCurrentUser`, delegates to `podcast-service.ts`, and maps normalized domain errors to 403/404/503.

- [ ] **Step 6: Run focused Podcast tests and commit**

Run: `pnpm vitest run tests/unit/podcast-service.test.ts tests/unit/podcast-pipeline.test.ts tests/e2e/podcast-chat.spec.ts`

Expected: unit tests PASS; the Playwright test PASS when its configured web server is available.

```bash
git add src/lib/podcast/podcast-service.ts 'src/app/api/podcast/episodes/[episodeId]/chat/route.ts' tests/unit/podcast-service.test.ts
git commit -m "refactor: add shared Podcast service"
```

---

### Task 3: Persisted OAuth 2.1 Authorization

**Files:**
- Create: `drizzle/0012_mcp_oauth.sql`
- Create: `src/lib/mcp/auth/repository.ts`
- Create: `src/lib/mcp/auth/service.ts`
- Create: `tests/unit/mcp-auth.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `registerOAuthClient(metadata): Promise<RegisteredClient>`.
- Produces: `createAuthorizationCode(input): Promise<string>`.
- Produces: `exchangeAuthorizationCode(input): Promise<{ accessToken: string; expiresIn: number }>`.
- Produces: `authenticateMcpBearer(header: string | null): Promise<CurrentUserAccess | null>`.
- Consumes: existing user/access resolver and `node:crypto`.

- [ ] **Step 1: Write the migration**

Create three tables with indexed hashes and expiry timestamps:

```sql
CREATE TABLE `mcp_oauth_clients` (
  `id` varchar(191) NOT NULL,
  `redirect_uris` json NOT NULL,
  `client_name` varchar(191) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE `mcp_authorization_codes` (
  `code_hash` char(64) NOT NULL,
  `client_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `redirect_uri` text NOT NULL,
  `code_challenge` varchar(191) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL,
  PRIMARY KEY (`code_hash`)
);

CREATE TABLE `mcp_access_tokens` (
  `token_hash` char(64) NOT NULL,
  `client_id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_hash`)
);
```

Add foreign keys to the existing users table where the current migration conventions permit them.

- [ ] **Step 2: Write failing PKCE and token tests**

Cover:

- S256 verifier success.
- Wrong verifier rejection.
- Expired code rejection.
- Single-use code rejection.
- Expired/revoked bearer rejection.
- A valid token resolving exactly its stored active user.
- Authorization and bearer resolution rejecting users other than `MCP_ALLOWED_USER_ID`.

```ts
expect(await exchangeAuthorizationCode(validExchange, repo)).toMatchObject({
  accessToken: expect.any(String),
  expiresIn: 2_592_000,
});
await expect(exchangeAuthorizationCode(validExchange, repo)).rejects.toThrow("authorization_code_used");
```

- [ ] **Step 3: Run the tests and verify failure**

Run: `pnpm vitest run tests/unit/mcp-auth.test.ts`

Expected: FAIL because the MCP auth modules do not exist.

- [ ] **Step 4: Implement hashing and PKCE**

Use SHA-256 for stored token/code hashes and PKCE S256 comparison:

```ts
export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
```

Generate authorization codes and access tokens with `randomBytes(32).toString("base64url")`. Codes expire after 10 minutes; access tokens default to 30 days through `MCP_ACCESS_TOKEN_TTL_SECONDS`.

- [ ] **Step 5: Implement Drizzle persistence and schema**

Use atomic conditional updates when consuming a code:

```ts
await db.update(mcpAuthorizationCodes)
  .set({ usedAt: now })
  .where(and(
    eq(mcpAuthorizationCodes.codeHash, hash),
    isNull(mcpAuthorizationCodes.usedAt),
    gt(mcpAuthorizationCodes.expiresAt, now),
  ));
```

Verify one row was affected before issuing a token.

- [ ] **Step 6: Add environment documentation**

```dotenv
MCP_ISSUER_URL=https://agent.finegate.xyz
MCP_RESOURCE_URL=https://agent.finegate.xyz/mcp
MCP_ACCESS_TOKEN_TTL_SECONDS=2592000
MCP_ALLOWED_USER_ID=replace-with-the-existing-skill-compass-user-id
```

- [ ] **Step 7: Run auth and schema tests and commit**

Run: `pnpm vitest run tests/unit/mcp-auth.test.ts tests/unit/schema-shape.test.ts`

Expected: PASS.

```bash
git add drizzle/0012_mcp_oauth.sql src/db/schema.ts src/lib/mcp/auth/repository.ts src/lib/mcp/auth/service.ts tests/unit/mcp-auth.test.ts .env.example
git commit -m "feat: add MCP OAuth persistence"
```

---

### Task 4: OAuth Discovery, Registration, Authorization, and Token Routes

**Files:**
- Create: `src/app/.well-known/oauth-protected-resource/mcp/route.ts`
- Create: `src/app/.well-known/oauth-authorization-server/route.ts`
- Create: `src/app/oauth/register/route.ts`
- Create: `src/app/oauth/authorize/page.tsx`
- Create: `src/app/oauth/authorize/decision/route.ts`
- Create: `src/app/oauth/token/route.ts`
- Create: `tests/e2e/mcp-oauth.spec.ts`
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: Task 3 OAuth service functions.
- Produces: RFC 9728 protected-resource metadata and RFC 8414 authorization-server metadata.
- Produces: dynamic client registration and authorization-code/PKCE flow used by ChatGPT.

- [ ] **Step 1: Write route-level OAuth tests**

Test exact metadata URLs and reject unsafe registration:

```ts
expect(await protectedResourceResponse.json()).toEqual({
  resource: "https://agent.finegate.xyz/mcp",
  authorization_servers: ["https://agent.finegate.xyz"],
  bearer_methods_supported: ["header"],
});
```

Registration accepts only HTTPS redirect URIs, except loopback HTTP for local smoke clients. Authorization requires `response_type=code`, `code_challenge_method=S256`, a registered redirect URI, and an existing Skill Compass login session.

- [ ] **Step 2: Implement metadata and registration routes**

Return JSON with `Cache-Control: no-store`. Registration persists `client_name` and `redirect_uris`; it does not issue a client secret because the PKCE client is public.

- [ ] **Step 3: Implement authorization approval**

The server-rendered page validates the query and displays the approval form. The form posts the validated OAuth fields to `/oauth/authorize/decision`. That POST requires the existing Skill Compass session, revalidates every field, creates a short-lived authorization code, and redirects only to the exact registered URI:

```ts
const redirect = new URL(validated.redirectUri);
redirect.searchParams.set("code", code);
redirect.searchParams.set("state", validated.state);
return NextResponse.redirect(redirect);
```

Display the requesting client name and the five granted Skill Compass actions. Do not auto-approve.

- [ ] **Step 4: Implement token exchange**

Accept `application/x-www-form-urlencoded`, validate the client, redirect URI, code, and verifier, then return:

```json
{
  "access_token": "<opaque token>",
  "token_type": "Bearer",
  "expires_in": 2592000
}
```

Use `Cache-Control: no-store` and never log the authorization code, verifier, or access token.

- [ ] **Step 5: Update proxy routing**

Allow unauthenticated access to metadata, registration, token, and `/mcp`. Keep `/oauth/authorize` on the login-protected flow so an unauthenticated user returns to approval after login.

- [ ] **Step 6: Run OAuth tests and commit**

Run: `pnpm vitest run tests/unit/mcp-auth.test.ts && pnpm playwright test tests/e2e/mcp-oauth.spec.ts --project=chromium --workers=1`

Expected: PASS.

```bash
git add src/app/.well-known src/app/oauth src/proxy.ts tests/e2e/mcp-oauth.spec.ts
git commit -m "feat: add MCP OAuth endpoints"
```

---

### Task 5: Five MCP Tools and Streamable HTTP Route

**Files:**
- Create: `src/lib/mcp/server.ts`
- Create: `src/lib/mcp/http-handler.ts`
- Create: `src/app/mcp/route.ts`
- Create: `tests/unit/mcp-tools.test.ts`
- Create: `tests/integration/mcp-route.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Tasks 1–4 services and bearer authentication.
- Produces: `createSkillCompassMcpServer(context: { user: CurrentUserAccess })`.
- Produces: POST `/mcp` supporting initialize, tools/list, and tools/call.

- [ ] **Step 1: Install the stable v1 SDK**

Run: `pnpm add @modelcontextprotocol/sdk`

Expected: `package.json` and `pnpm-lock.yaml` contain the SDK; existing Zod 4 satisfies its peer dependency.

- [ ] **Step 2: Write failing tool-schema tests**

Assert the exact five names and that no schema contains `userId`:

```ts
expect(toolNames).toEqual([
  "ask_about_podcast",
  "get_podcast_episode",
  "get_today",
  "list_podcast_episodes",
  "submit_today_answer",
]);
expect(JSON.stringify(tools)).not.toContain("userId");
```

Test tool annotations:

- Read-only: `get_today`, `list_podcast_episodes`, `get_podcast_episode`.
- State-changing: `submit_today_answer`, `ask_about_podcast`.
- `submit_today_answer` requires quiz day, question, choice, confidence 1–5, reasoning, and latest user message.
- `ask_about_podcast` requires episode ID, question, and latest user message.

- [ ] **Step 3: Implement tool registration**

Use `McpServer.registerTool` with Zod input/output schemas. Return both text and `structuredContent`:

```ts
return {
  content: [{ type: "text", text: JSON.stringify(result) }],
  structuredContent: result,
};
```

Descriptions explicitly instruct the client to:

- Present one unanswered Today question at a time.
- Collect choice, confidence, and reasoning before submission.
- Use `latestUserMessage` only for response-language selection.
- Never infer or expose hidden answers.

- [ ] **Step 4: Write failing route integration tests**

Cover:

- Missing bearer returns 401 with `WWW-Authenticate` pointing to protected-resource metadata.
- Invalid bearer returns 401.
- Valid bearer initializes.
- Valid bearer lists five tools.
- Valid bearer calls `get_today`.
- Tool exceptions return MCP errors without stack traces or secrets.

- [ ] **Step 5: Implement stateless Streamable HTTP**

Create a fresh `McpServer` and `StreamableHTTPServerTransport` per request with `sessionIdGenerator: undefined`. Adapt the Next.js Web `Request` to the SDK transport using the SDK’s web-standard handler where available; otherwise isolate Node conversion in `http-handler.ts`.

Export:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleMcpRequest;
export const GET = handleUnsupportedMcpMethod;
export const DELETE = handleUnsupportedMcpMethod;
```

Reject unsupported methods with 405. Validate `Origin` and `Host` against `MCP_ISSUER_URL`.

- [ ] **Step 6: Run MCP tests and commit**

Run: `pnpm vitest run tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts`

Expected: PASS.

```bash
git add package.json pnpm-lock.yaml src/lib/mcp src/app/mcp tests/unit/mcp-tools.test.ts tests/integration/mcp-route.test.ts
git commit -m "feat: expose Skill Compass MCP tools"
```

---

### Task 6: Local Smoke Client and Full Regression

**Files:**
- Create: `src/lib/mcp/cli.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`

**Interfaces:**
- Consumes: MCP endpoint and a bearer token supplied only through `SKILL_COMPASS_MCP_TOKEN`.
- Produces: `pnpm mcp:smoke -- <endpoint>` for initialize, list tools, and safe `get_today`.

- [ ] **Step 1: Add the smoke client**

Use `Client` and `StreamableHTTPClientTransport` from the MCP SDK. Read:

```ts
const endpoint = process.argv[2] ?? "http://localhost:3001/mcp";
const token = process.env.SKILL_COMPASS_MCP_TOKEN;
if (!token) throw new Error("SKILL_COMPASS_MCP_TOKEN is required");
```

Connect with the bearer header, print the negotiated server name and tool names, call only `get_today`, and redact all token material.

- [ ] **Step 2: Add the package command**

```json
"mcp:smoke": "tsx src/lib/mcp/cli.ts"
```

- [ ] **Step 3: Run static and regression verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 4: Run local MCP verification**

With MySQL migrated, the production server running on port 3001, and a locally issued test token:

```bash
SKILL_COMPASS_MCP_TOKEN='<redacted>' pnpm mcp:smoke -- http://localhost:3001/mcp
```

Expected: server identity, the five tool names, and a safe Today result.

- [ ] **Step 5: Record verified behavior and commit**

Add only commands and outcomes to the progress document; do not record secrets or tokens.

```bash
git add src/lib/mcp/cli.ts package.json docs/superpowers/progress/skill-compass-mvp.md
git commit -m "test: add MCP smoke verification"
```

---

### Task 7: Production Process and Cloudflare Tunnel Runbook

**Files:**
- Create: `docs/runbooks/chatgpt-mcp.md`
- Create: `ops/launchd/xyz.finegate.skill-compass-web.plist.example`
- Create: `ops/launchd/xyz.finegate.skill-compass-tunnel.plist.example`

**Interfaces:**
- Consumes: existing `agent.finegate.xyz -> localhost:3001` tunnel configuration.
- Produces: reproducible production startup and health verification.

- [ ] **Step 1: Write the web launchd template**

Run `pnpm start --port 3001` from `/Users/yosukemini/work/skill-compass`, set `NODE_ENV=production`, use `KeepAlive=true`, and direct stdout/stderr to `$HOME/Library/Logs/skill-compass/web.log` and `$HOME/Library/Logs/skill-compass/web-error.log`. Do not embed secrets; document loading them from the existing environment mechanism.

- [ ] **Step 2: Write the tunnel launchd template**

Run:

```text
/opt/homebrew/bin/cloudflared tunnel run
```

Use `KeepAlive=true`; the existing default tunnel is resolved from the installed Cloudflare configuration, so the template contains no tunnel identifier or credential.

- [ ] **Step 3: Write the runbook**

Include:

1. `pnpm build`.
2. `pnpm db:migrate`.
3. Production server start on 3001.
4. `curl http://localhost:3001/.well-known/oauth-protected-resource/mcp`.
5. Cloudflare Tunnel start and dashboard health check.
6. `curl https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp`.
7. OAuth connection from ChatGPT.
8. MCP tool verification.
9. Revocation procedure.
10. Rollback by stopping the tunnel before stopping the origin.

- [ ] **Step 4: Validate templates and external endpoint**

Run:

```bash
plutil -lint ops/launchd/xyz.finegate.skill-compass-web.plist.example
plutil -lint ops/launchd/xyz.finegate.skill-compass-tunnel.plist.example
curl --fail --silent --show-error https://agent.finegate.xyz/.well-known/oauth-protected-resource/mcp
```

Expected: both templates report `OK`; the endpoint returns protected-resource JSON after the origin and tunnel are started.

- [ ] **Step 5: Commit operations documentation**

```bash
git add docs/runbooks/chatgpt-mcp.md ops/launchd
git commit -m "docs: add MCP production runbook"
```

---

### Task 8: ChatGPT Connection and 07:00 Scheduled Task

**Files:**
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`

**Interfaces:**
- Consumes: verified public OAuth and MCP endpoints.
- Produces: installed Skill Compass ChatGPT connection and one daily scheduled task.

- [ ] **Step 1: Connect Skill Compass in ChatGPT**

Add `https://agent.finegate.xyz/mcp` as the remote MCP app/server. Complete the OAuth approval while logged into the intended Skill Compass Pro account.

Expected: ChatGPT lists exactly the five Skill Compass tools.

- [ ] **Step 2: Verify Today synchronization**

In ChatGPT, say:

```text
skill-compassのTodayやりたい
```

Answer one question with a choice, confidence, and reasoning. Confirm the same question is marked answered in the Skill Compass web UI and that score feedback matches.

- [ ] **Step 3: Verify Podcast synchronization**

Ask ChatGPT to list recent Skill Compass Podcast episodes and ask one grounded question about a selected episode. Confirm the conversation appears in the existing episode chat.

- [ ] **Step 4: Create the scheduled task**

Name: `skill-compass-daily-learning`

Schedule: every day at 07:00 Asia/Tokyo.

Self-contained prompt:

```text
Use the connected Skill Compass app. Call get_today to prepare and inspect today's quiz without revealing or submitting any answer. Call list_podcast_episodes to inspect the latest Podcast generation status. Report the Today progress and whether the newest Podcast is ready, queued, processing, failed, or absent. Invite the user to say “skill-compassのTodayやりたい” to begin the quiz. Default to English; if the user continues in Japanese, respond in Japanese. Never infer state when a tool is unavailable, and never submit a quiz answer during this scheduled run.
```

- [ ] **Step 5: Run the scheduled task manually once**

Expected: it reports live Today and Podcast state without submitting an answer.

- [ ] **Step 6: Record final verification**

Add the verified connection date, tool list, Today sync result, Podcast sync result, and scheduled task name/time to `docs/superpowers/progress/skill-compass-mvp.md`. Do not store OAuth codes or tokens.

```bash
git add docs/superpowers/progress/skill-compass-mvp.md
git commit -m "docs: record ChatGPT MCP rollout"
```

## Final Verification

- [ ] `git diff --check` exits 0.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] MCP endpoint rejects unauthenticated access.
- [ ] OAuth requires an existing Skill Compass login and explicit approval.
- [ ] `tools/list` returns exactly five tools and no `userId` input.
- [ ] Today submission through ChatGPT appears in the web UI.
- [ ] Podcast question through ChatGPT appears in the episode chat.
- [ ] The 07:00 Asia/Tokyo task reports state without submitting answers.
- [ ] Existing `next-env.d.ts` changes remain untouched unless independently explained and approved.
