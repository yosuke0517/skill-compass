# MCP Refresh Token Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-hour MCP access tokens and rotating refresh tokens with an absolute 180-day connection lifetime, while preserving existing 30-day access tokens.

**Architecture:** Extend the MCP OAuth persistence boundary with connection-family metadata and hashed refresh-token records. Keep token lifecycle rules in the pure OAuth service, implement atomic consume/rotate and family revocation in the Drizzle repository, then expose both authorization-code and refresh-token grants from the existing token endpoint.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, Drizzle ORM, MySQL, Vitest, OAuth 2.0 Authorization Code with PKCE.

## Global Constraints

- New access tokens expire after exactly `3600` seconds.
- Each connection family expires exactly `15552000` seconds after its original authorization; refresh rotation never extends that deadline.
- Raw access and refresh tokens are returned once and never stored.
- Reusing a consumed refresh token revokes all refresh and access tokens in its connection family.
- Existing access tokens with a null family ID remain valid until their current expiration or revocation.
- Learning and Architecture remain independent OAuth clients/connections.
- Use OAuth `invalid_grant` responses without revealing whether a token was unknown, expired, mismatched, revoked, or replayed.
- No new runtime dependency is required.

---

### Task 1: Refresh-token schema and configuration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Create: `drizzle/0013_mcp_refresh_tokens.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0013_snapshot.json`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `mcpRefreshTokens` Drizzle table.
- Produces: nullable `mcpAccessTokens.familyId`.
- Produces: `getEnv().MCP_REFRESH_TOKEN_TTL_SECONDS: number`.

- [ ] **Step 1: Write the failing environment test**

Add to `tests/unit/env.test.ts`:

```ts
it("defaults MCP refresh tokens to an absolute 180-day lifetime", () => {
  const env = parseEnv(validEnv());
  expect(env.MCP_REFRESH_TOKEN_TTL_SECONDS).toBe(15_552_000);
});
```

- [ ] **Step 2: Run the environment test and verify RED**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/env.test.ts
```

Expected: FAIL because `MCP_REFRESH_TOKEN_TTL_SECONDS` is absent.

- [ ] **Step 3: Add the environment value**

Extend `src/lib/env.ts`:

```ts
MCP_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
MCP_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15_552_000),
```

Set the same explicit values in `.env.example`.

- [ ] **Step 4: Add the Drizzle schema**

Add nullable `familyId` to `mcpAccessTokens` and define:

```ts
export const mcpRefreshTokens = mysqlTable(
  "mcp_refresh_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    familyId: varchar("family_id", { length: 64 }).notNull(),
    clientId: varchar("client_id", { length: 191 })
      .notNull()
      .references(() => mcpOauthClients.id),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id),
    familyExpiresAt: datetime("family_expires_at").notNull(),
    expiresAt: datetime("expires_at").notNull(),
    consumedAt: datetime("consumed_at"),
    replacementTokenHash: varchar("replacement_token_hash", { length: 64 }),
    revokedAt: datetime("revoked_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    index("mcp_refresh_tokens_family_idx").on(table.familyId),
    index("mcp_refresh_tokens_user_idx").on(table.userId),
  ],
);
```

- [ ] **Step 5: Generate and inspect the migration**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm db:generate
```

Expected: one additive migration that adds nullable `family_id` to
`mcp_access_tokens` and creates `mcp_refresh_tokens`. Verify no table drop,
column drop, or destructive alteration is present.

- [ ] **Step 6: Verify Task 1**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/env.test.ts
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example src/lib/env.ts src/db/schema.ts drizzle tests/unit/env.test.ts
git commit -m "feat: add MCP refresh token storage"
```

---

### Task 2: Pure refresh-token lifecycle service

**Files:**
- Modify: `src/lib/mcp/auth/service.ts`
- Modify: `tests/unit/mcp-auth.test.ts`

**Interfaces:**
- Consumes: `McpAuthRepository`.
- Produces:

```ts
type IssuedTokenPair = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

exchangeAuthorizationCode(..., options: {
  allowedUserId: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  now?: () => Date;
  randomToken?: () => string;
  randomFamilyId?: () => string;
}): Promise<IssuedTokenPair>

