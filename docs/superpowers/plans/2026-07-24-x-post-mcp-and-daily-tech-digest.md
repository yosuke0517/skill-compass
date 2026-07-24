# X Post MCP and Daily Tech Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only X Post explanation and a cached daily technical-Post digest to the existing Skill Compass MCP, then schedule the digest separately at 06:45 Asia/Tokyo.

**Architecture:** A fixed-host X API client obtains an automatically refreshed encrypted user token. Pure URL parsing, normalization, filtering, deduplication, and ranking modules feed two application services; Drizzle repositories cache public Posts and one expiring daily result, while the following timeline remains memory-only.

**Tech Stack:** Next.js 16, TypeScript 6, Drizzle ORM, MySQL 8.4, MCP SDK, X API v2, Vitest.

## Global Constraints

- Accept only canonical `x.com` and `twitter.com` HTTPS Post URLs with numeric IDs.
- Never fetch the supplied URL; call only fixed `https://api.x.com` endpoints.
- Add no X write scope.
- Store provider tokens only in the existing AES-256-GCM encrypted columns.
- Refresh X tokens when expired or within five minutes of expiry and persist rotated refresh tokens.
- Retrieve at most 30 unique candidate Posts per local day.
- Prefer a 70-percent public-search and 30-percent following-timeline output mix.
- Do not persist the following timeline, followed-account list, discarded candidates, or per-Post timeline membership.
- Cache public Post snapshots and one final daily result for 24 hours.
- Preserve the existing Today, Podcast, Architecture, and 07:00 scheduled-task behavior.
- Use `invalid_x_post_url`, `x_reconnect_required`, `x_post_unavailable`, `x_rate_limited`, and `x_api_billing_unavailable` as safe public error codes.

---

### Task 1: X URL parser and public data types

**Files:**
- Create: `src/lib/x/types.ts`
- Create: `src/lib/x/post-url.ts`
- Create: `tests/unit/x-post-url.test.ts`

**Interfaces:**
- Produces `parseXPostUrl(value: string): { postId: string; canonicalUrl: string }`.
- Produces `PublicXPost`, `XPostMetrics`, `XMedia`, `RankedTechPost`, and `XServiceErrorCode`.

- [ ] **Step 1: Write failing URL tests**

Test accepted share URLs:

```ts
expect(parseXPostUrl(
  "https://x.com/example/status/2079777959167340607?s=46&t=tracking",
)).toEqual({
  postId: "2079777959167340607",
  canonicalUrl: "https://x.com/i/status/2079777959167340607",
});
```

Test `www.x.com`, `twitter.com`, and `www.twitter.com`. Assert throws
`invalid_x_post_url` for HTTP, credentials, ports, fragments, unknown hosts,
extra path components, missing IDs, and nonnumeric IDs.

- [ ] **Step 2: Run RED**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/x-post-url.test.ts
```

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement the parser and types**

Use `new URL(value)`, an exact hostname allowlist, `https:`, default port only,
no username/password/hash, and exact path segments
`/{displayName}/status/{numericId}`. Return a canonical URL built from the ID.

- [ ] **Step 4: Verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/x/types.ts src/lib/x/post-url.ts tests/unit/x-post-url.test.ts
git commit -m "feat: parse safe X post URLs"
```

---

### Task 2: Encrypted X token refresh provider

**Files:**
- Modify: `src/lib/integrations/oauth-tokens.ts`
- Create: `src/lib/x/token-provider.ts`
- Create: `tests/unit/x-token-provider.test.ts`

**Interfaces:**
- Consumes `getOAuthToken(userId, "x")`.
- Produces:

```ts
getValidXAccessToken(
  userId: string,
  deps?: XTokenProviderDeps,
): Promise<string>
```

- Produces a repository operation that atomically replaces access token,
  optional rotated refresh token, scope, and expiration.

- [ ] **Step 1: Write failing token-provider tests**

Cover:

```ts
await expect(getValidXAccessToken("user_1", {
  now: () => new Date("2026-07-24T00:00:00Z"),
  load: async () => freshConnection,
  refresh: vi.fn(),
  save: vi.fn(),
})).resolves.toBe("fresh-access");
```

Also test refresh within five minutes, rotated refresh-token persistence,
concurrent calls sharing one in-flight refresh, missing connection/refresh token
returning `x_reconnect_required`, and provider errors never containing tokens.

- [ ] **Step 2: Run RED**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/x-token-provider.test.ts
```

Expected: FAIL because `getValidXAccessToken` does not exist.

- [ ] **Step 3: Implement token refresh**

POST only to `https://api.x.com/2/oauth2/token` with
`grant_type=refresh_token`, the configured client ID, client authentication,
and the encrypted stored refresh token. Map the response to the existing
encrypted storage helper and preserve the prior refresh token only when X omits
a replacement.

- [ ] **Step 4: Verify GREEN**

