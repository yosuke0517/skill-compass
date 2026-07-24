# X Post MCP and Daily Tech Digest Design

## Goal

Let the user paste an X Post URL into ChatGPT from mobile and ask what it
means, while also delivering a separate daily digest of relevant technical
Posts before the existing Skill Compass learning task.

The feature extends the existing Skill Compass learning MCP. It does not add a
third ChatGPT app or give the Architecture MCP access to X.

## User experience

### Explain a Post

When a user message contains an `x.com` or `twitter.com` Post URL and asks for
an explanation, ChatGPT calls `get_x_post`. The tool returns the Post, author,
creation time, public metrics, media metadata, quoted Post, and direct parent
Post when available.

ChatGPT explains the result in the language of the user’s message. Japanese is
the default when the message is Japanese. The response links to the original
Post and separates facts present in the Post from ChatGPT’s interpretation.

The first release does not fetch an entire reply thread, arbitrary linked web
pages, private Posts, deleted Posts, or content the connected X account cannot
access.

### Daily technical digest

A separate ChatGPT scheduled task named
`skill-compass-daily-tech-on-x` runs every day at 06:45 Asia/Tokyo. It calls
`get_daily_tech_posts` and publishes five Japanese items. Each item contains:

- what happened;
- why it matters;
- how it relates to Skill Compass or the user’s engineering growth;
- an uncertainty, caveat, or security concern when relevant; and
- the original X URL.

The existing 07:00 Skill Compass Today and Podcast task remains unchanged. An X
API failure must not delay or alter that task.

## MCP tools

### `get_x_post`

Input:

```ts
{
  url: string;
  latestUserMessage?: string;
}
```

Output:

```ts
{
  post: PublicPost;
  quotedPost?: PublicPost;
  parentPost?: PublicPost;
  unavailableReferences: Array<"quoted_post" | "parent_post">;
  responseLanguage: "ja" | "en";
}
```

The tool is read-only and non-destructive. Its description explicitly says to
use it when a message includes an X Post URL and asks what the Post means,
whether a claim is significant, or for context.

### `get_daily_tech_posts`

Input:

```ts
{
  limit?: number; // default 5, maximum 10
  latestUserMessage?: string;
}
```

Output:

```ts
{
  generatedAt: string;
  window: { start: string; end: string };
  topics: string[];
  posts: RankedTechPost[];
  sourceMix: { publicSearch: number; followingTimeline: number };
  responseLanguage: "ja" | "en";
  partialFailures: string[];
}
```

The tool is read-only and non-destructive. The automatic task requests five
items. Conversation users may request between one and ten.

## X URL boundary

The server parses the URL locally and accepts only:

- `https://x.com/{username}/status/{numericId}`;
- `https://www.x.com/{username}/status/{numericId}`;
- `https://twitter.com/{username}/status/{numericId}`; and
- `https://www.twitter.com/{username}/status/{numericId}`.

Query strings such as X share-tracking parameters are ignored. The username is
not trusted as an identity; the numeric Post ID is the only lookup key.

The server never fetches the supplied URL. It calls a fixed X API hostname with
the extracted numeric ID. Other protocols, hosts, paths, credentials, ports,
fragments, nonnumeric IDs, and redirect URLs are rejected. This prevents the
tool from becoming a general URL fetcher or SSRF primitive.

## X data client

Create a focused X client with three operations:

```ts
getPost(id: string): Promise<XPostResult>
searchRecentTechPosts(input: SearchInput): Promise<XPostResult[]>
getFollowingTimeline(input: TimelineInput): Promise<XPostResult[]>
```

`getPost` requests author, creation time, language, public metrics,
conversation ID, referenced Posts, note text, and media expansions. It performs
at most one follow-up batch lookup for referenced quoted and parent Posts.

The daily collector uses:

- recent public search over the last 24 hours; and
- the authenticated user’s reverse-chronological home timeline over the same
  window.