exchangeRefreshToken(
  input: { refreshToken: string; clientId: string },
  repo: McpAuthRepository,
  options: {
    allowedUserId: string;
    accessTokenTtlSeconds: number;
    now?: () => Date;
    randomToken?: () => string;
  },
): Promise<IssuedTokenPair>
```

- [ ] **Step 1: Extend the in-memory repository contract**

In `tests/unit/mcp-auth.test.ts`, add a refresh-token map and repository
operations that can atomically consume a token, save its replacement, and
revoke a family. Include `familyId: string | null` on stored access tokens.

- [ ] **Step 2: Write the failing authorization exchange test**

Change the existing successful exchange expectation to:

```ts
expect(result).toEqual({
  accessToken: "access-token",
  expiresIn: 3600,
  refreshToken: "refresh-token",
  refreshTokenExpiresIn: 15_552_000,
});
expect([...repo.tokens.values()][0]).toMatchObject({
  familyId: "family-1",
  expiresAt: new Date("2026-07-24T01:00:00.000Z"),
});
expect([...repo.refreshTokens.values()][0]).toMatchObject({
  familyId: "family-1",
  familyExpiresAt: new Date("2027-01-20T00:00:00.000Z"),
});
```

Use deterministic token factories that return separate access and refresh
tokens.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-auth.test.ts
```

Expected: FAIL because the service returns only an access token.

- [ ] **Step 4: Implement authorization token-pair issuance**

Add `StoredRefreshToken`, repository methods, `IssuedTokenPair`, and a private
token-pair issuer. Hash both raw tokens with `sha256Hex`; store the access token
with its family ID and store the refresh token with the absolute family
expiration.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 3. Expected: PASS for authorization exchange and all
pre-existing bearer/PKCE tests.

- [ ] **Step 6: Write failing rotation and absolute-expiry tests**

Add tests proving:

```ts
const refreshed = await exchangeRefreshToken(
  { refreshToken: "refresh-token", clientId: "client_1" },
  repo,
  {
    allowedUserId: "user_1",
    accessTokenTtlSeconds: 3600,
    now: () => new Date("2026-08-24T00:00:00.000Z"),
    randomToken: sequentialTokens("new-access-token", "new-refresh-token"),
  },
);
expect(refreshed.refreshTokenExpiresIn).toBe(12_873_600);
expect(repo.refreshTokens.get(sha256Hex("refresh-token"))?.consumedAt)
  .toEqual(new Date("2026-08-24T00:00:00.000Z"));
```

Also assert that a second use rejects with `refresh_token_replayed` and marks
every token in `family-1` revoked.

- [ ] **Step 7: Run rotation tests and verify RED**

Run the command from Step 3. Expected: FAIL because
`exchangeRefreshToken` does not exist.

- [ ] **Step 8: Implement rotation and replay handling**

Implement `exchangeRefreshToken`. The repository consume result must
distinguish `active`, `replayed`, and `invalid` internally. Convert all failures
to service errors that the HTTP layer maps to `invalid_grant`. Preserve the
original `familyExpiresAt` and calculate `refreshTokenExpiresIn` from the
remaining seconds.

- [ ] **Step 9: Verify Task 2**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-auth.test.ts
```

Expected: PASS with tests for rotation, replay, expiration, client mismatch,
user mismatch, revocation, and legacy null-family access tokens.

- [ ] **Step 10: Commit**

```bash
git add src/lib/mcp/auth/service.ts tests/unit/mcp-auth.test.ts
git commit -m "feat: rotate MCP refresh tokens"
```

---

### Task 3: Transactional Drizzle repository

**Files:**
- Modify: `src/lib/mcp/auth/repository.ts`
- Create: `tests/unit/mcp-auth-repository.test.ts`

**Interfaces:**
- Consumes: `mcpRefreshTokens`, `mcpAccessTokens`, and service repository types.
- Produces atomic `consumeRefreshToken`, `saveRotatedTokenPair`, and
  `revokeTokenFamily` repository behavior.

- [ ] **Step 1: Write a failing repository contract test**

Create a repository-level test around an injectable transaction adapter. Start
two consumes of the same refresh hash and assert exactly one returns `active`;
the other returns `replayed`. Assert the replay path updates all rows sharing
the family ID.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-auth-repository.test.ts
```

Expected: FAIL because the refresh repository operations are absent.

- [ ] **Step 3: Implement transactional refresh consumption**

Inside one MySQL transaction:

1. select the refresh-token row `FOR UPDATE`;
2. reject unknown, revoked, expired, family-expired, user-mismatched, or
   client-mismatched records;
3. if `consumed_at` is non-null, revoke refresh and access rows for that family;
4. otherwise mark the old row consumed and set its replacement hash;
5. insert the replacement refresh token and new access token; and
6. commit before returning the raw-token-independent result.

Keep authorization-code consumption and legacy access-token lookup unchanged.

