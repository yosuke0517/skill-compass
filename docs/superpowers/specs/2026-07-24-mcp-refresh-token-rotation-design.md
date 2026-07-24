# MCP Refresh Token Rotation Design

## Goal

Keep the Skill Compass ChatGPT connections usable from mobile without requiring
reauthorization every 30 days, while reducing the damage window of a leaked
access token.

This applies to both MCP resources:

- Learning: Today and Podcast
- Architecture: technical interview, security, and privacy answers

## Token policy

New OAuth authorizations issue:

- an access token valid for 1 hour;
- a refresh token valid for 180 days; and
- an OAuth token response that advertises both lifetimes to ChatGPT.

Refresh tokens rotate on every successful refresh. The token used for a refresh
becomes unusable immediately, and the response contains a replacement refresh
token. The connection family has an absolute 180-day expiration measured from
the original authorization, so rotation does not extend the manual
reauthorization deadline indefinitely.

Existing access tokens issued under the current 30-day policy remain valid
until their recorded expiration or revocation. They do not gain a refresh
token. The next manual reconnection moves that ChatGPT connection to the new
policy. Learning and Architecture are independent connections and may migrate
at different times.

## OAuth flows

### Authorization code exchange

The existing Authorization Code with PKCE flow remains unchanged through code
validation. A successful exchange stores and returns:

- a hashed access token;
- a hashed refresh token;
- the client, user, and connection-family identifiers;
- separate access, refresh, and connection-family expiration timestamps; and
- `token_type=Bearer`, `expires_in=3600`, `refresh_token`, and
  `refresh_token_expires_in=15552000`.

Raw tokens are returned once and are never stored.

### Refresh exchange

`POST /oauth/token` accepts `grant_type=refresh_token`, the refresh token, and
the OAuth client ID. A successful request:

1. hashes and atomically consumes the presented refresh token;
2. verifies that it belongs to the client and allowed Skill Compass user;
3. issues a new one-hour access token;
4. issues a replacement refresh token in the same connection family, expiring
   at the family's original 180-day deadline;
5. stores only the new token hashes; and
6. returns the new token pair.

The refresh flow does not require the Skill Compass browser session. This is
what lets ChatGPT refresh automatically while the user is away from home.

## Rotation and replay handling

Each authorization creates a connection family. Every refresh token records:

- its token hash;
- family ID;
- absolute family expiration;
- client ID and user ID;
- expiration;
- consumed timestamp;
- replacement token hash, when rotation succeeds; and
- revocation timestamp.

The consume-and-replace operation is transactional. Two concurrent uses of the
same refresh token cannot both succeed.

If an expired, revoked, unknown, mismatched, or already-consumed refresh token
is presented, the server returns OAuth `invalid_grant`. Reuse of a consumed
refresh token is treated as a possible token theft signal and revokes all
unexpired refresh tokens in that connection family. Existing access tokens in
that family are also revoked so that the user reconnects from a known state.

The response does not distinguish between expiry, replay, mismatch, or an
unknown token.

## Data model

Add a refresh-token table rather than overloading the access-token table. The
table stores hashes and metadata only. It has unique indexes for token hash and
family-aware lookup.

Add a nullable family ID to MCP access tokens. It is null for legacy 30-day
tokens and populated for tokens issued by the new authorization and refresh
flows. Family revocation affects only rows with the matching non-null family
ID.

No raw access token, refresh token, password, provider credential, learning
answer, or personal content is added to OAuth storage.

## Configuration

Use explicit environment settings:

- `MCP_ACCESS_TOKEN_TTL_SECONDS=3600`
- `MCP_REFRESH_TOKEN_TTL_SECONDS=15552000`

The refresh-token TTL defaults to 180 days when omitted. Production is updated
to the explicit values after the database migration is applied.

## Mobile and availability behavior

Normal token refresh is server-to-server between ChatGPT and
`agent.finegate.xyz`; it does not open a mobile browser.

Manual reauthorization is required when:

- the connection family's absolute 180-day lifetime ends;
- replay protection revokes the connection family;
- the connection is manually revoked; or
- ChatGPT loses the stored connection.

Manual reauthorization can be completed from a mobile browser as long as the
public hostname reaches the Skill Compass origin. Because the current origin is
the user's Mac through Cloudflare Tunnel, the Mac, Next.js production process,
and tunnel must be running and reachable. This token design does not remove
that infrastructure dependency.

## Error handling

The token endpoint returns:

- `invalid_grant` for unusable authorization codes or refresh tokens;
- `invalid_client` for an unknown or mismatched client;
- `unsupported_grant_type` for unsupported grant types; and
- `503 mcp_not_configured` when the allowed user is not configured.

Responses remain non-cacheable and do not include internal failure details.

## Testing

Use test-driven development for each behavior:

- authorization-code exchange issues both tokens with the configured TTLs;
- stored records contain hashes, not raw tokens;
- refresh rotates both tokens and preserves the family;
- the previous refresh token cannot be used again;
- replay revokes the family and its access tokens;
- expired, revoked, unknown, user-mismatched, and client-mismatched tokens
  return `invalid_grant`;
- legacy access tokens remain valid until their existing expiration;
- token endpoint responses use the OAuth fields expected by ChatGPT;
- concurrent refresh attempts yield exactly one success;
- Learning and Architecture bearer authentication continue to work with
  refreshed access tokens.

After focused tests pass, run the complete unit suite, typecheck, lint, and
production build. Perform a live ChatGPT reconnection and verify that a refresh
grant succeeds without a Skill Compass browser session.

## Rollout

1. Deploy the additive database migration and refresh-capable server code.
2. Set the production access and refresh TTL environment values.
3. Restart the Next.js production process.
4. Reconnect Learning and Architecture once so ChatGPT receives refresh tokens.
5. Confirm a refresh exchange rotates the token and leaves both MCP resources
   usable.
6. Keep legacy access-token validation until all old 30-day tokens have expired.

Rollback leaves the additive schema in place and restores the prior token
endpoint behavior. Already-issued one-hour access tokens continue until expiry;
users then reconnect after the refresh-capable version is restored.