It retrieves at most 30 unique candidate Posts per scheduled run across both
sources. Pagination stops once the budget is reached. It does not fetch replies,
liking users, reposting users, follower lists, bookmarks, direct messages, or
arbitrary profiles.

## Topic selection

The public search covers:

- AI, LLMs, agents, and developer tooling;
- frontend, backend, databases, and Web engineering;
- cloud infrastructure, observability, and distributed systems;
- application security, vulnerabilities, authentication, authorization,
  privacy, and supply-chain security; and
- the current Skill Compass learning categories.

Skill Compass category names are normalized through an allowlist before being
placed into an X query. User-generated text, quiz reasoning, Podcast
transcripts, and arbitrary database content are never interpolated into a
search query.

The following timeline supplies personal relevance but does not replace the
public topic search.

## Candidate selection and ranking

The target source mix is 70 percent public search and 30 percent following
timeline. The ratio is a ranking target, not a guarantee: insufficient quality
from one source may be filled from the other.

Each candidate receives a deterministic score from:

- recency;
- likes, reposts, replies, and quotes using capped logarithmic weights;
- topic matches;
- author and content duplication penalties;
- promotional and low-information penalties;
- relevance to active Skill Compass categories; and
- a security-priority boost for concrete vulnerability disclosures, patches,
  incident reports, authentication changes, and credible advisories.

Ranking does not equate engagement with truth. The MCP response includes source
text and metrics, while ChatGPT is instructed to describe uncertainty and avoid
presenting an unverified Post as established fact.

Reposts, identical normalized text, multiple Posts linking to the same
canonical URL, and Posts quoting the same primary announcement are grouped.
Only the strongest representative is returned.

## Filtering

Exclude:

- pure advertisements, referral links, job listings, and event promotion;
- engagement bait without technical information;
- cryptocurrency price speculation;
- duplicated reposts;
- Posts without meaningful text;
- content outside the technical topic allowlist; and
- Posts unavailable to the connected account.

Do not exclude a security Post merely because it has low engagement when it
contains a concrete CVE, vendor advisory, patch announcement, or incident
report.

## OAuth and token refresh

Reuse the existing encrypted X OAuth connection. Its scopes already request:

```text
tweet.read users.read bookmark.read offline.access
```

No additional X write scope is introduced.

Before an X API request, the token provider checks the stored expiration. If
the access token is expired or within five minutes of expiry, it exchanges the
encrypted refresh token at X’s fixed token endpoint, then atomically replaces
the encrypted access token, refresh token, scope, and expiration.

Concurrent refresh attempts for the same user and provider must be serialized
or use compare-and-swap semantics. A successful X refresh may rotate the X
refresh token, so the old encrypted value must be replaced. Raw provider tokens
must not appear in logs, MCP responses, exceptions, or test snapshots.

If no X connection or usable refresh token exists, the MCP returns a safe
`x_reconnect_required` error. Invalid grants also clear or mark the connection
unusable so repeated scheduled runs do not continuously retry a rejected token.

## Storage and privacy

The following timeline is used only in memory during a collector run. Personal
timeline Posts, source ordering, and the list of followed accounts are not
persisted.

Public Post lookups may be cached for 24 hours in a dedicated table containing:

- Post ID;
- normalized public response JSON;
- fetched and expiration timestamps; and
- no Skill Compass user ID.

The cache never stores access tokens, refresh tokens, request headers,
bookmarks, timeline membership, or whether a user follows an author.

Daily digest output exists in the ChatGPT scheduled-task conversation. The
server also stores one expiring daily result per Skill Compass user so repeated
manual calls do not repeat the paid search. The daily cache contains only the
selected public Post snapshots, ranking explanations, generation time, and
expiration time. It does not store the following timeline, followed-account
list, discarded candidates, or which selected Post came from that timeline.
Rows expire after 24 hours and are operational cache, not digest history.

