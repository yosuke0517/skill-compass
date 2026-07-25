# Personalized X Technical Trends Design

## Goal

Make `get_daily_tech_posts` return genuinely notable technical Posts instead
of merely recent Posts that happen to match a broad keyword query.

The collector should use the connected user's X Personalized Trends when the
account and application are eligible, while retaining a safe and useful
fallback when that endpoint is unavailable.

## Considered approaches

### Personalized Trends only

Use `GET /2/users/personalized_trends`, keep technical trends, then search for
representative Posts.

This is highly personalized but can fail for accounts without X Premium and
can omit important technical developments outside the user's existing
interest graph.

### Relevancy search only

Split the current combined query into topic-specific searches and request
`sort_order=relevancy`.

This works without the Personalized Trends entitlement but is less personal
and does not use X's trend signals.

### Hybrid personalized trends with deterministic fallback

Use Personalized Trends first, combine eligible technical trends with the
fixed Skill Compass topic allowlist, then retrieve and rank representative
Posts. If Personalized Trends is unavailable, use topic-specific relevancy
searches.

This is the selected approach. It gives the best result when the user's X
Premium entitlement is available without making the daily digest dependent on
that entitlement.

## Data flow

1. Reuse the existing refreshed OAuth 2.0 PKCE user access token.
2. Call `GET /2/users/personalized_trends` once.
3. Keep only trends whose names or categories match a strict technical
   allowlist covering AI, developer tools, Web/backend/cloud, databases,
   observability, and security.
4. Never interpolate an unbounded trend name into a query. Normalize it,
   enforce a length limit, reject operators and control syntax, and construct
   the query through a dedicated builder.
5. Search representative Posts for the accepted trends with
   `sort_order=relevancy`, excluding reposts and replies.
6. Fill remaining candidate capacity using separate fixed searches for AI,
   Web/backend/database, cloud/observability, and security. Do not combine the
   four topic groups with implicit AND.
7. Rank the bounded candidate set and return up to the requested limit.

The collector remains capped by `X_DAILY_POST_READ_BUDGET`. It must never
increase paid Post reads merely to fill five output slots.

## Ranking and selection

Ranking uses:

- X search relevancy;
- recency;
- likes, reposts, replies, and quotes;
- technical-topic relevance;
- duplicate text and canonical-link removal; and
- promotional and engagement-bait filtering.

The following timeline is no longer guaranteed a fixed 30 percent allocation.
A followed-account Post competes on the same quality threshold as public
search results.

Low-engagement security advisories may still be useful, but they must not
receive an unconditional score that dominates every popular Post. Concrete
security updates are returned in a distinct priority class and clearly labeled
as security-relevant rather than popular.

The collector may return fewer than five Posts when fewer than five candidates
meet the quality threshold. It must not pad the digest with weak Posts.

## Eligibility and fallback

Personalized Trends requires an approved X developer application, OAuth 2.0
PKCE user authentication, and an X Premium user subscription.

The first real request is the entitlement check:

- HTTP 200: use returned personalized trends.
- Authentication or expired-token response: use the existing refresh flow,
  retry once, then return `x_reconnect_required` if refresh fails.
- Endpoint entitlement, enrollment, or plan rejection: record
  `personalized_trends_unavailable` and continue with topic-specific relevancy
  searches.
- Rate limit or temporary provider failure: record a safe partial failure and
  continue with the fallback.

Provider response bodies, access tokens, refresh tokens, and subscription
details are never returned through MCP or written to logs.

## API and cache behavior

Extend the X client with:

```ts
getPersonalizedTrends(): Promise<PersonalizedTrend[]>
```

Extend recent search input with:

```ts
sortOrder?: "recency" | "relevancy"
```

The MCP tool name and input remain unchanged. Its output adds enough source
metadata to explain collection behavior:

```ts
trendSource: "personalized" | "fixed_topics"
personalizedTrends: string[]
```

Only accepted technical trend names may be cached. Raw personalized trend
lists, rejected trends, and account subscription information are not
persisted. The existing daily cache remains valid for one Tokyo calendar day;
deployment invalidates or versions old cached digest shapes.

## Testing

Use test-driven development to cover:

- Personalized Trends success and technical allowlisting;
- unsafe or nontechnical trend rejection;
- `sort_order=relevancy` on representative Post searches;
- four independent fixed-topic searches rather than one implicit-AND query;
- entitlement, rate-limit, and temporary-failure fallback;
- no fixed following-timeline quota;
- quality threshold behavior and fewer-than-five results;
- security priority without unconditional score domination;
- daily read-budget enforcement across all searches;
- cache shape/version behavior; and
- token and provider-error redaction.

An integration smoke test should call Personalized Trends once using the
connected account. A successful 200 response confirms eligibility. A fallback
response must still produce a digest from fixed topics without exposing the
provider error body.

## Rollout

1. Add failing unit tests for the new client and collector behavior.
2. Implement the client endpoint, query builder, fallback, and ranking changes.
3. Run unit, type, lint, and build verification.
4. Deploy and restart the Skill Compass service.
5. Run `get_daily_tech_posts` once against the connected account.
6. Confirm whether `trendSource` is `personalized` or `fixed_topics`.
7. Clear or version today's old digest cache before judging the new output.
8. Manually run the ChatGPT `skill-compass-daily-tech-on-x` task and inspect
   metrics on the selected Posts.

Rollback removes Personalized Trends collection and restores topic-specific
relevancy fallback. Existing X URL lookup, OAuth refresh, Today, Podcast, and
Architecture behavior remain unchanged.
