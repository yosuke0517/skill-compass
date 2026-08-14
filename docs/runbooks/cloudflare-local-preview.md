# Cloudflare local preview

This runbook builds Skill Compass with OpenNext and runs the resulting Worker locally. The preview environment uses Wrangler's local D1 and R2 simulations; it does not configure or attach a production custom domain.

## Prerequisites

- Node.js 24 (the repository is also compatible with supported Node.js 22 releases)
- Corepack with the repository's pinned pnpm version
- A working `pnpm` executable on `PATH` (`opennextjs-cloudflare` invokes `pnpm build` as a subprocess)
- Dependencies installed with `corepack pnpm install --frozen-lockfile`

## Local variables

Create `.dev.vars.preview` manually in the repository root. Use local development values only:

```dotenv
DATABASE_URL=mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass
SESSION_SECRET=replace-with-at-least-32-local-only-characters
PUBLIC_APP_URL=http://127.0.0.1:8787
MCP_ISSUER_URL=http://127.0.0.1:8787
MCP_RESOURCE_URL=http://127.0.0.1:8787/mcp
MCP_ARCHITECTURE_RESOURCE_URL=http://127.0.0.1:8787/mcp/architecture
```

Add any optional provider values only when the corresponding local workflow needs them. `.dev.vars` and `.dev.vars.*` are ignored by Git.

Automation must never read production secrets and copy them into `.dev.vars`, `.dev.vars.preview`, or any other local file. Enter local-only values manually. Keep production secrets in Cloudflare's secret store and manage them through an explicitly authorized production operation.

## Build and preview

Generate binding types after changing `wrangler.jsonc`:

```bash
corepack pnpm cf:typegen
```

Build the OpenNext Worker, then start its local preview:

```bash
corepack pnpm build:cloudflare
corepack pnpm preview:cloudflare
```

Wrangler reads `.dev.vars.preview` because the preview script selects the `preview` environment. It emulates the `DB` D1 binding and `PODCAST_AUDIO` R2 binding locally; neither binding connects to a remote Cloudflare resource.

## Smoke checks

With the preview listening on `http://127.0.0.1:8787`, run:

```bash
curl -i http://127.0.0.1:8787/login
curl -i http://127.0.0.1:8787/.well-known/oauth-authorization-server
curl -i http://127.0.0.1:8787/docs/cloud-migration
```

Expected results:

- `/login` returns `200`.
- `/.well-known/oauth-authorization-server` returns `200` JSON with the local issuer and OAuth endpoints.
- An unauthenticated `/docs/cloud-migration` request redirects to `/login?next=%2Fdocs%2Fcloud-migration`.

Stop the preview with `Ctrl-C`. The `deploy:cloudflare` script targets the named production environment, but deployment and production-domain routing are outside this local-preview procedure and require a separately authorized change.