## Cost controls

X API v2 is pay-per-usage. A scheduled run has a hard maximum of 30 unique Post
resources and one provider-backed collection per local calendar day. Manual
calls to `get_daily_tech_posts` return the same expiring daily result.

Configuration includes:

```dotenv
X_DAILY_POST_READ_BUDGET=30
X_PUBLIC_POST_CACHE_TTL_SECONDS=86400
```

The tool returns a partial digest rather than exceeding the configured budget.
Lookup of a user-pasted URL is separate from the daily budget but uses the
public cache.

At the approved ceiling, the estimated Post-read cost is approximately USD
0.15 per day or USD 4.50 per 30-day month at the X price reviewed during
design. The runbook must state that the Developer Console is authoritative
because X can change endpoint prices.

## Failure behavior

- Invalid URL: return `invalid_x_post_url`.
- X is not connected or refresh is impossible: return
  `x_reconnect_required`.
- Post unavailable, deleted, private, or inaccessible: return
  `x_post_unavailable` without claiming which condition applies.
- X rate limit: return `x_rate_limited` and the safe retry time when provided.
- X credit or plan failure: return `x_api_billing_unavailable`.
- Partial reference failure: return the main Post and list the missing
  reference type.
- One daily source fails: rank results from the other source and list the
  partial failure.
- Both daily sources fail: return no Posts and a safe error; ChatGPT must not
  invent a digest.

Provider response bodies are not forwarded verbatim to ChatGPT or logs.

## Scheduled-task prompt

Create a separate 06:45 Asia/Tokyo daily task. Its instruction:

1. Call `get_daily_tech_posts` with `limit=5`.
2. Do not call Today, Podcast, Architecture, or answer-submission tools.
3. Present five concise Japanese items using the required digest fields.
4. Label X Posts as reports or claims unless corroboration is present in the
   returned source data.
5. Do not guess when the tool is unavailable.
6. End with the original X URLs.

The task is independent from `skill-compass-daily-learning`.

## Consent and capability boundaries

Update the learning MCP consent copy to disclose:

- reading a specific public X Post supplied by the user;
- reading a bounded public technical search; and
- temporarily reading the connected account’s following timeline for ranking.

The Architecture consent and tools remain unchanged. Neither new tool writes to
X or submits a Skill Compass answer.

## Testing

Use test-driven development for:

- accepted and rejected X URL shapes;
- query-string removal and numeric ID extraction;
- main, quoted, and parent Post normalization;
- fixed-host X requests and bounded reference lookup;
- provider-token refresh and refresh-token rotation;
- concurrent refresh safety;
- token redaction from errors and responses;
- public-cache TTL and absence of user identity;
- personal timeline non-persistence;
- 30-resource daily budget enforcement;
- 70/30 source-mix preference and fallback;
- topic allowlisting;
- duplicate and promotion filtering;
- security-priority ranking;
- safe mapping of unavailable, rate-limit, and billing errors;
- MCP schemas, read-only annotations, and language behavior; and
- unchanged Today, Podcast, and Architecture tool registration.

After local verification, apply the additive cache migration, restart the
production service, update the ChatGPT learning app, reconnect if required,
test a real user-supplied X URL, manually run the 06:45 task once, and verify
that the 07:00 learning task is unchanged.

## Rollout and rollback

1. Add the public Post and daily-result cache migration.
2. Deploy the X token provider, API client, ranking service, and MCP tools.
3. Set the daily budget and cache TTL.
4. Restart the Next.js production process.
5. Update the existing Skill Compass ChatGPT app.
6. Create and manually verify the separate 06:45 scheduled task.
7. Observe the first automatic run before relying on it.

Rollback disables the 06:45 task and removes the two MCP tool registrations.
The additive cache tables may remain. Existing X OAuth, Podcast settings,
Today, Podcast, Architecture, and 07:00 scheduled-task behavior remain intact.
