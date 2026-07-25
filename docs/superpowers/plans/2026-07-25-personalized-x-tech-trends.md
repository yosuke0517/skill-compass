# Personalized X Technical Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefer the connected account's X Personalized Trends for the daily technical digest and fall back to independent relevancy searches without padding results with weak Posts.

**Architecture:** Extend the existing fixed-host X client with Personalized Trends and relevancy sorting. Add a small pure trend-query module, then update the daily collector and deterministic ranking while preserving the MCP contract and daily read budget.

**Tech Stack:** TypeScript 6, Vitest 4, Next.js 16, X API v2, Drizzle-backed daily cache.

## Global Constraints

- Never expose provider response bodies, access tokens, refresh tokens, or X subscription details.
- Keep all provider requests on fixed `https://api.x.com` endpoints.
- Do not exceed `X_DAILY_POST_READ_BUDGET`.
- Return fewer than five Posts when quality candidates are insufficient.
- Preserve `get_daily_tech_posts` input compatibility.

---

### Task 1: X client support

**Files:**
- Modify: `src/lib/x/client.ts`
- Modify: `src/lib/x/types.ts`
- Test: `tests/unit/x-client.test.ts`

**Interfaces:**
- Produces: `getPersonalizedTrends(): Promise<PersonalizedTrend[]>`
- Produces: `searchRecent({ query, startTime, maxResults, sortOrder })`

- [ ] Add a failing client test asserting `/2/users/personalized_trends`, normalized allowlisted fields, and `sort_order=relevancy`.
- [ ] Run `pnpm test tests/unit/x-client.test.ts` and confirm the missing methods/parameters fail.
- [ ] Add `PersonalizedTrend`, the new client method, and optional search sort order.
- [ ] Run `pnpm test tests/unit/x-client.test.ts` and confirm it passes.

### Task 2: Safe trend selection and ranking

**Files:**
- Create: `src/lib/x/trend-queries.ts`
- Create: `tests/unit/x-trend-queries.test.ts`
- Modify: `src/lib/x/ranking.ts`
- Modify: `tests/unit/x-ranking.test.ts`

**Interfaces:**
- Produces: `selectTechnicalTrends(trends, limit): string[]`
- Produces: `buildTrendSearchQuery(trend): string`
- Produces: `xFixedTopicFallbackQuery: string`

- [ ] Add failing tests for technical allowlisting, operator/control-character rejection, an explicit-OR fixed fallback query, no fixed timeline quota, and security priority not dominating a highly engaged Post.
- [ ] Run the two focused test files and confirm expected failures.
- [ ] Implement the pure trend-query functions and simplify ranking to global quality order with a minimum engagement threshold or concrete-security exception.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Personalized collector with fallback

**Files:**
- Modify: `src/lib/x/daily-digest.ts`
- Modify: `tests/unit/x-daily-digest.test.ts`
- Modify: `docs/runbooks/chatgpt-mcp.md`

**Interfaces:**
- Produces: `trendSource: "personalized" | "fixed_topics"`
- Produces: `personalizedTrends: string[]`

- [ ] Add failing collector tests for personalized success, entitlement/error fallback, explicit-OR fixed-topic relevancy search, and total read-budget enforcement.
- [ ] Run `pnpm test tests/unit/x-daily-digest.test.ts` and confirm failures describe missing behavior.
- [ ] Implement bounded candidate allocation, partial-failure reporting, source metadata, and cache compatibility.
- [ ] Update the runbook with the new source selection and fallback.
- [ ] Run all X unit tests, typecheck, lint, and build.
- [ ] Review `git diff --check` and the final diff before reporting completion.
