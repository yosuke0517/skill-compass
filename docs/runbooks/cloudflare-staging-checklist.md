# Cloudflare staging verification

Run this checklist against the exact commit intended for production. Record only pass/fail, counts, commit SHA, Worker version, and migration version; never record passwords, cookies, OAuth codes, access/refresh tokens, personal Podcast text, or X credentials.

Production deployment copies `SESSION_SECRET`, `X_OAUTH_CLIENT_ID`, and
`X_OAUTH_CLIENT_SECRET` from the protected GitHub `production` environment into
Worker secrets. Secret values must never be committed to Wrangler or Terraform
configuration. The X callback remains
`https://agent.finegate.xyz/api/integrations/x/callback` so it starts reaching
Cloudflare only when the custom domain is cut over.

## Automated read-only checks

- `/login` returns 200 and authenticated redirect targets remain same-origin.
- Login reaches the requested page.
- Today renders exactly five questions and the smoke test never presses **Submit answer**.
- Podcast renders safely when no production episodes have been copied.
- OAuth authorization-server metadata uses the staging issuer.
- Unauthenticated MCP initialize returns 401 with protected-resource metadata.
- With an ephemeral staging bearer, MCP initialize and tools/list expose the expected allowlisted tools.
- When staging X OAuth is explicitly connected, `get_x_post` returns the X Article body; otherwise record `not_configured`, never fabricate content.

## Manual mobile checks

- Open the workers.dev staging URL on mobile and log in with the staging-only account.
- Confirm Dashboard and Today fit the viewport without horizontal scrolling.
- Confirm five question navigation buttons are usable.
- Confirm Podcast empty state is understandable.
- Confirm `/docs/cloud-migration?source=mobile` returns to the same URL after login.

## Mutation checks (separate approval)

OAuth registration/consent/token refresh, Today submission, Podcast chat, and X reconnection create state. Run them only with dedicated staging credentials and an explicit mutation-test flag. Delete or revoke generated test records after evidence is captured.

## Release evidence

- Commit SHA
- Staging URL and Worker version
- D1 migration filename/checksum
- Terraform plan digest with zero production resources
- Unit/type/lint results
- Playwright and MCP smoke pass/fail
- Mobile checklist pass/fail