Run the command from Step 2 plus:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/oauth-tokens.ts src/lib/x/token-provider.ts tests/unit/x-token-provider.test.ts
git commit -m "feat: refresh encrypted X OAuth tokens"
```

---

### Task 3: Fixed-host X API client and public Post cache

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0014_x_post_cache.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/x/client.ts`
- Create: `src/lib/x/post-cache.ts`
- Create: `tests/unit/x-client.test.ts`
- Create: `tests/unit/x-post-cache.test.ts`

**Interfaces:**
- Produces:

```ts
type XApiClient = {
  getPost(id: string): Promise<PublicXPost>;
  getPosts(ids: string[]): Promise<PublicXPost[]>;
  searchRecent(input: { query: string; startTime: Date; maxResults: number }): Promise<PublicXPost[]>;
  getMe(): Promise<{ id: string }>;
  getFollowingTimeline(input: { userId: string; startTime: Date; maxResults: number }): Promise<PublicXPost[]>;
};
```

- Produces `getCachedPublicPost`, `saveCachedPublicPost`, and
  `getXPostWithReferences`.

- [ ] **Step 1: Write failing client tests**

Mock `fetch` and assert exact `api.x.com` URLs, Bearer authorization, bounded
fields/expansions, normalized note text and media, and safe mappings for 401,
403/404, 429, and billing responses. Assert provider bodies and bearer values
do not appear in errors.

- [ ] **Step 2: Run RED**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/x-client.test.ts
```

Expected: FAIL because the client is absent.

- [ ] **Step 3: Implement the client**

Use fixed endpoint constructors for Post lookup, recent search, `/2/users/me`,
and reverse-chronological timeline. Normalize only allowlisted response fields.
Batch quoted and parent IDs in one follow-up lookup.

- [ ] **Step 4: Write failing cache tests**

Test that an unexpired cached public Post avoids X, expired rows are ignored,
and stored rows contain no `userId`, token, request headers, or timeline flag.

- [ ] **Step 5: Add additive cache schema**

Define `xPublicPostCache` with Post ID primary key, JSON snapshot, fetched time,
and expiration. Add only the matching table/index SQL to
`0014_x_post_cache.sql`; do not use a generated full-schema migration.

- [ ] **Step 6: Implement cache-backed Post retrieval**

The service parses the URL, checks the cache, calls X only on a miss, caches the
main and public reference Posts for 24 hours, and returns unavailable reference
types without failing the main Post.

- [ ] **Step 7: Verify Task 3**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/x-client.test.ts tests/unit/x-post-cache.test.ts tests/unit/x-post-url.test.ts
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add drizzle src/db/schema.ts src/lib/x/client.ts src/lib/x/post-cache.ts tests/unit/x-client.test.ts tests/unit/x-post-cache.test.ts
git commit -m "feat: fetch and cache public X posts"
```

---

### Task 4: Daily collector, ranking, and expiring daily result

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0015_x_daily_tech_digest_cache.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/x/topics.ts`
- Create: `src/lib/x/ranking.ts`
- Create: `src/lib/x/daily-digest.ts`
- Create: `src/lib/x/daily-cache.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Create: `tests/unit/x-ranking.test.ts`
- Create: `tests/unit/x-daily-digest.test.ts`
- Modify: `tests/unit/env.test.ts`

**Interfaces:**
- Produces `getDailyTechPosts(user, { limit, now }): Promise<DailyTechDigest>`.
- Produces deterministic `rankTechPosts(input): RankedTechPost[]`.
- Produces TTL settings `X_DAILY_POST_READ_BUDGET=30` and
  `X_PUBLIC_POST_CACHE_TTL_SECONDS=86400`.

- [ ] **Step 1: Write failing ranking tests**

Provide mixed public-search and timeline candidates. Assert a five-item result
prefers 4/1 or 3/2 source distribution, boosts concrete CVE/patch Posts,
deduplicates reposts/text/canonical links, and removes ads, jobs, engagement
bait, crypto-price speculation, and empty Posts.

- [ ] **Step 2: Run ranking RED**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/x-ranking.test.ts
```

Expected: FAIL because ranking does not exist.

- [ ] **Step 3: Implement topics and deterministic ranking**

Use fixed topic groups plus an allowlisted mapping from Skill Compass category
names. Use capped logarithmic metric weights, recency decay, topic scores,
security boosts, quality penalties, and deterministic ID tie-breaking.

- [ ] **Step 4: Write failing collector and config tests**

Assert one public search plus one following-timeline collection, no more than 30
unique candidates, source fallback, same-day daily-cache reuse, 24-hour expiry,
no persistence callback receiving the raw timeline, and defaults of 30/86400.

- [ ] **Step 5: Add daily-cache schema**

Create an expiring per-user/per-local-date result cache containing selected
public Post snapshots and ranking explanations only. Do not store candidate
source membership or discarded candidates.

- [ ] **Step 6: Implement the collector**

Use Asia/Tokyo date boundaries, fetch `/2/users/me`, collect bounded sources in
memory, rank, save only the final digest, and return partial failures without
inventing Posts.

- [ ] **Step 7: Verify Task 4**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/x-ranking.test.ts tests/unit/x-daily-digest.test.ts tests/unit/env.test.ts
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add .env.example drizzle src/db/schema.ts src/lib/env.ts src/lib/x tests/unit/x-ranking.test.ts tests/unit/x-daily-digest.test.ts tests/unit/env.test.ts
git commit -m "feat: rank daily technical X posts"
```

