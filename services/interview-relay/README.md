# Interview relay

Isolated Node WebSocket service; never imported into the Cloudflare Worker. See `../../docs/features/admin-interview.md` for local setup, protocol boundaries, tests, and unverified cloud steps.

Defaults to loopback mock mode. Google mode requires explicit server configuration and a successful, authenticated Worker ticket redemption before provider creation. Local mock tokens use a disposable RSA fixture; they are not Google credentials. No token or audio is persisted. Text history is recorded through the authenticated Worker only when the session explicitly opts in; see the parent guide for retention and rollout.

`npm ci`, `npm run typecheck`, `npm test`. For local operation, use the parent setup script and `node --env-file=../../.private/interview/relay.env --import tsx src/index.ts`.

The Dockerfile builds the independent relay. A source change does not update a running deployment; verify its revision and health contract before enabling new features.
