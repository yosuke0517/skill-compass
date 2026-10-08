# Interview relay

Isolated Node WebSocket service; never imported into the Cloudflare Worker. See `../../docs/features/admin-interview.md` for local setup, protocol boundaries, tests, and unverified cloud steps.

Defaults to loopback mock mode. Google mode requires explicit server configuration and a successful, authenticated Worker ticket redemption before provider creation. Local mock tokens use a disposable RSA fixture; they are not Google credentials. No token, audio, or transcript is logged or persisted.

`npm ci`, `npm run typecheck`, `npm test`. For local operation, use the parent setup script and `node --env-file=../../.private/interview/relay.env --import tsx src/index.ts`.

The Dockerfile is a build recipe only. No image has been published or deployed.