---

### Task 5: MCP registration, production wiring, and consent

**Files:**
- Modify: `src/lib/mcp/server.ts`
- Modify: `src/lib/mcp/http-handler.ts`
- Modify: `src/lib/mcp/auth/consent.ts`
- Modify: `tests/unit/mcp-tools.test.ts`
- Modify: `tests/unit/mcp-oauth-consent.test.ts`

**Interfaces:**
- Extends `SkillCompassMcpServices` with:

```ts
getXPost(input: { url: string }): Promise<Record<string, unknown>>;
getDailyTechPosts(input: { limit: number }): Promise<Record<string, unknown>>;
```

- Registers exactly `get_x_post` and `get_daily_tech_posts` as read-only,
  non-destructive tools.

- [ ] **Step 1: Write failing MCP tests**

Change the expected tool list from five to seven. Call `get_x_post` with a
tracked share URL and assert service routing, structured content, and Japanese
language detection. Assert `get_daily_tech_posts` defaults to five and caps at
ten. Assert neither schema exposes `userId` or provider tokens.

- [ ] **Step 2: Run MCP RED**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-tools.test.ts tests/unit/mcp-oauth-consent.test.ts
```

Expected: FAIL because the tools and consent copy are absent.

- [ ] **Step 3: Register tools and wire production services**

Import X services only in the learning MCP production handler. Update the
learning consent copy with public lookup, bounded public search, and temporary
following-timeline use. Do not change Architecture imports, consent, or tools.

- [ ] **Step 4: Verify Task 5**

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm vitest run tests/unit/mcp-tools.test.ts tests/unit/mcp-oauth-consent.test.ts tests/unit/mcp-architecture-tools.test.ts
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp tests/unit/mcp-tools.test.ts tests/unit/mcp-oauth-consent.test.ts
git commit -m "feat: expose X Post MCP tools"
```

---

### Task 6: Runbook, migration, production, ChatGPT, and schedule

**Files:**
- Modify: `docs/runbooks/chatgpt-mcp.md`
- Modify: `.env.local` (ignored; do not commit)

**Interfaces:**
- Produces deployed seven-tool learning MCP and active
  `skill-compass-daily-tech-on-x` schedule at 06:45 Asia/Tokyo.

- [ ] **Step 1: Update the runbook**

Document X OAuth refresh, exact URL allowlist, privacy boundary, 30-Post
budget, 24-hour caches, current Developer Console pricing authority, X
reconnection, the two tools, and the independent 06:45 task.

- [ ] **Step 2: Run complete local verification**

Run separately:

```bash
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm test
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm typecheck
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm lint
ASDF_NODEJS_VERSION=24.13.0 corepack pnpm build
```

Expected: all commands succeed.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/runbooks/chatgpt-mcp.md
git commit -m "docs: add X MCP operations"
```

- [ ] **Step 4: Back up and migrate**

Create a MySQL dump without tablespaces, verify it is nonempty, then apply
`0014` and `0015`. Verify both cache tables exist and existing OAuth/MCP rows
remain.

- [ ] **Step 5: Configure and restart**

Set:

```dotenv
X_DAILY_POST_READ_BUDGET=30
X_PUBLIC_POST_CACHE_TTL_SECONDS=86400
```

Restart the existing Next.js launchd service and verify public OAuth/MCP
metadata.

- [ ] **Step 6: Update and reconnect the ChatGPT learning app**

Use its Manage → Update and Reconnect flow so ChatGPT sees the two new tools and
the expanded consent. Confirm the app lists exactly seven learning tools.

- [ ] **Step 7: Live Post test**

In ChatGPT, send a real X Post URL with `これどういう意味？`. Confirm
`get_x_post` is called, the Japanese answer links the source, and no token or
provider payload appears.

- [ ] **Step 8: Create the separate scheduled task**

Create `skill-compass-daily-tech-on-x` for daily 06:45 Asia/Tokyo. Its prompt
calls only `get_daily_tech_posts(limit=5)`, produces five concise Japanese
items, labels uncorroborated Posts as claims, does not guess on failure, and
ends with original URLs.

- [ ] **Step 9: Verify schedules**

Manually run the new task once if the X API connection and credits are
available. Verify the existing `skill-compass-daily-learning` remains daily at
07:00 with unchanged instructions.

- [ ] **Step 10: Final state**

```bash
git status --short --branch
git log -10 --oneline
```

Expected: clean local `main`, ahead of `origin/main`, with no push until the
user requests it.