- [ ] **Step 4: Verify Task 3**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-auth-repository.test.ts tests/unit/mcp-auth.test.ts
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/auth/repository.ts tests/unit/mcp-auth-repository.test.ts
git commit -m "feat: persist MCP token rotation atomically"
```

---

### Task 4: OAuth token endpoint grants

**Files:**
- Modify: `src/app/oauth/token/route.ts`
- Create: `tests/unit/mcp-oauth-token-route.test.ts`
- Modify: `src/app/.well-known/oauth-authorization-server/route.ts`
- Modify: `tests/unit/mcp-oauth-http.test.ts`

**Interfaces:**
- Consumes: `exchangeAuthorizationCode`, `exchangeRefreshToken`, OAuth client
  lookup, and access/refresh TTL environment values.
- Produces OAuth token responses containing:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "refresh_token_expires_in": 15552000
}
```

- [ ] **Step 1: Write failing metadata and token-route tests**

Test that authorization server metadata advertises:

```ts
grant_types_supported: ["authorization_code", "refresh_token"]
```

Test both form submissions:

```ts
grant_type=authorization_code&code=...&client_id=...&redirect_uri=...&code_verifier=...
grant_type=refresh_token&refresh_token=...&client_id=...
```

Assert exact response fields and `Cache-Control: no-store`.

- [ ] **Step 2: Run endpoint tests and verify RED**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-oauth-http.test.ts tests/unit/mcp-oauth-token-route.test.ts
```

Expected: FAIL because refresh grant metadata and routing are absent.

- [ ] **Step 3: Implement grant dispatch**

Parse `grant_type` first. For `authorization_code`, preserve redirect URI and
PKCE validation and pass both TTLs. For `refresh_token`, require an existing
client and pass the refresh token plus client ID. Return
`unsupported_grant_type`, `invalid_client`, or `invalid_grant` as specified,
without exposing service error details.

- [ ] **Step 4: Verify Task 4**

Run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-oauth-http.test.ts tests/unit/mcp-oauth-token-route.test.ts tests/unit/mcp-auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/oauth/token/route.ts src/app/.well-known/oauth-authorization-server/route.ts tests/unit/mcp-oauth-http.test.ts tests/unit/mcp-oauth-token-route.test.ts
git commit -m "feat: support MCP refresh token grant"
```

---

### Task 5: Documentation, migration, deployment, and live verification

**Files:**
- Modify: `docs/runbooks/mcp-chatgpt.md`
- Modify: `.env.local` (ignored; do not commit)

**Interfaces:**
- Consumes: completed migration and refresh-capable OAuth endpoint.
- Produces: deployed one-hour/180-day token policy and documented recovery
  procedure.

- [ ] **Step 1: Update the runbook**

Document:

- one-hour access and absolute 180-day connection-family lifetime;
- automatic refresh requiring no browser session;
- mobile reauthorization prerequisites;
- replay-triggered family revocation;
- Learning and Architecture reconnection as separate operations; and
- the requirement that the Mac, production process, and Cloudflare Tunnel stay
  reachable.

- [ ] **Step 2: Run complete local verification**

Run each command separately:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm test
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm lint
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm build
```

Expected: all tests pass, typecheck and lint exit zero, and production build
lists both `/mcp` resources plus OAuth routes.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/runbooks/mcp-chatgpt.md
git commit -m "docs: document MCP token refresh"
```

- [ ] **Step 4: Apply the additive migration**

Back up or otherwise confirm recovery for the local MySQL database, then run:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm db:migrate
```

Expected: migration `0013` applies successfully without modifying legacy token
expiration values.

- [ ] **Step 5: Set production TTLs and restart**

Set in `.env.local`:

```dotenv
MCP_ACCESS_TOKEN_TTL_SECONDS=3600
MCP_REFRESH_TOKEN_TTL_SECONDS=15552000
```

Restart the existing Next.js production launchd service. Verify:

```bash
curl -fsS https://agent.finegate.xyz/.well-known/oauth-authorization-server
```

Expected: metadata includes both supported grant types.

- [ ] **Step 6: Reconnect both ChatGPT apps**

Reconnect Skill Compass Learning and Skill Compass Architecture from ChatGPT.
Complete the Skill Compass login and consent flow for each connection.

- [ ] **Step 7: Verify rotation without a browser session**

Use a disposable test OAuth client or captured test credentials rather than
printing production tokens. Exchange a refresh token once, verify the old
access token stops at its one-hour expiry, verify the new access token reaches
the correct MCP resource, and verify the refresh-token DB row records
consumption and replacement hashes only.

- [ ] **Step 8: Final repository verification**

Run:

```bash
git status --short --branch
git log -8 --oneline
```

Expected: clean local `main`, ahead of `origin/main`, with no push unless the
user separately requests it.
