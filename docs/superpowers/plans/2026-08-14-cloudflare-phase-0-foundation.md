# Cloudflare Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish authenticated mobile migration documentation, safe login return paths, OpenNext compatibility, Terraform remote state, staging infrastructure, and merge-to-main staging deployment without changing production traffic.

**Architecture:** Keep the Mac deployment on `agent.finegate.xyz` while a separate Cloudflare staging Worker is built and deployed. GitHub Actions executes Terraform and Wrangler; HCP Terraform stores state only. Terraform creates resource lifecycles, while Wrangler builds and deploys application code and applies D1 migrations.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Playwright, OpenNext Cloudflare adapter, Wrangler, Terraform Cloudflare Provider 5.x, HCP Terraform, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-14-cloudflare-migration-design.md`

## Global Constraints

- `agent.finegate.xyz` continues routing to the Mac throughout Phase 0.
- `main` is the only long-lived branch; merging to it deploys staging automatically.
- Production deployment is not introduced until Phase 1.
- HCP Terraform uses local execution mode and acts only as encrypted remote state with locking.
- Terraform state and secret values must never be committed.
- Existing unrelated working-tree changes must remain untouched.

---

### Task 1: Safe internal return paths

**Files:**
- Create: `src/lib/auth/safe-return-path.ts`
- Create: `tests/unit/safe-return-path.test.ts`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/actions/auth.ts`
- Modify: `tests/unit/login-page.test.tsx`
- Modify: `tests/unit/auth.test.ts`

**Interfaces:**
- Produces: `safeReturnPath(value: string | null | undefined): string`
- Consumes: hidden form field `next`

- [ ] Write failing tests asserting `/docs/cloud-migration?from=chat` is preserved and `https://evil.example`, `//evil.example`, `/\\evil`, control characters, invalid encodings, and empty values return `/dashboard`.
- [ ] Run `node_modules/.bin/vitest run tests/unit/safe-return-path.test.ts` and verify failure because the module does not exist.
- [ ] Implement `safeReturnPath` using a single leading slash requirement, explicit rejection of a second slash or backslash, control-character rejection, and a `URL` parse against `https://skill-compass.invalid` whose origin and reconstructed path must remain internal.
- [ ] Update the login page search-parameter type to include `next`, redirect an authenticated session through `safeReturnPath(params?.next)`, and include `<input type="hidden" name="next" value={safeReturnPath(params?.next)} />`.
- [ ] Update `loginAction` to preserve the sanitized path in invalid-login redirects and to redirect to it after setting the cookie.
- [ ] Run the four focused test files and verify all return-path and prior authentication tests pass.
- [ ] Commit with `git commit -m "feat: preserve safe login return paths"`.

### Task 2: Authenticated mobile migration page

**Files:**
- Create: `src/app/(app)/docs/cloud-migration/page.tsx`
- Create: `src/components/docs/cloud-migration-view.tsx`
- Create: `src/lib/docs/cloud-migration.ts`
- Create: `tests/unit/cloud-migration-doc.test.tsx`
- Create: `tests/e2e/cloud-migration.spec.ts`
- Modify: `src/proxy.ts`
- Modify: `src/app/globals.css`
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Produces: authenticated route `/docs/cloud-migration`
- Produces: `getCloudMigrationDocument(): CloudMigrationDocument`

- [ ] Write a failing unit test requiring sections for current architecture, target architecture, Terraform/Wrangler/HCP/GHA responsibilities, phase progress, staging checks, production approval, rollback, security, and cost.
- [ ] Write an E2E test that requests `/docs/cloud-migration` anonymously, expects `/login?next=%2Fdocs%2Fcloud-migration`, logs in, and expects return to the document.
- [ ] Run both tests and confirm failures for the missing route and proxy matcher.
- [ ] Implement a typed document model backed by the approved design, render semantic headings and compact architecture flows, and add a navigation link.
- [ ] Add `/docs/:path*` to the proxy matcher and responsive styles that do not require horizontal scrolling at 390 CSS pixels.
- [ ] Run unit and E2E tests at desktop and mobile Playwright viewports.
- [ ] Commit with `git commit -m "feat: add authenticated migration guide"`.

### Task 3: OpenNext compatibility baseline

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `open-next.config.ts`
- Create: `wrangler.jsonc`
- Create: `cloudflare-env.d.ts`
- Modify: `next.config.ts`
- Modify: `.gitignore`
- Create: `tests/integration/cloudflare-runtime-contract.test.ts`
- Create: `docs/runbooks/cloudflare-local-preview.md`

**Interfaces:**
- Produces scripts: `preview:cloudflare`, `build:cloudflare`, `deploy:cloudflare`, `cf:typegen`
- Produces bindings: `DB`, `PODCAST_AUDIO`

- [ ] Write a failing runtime-contract test that scans production imports and rejects `node:child_process`, macOS Keychain access, and filesystem-backed storage from Cloudflare request paths.
- [ ] Add pinned compatible versions of `@opennextjs/cloudflare` and `wrangler`, then generate and commit Cloudflare binding types.
- [ ] Configure `nodejs_compat`, static assets, environment-specific names, D1 binding `DB`, and R2 binding `PODCAST_AUDIO`; do not configure the production custom domain.
- [ ] Make keychain and filesystem providers fail closed in Cloudflare runtime while retaining them for Mac development until Phase 1.
- [ ] Run `pnpm build:cloudflare` and `pnpm preview:cloudflare`; verify `/login`, OAuth metadata, and unauthenticated `/docs/cloud-migration` locally.
- [ ] Document local `.dev.vars`, preview commands, and the fact that production secrets are never copied into local files by automation.
- [ ] Run the full Node test suite, typecheck, lint, Next build, and OpenNext build.
- [ ] Commit with `git commit -m "build: add Cloudflare preview target"`.

### Task 4: Terraform and HCP remote-state foundation

**Files:**
- Create: `infra/cloudflare/versions.tf`
- Create: `infra/cloudflare/provider.tf`
- Create: `infra/cloudflare/variables.tf`
- Create: `infra/cloudflare/locals.tf`
- Create: `infra/cloudflare/outputs.tf`
- Create: `infra/cloudflare/environments/staging.tfvars`
- Create: `infra/cloudflare/environments/production.tfvars`
- Create: `infra/cloudflare/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes environment variables: `TF_TOKEN_app_terraform_io`, `TF_VAR_cloudflare_account_id`, `TF_VAR_cloudflare_zone_id`
- Produces outputs: `worker_name`, `d1_database_id`, `r2_bucket_name`, `staging_url`

- [ ] Create HCP organization `yosuke-skill-compass` and CLI-driven workspaces `skill-compass-staging` and `skill-compass-production`, both configured for local execution.
- [ ] Configure Terraform's `cloud` block with organization `yosuke-skill-compass` and workspace tags that select exactly one environment through `TF_WORKSPACE`.
- [ ] Pin Terraform to `~> 1.13` and Cloudflare Provider to the reviewed `~> 5.22` line; commit `.terraform.lock.hcl`.
- [ ] Declare typed account, zone, environment, and resource-name variables with validation accepting only `staging` or `production`.
- [ ] Add lifecycle protection inputs that are always enabled for production data resources.
- [ ] Run `terraform fmt -check -recursive`, `terraform init`, and `terraform validate` for both workspaces.
- [ ] Verify `.terraform/`, `*.tfstate*`, plan files, `.dev.vars*`, and generated deployment-value files are ignored.
- [ ] Commit with `git commit -m "infra: add Cloudflare Terraform foundation"`.

### Task 5: Staging D1 and R2 infrastructure

**Files:**
- Create: `infra/cloudflare/d1.tf`
- Create: `infra/cloudflare/r2.tf`
- Create: `infra/cloudflare/workers.tf`
- Modify: `infra/cloudflare/outputs.tf`
- Create: `migrations/0001_staging_bootstrap.sql`
- Create: `scripts/cloudflare/render-deploy-config.ts`
- Create: `tests/unit/render-cloudflare-config.test.ts`

**Interfaces:**
- Consumes Terraform JSON outputs
- Produces ignored `.cloudflare/deploy-values.json`

- [ ] Write a failing test for the deploy-config renderer requiring staging Worker, D1, and R2 values and rejecting production resource names in staging.
- [ ] Define distinct staging and production D1 databases and R2 buckets; production R2 remains declared but is not applied or imported during Phase 0.
- [ ] Define the staging Worker service metadata and `workers.dev` availability without uploading application code from Terraform.
- [ ] Implement the renderer so GitHub Actions can transform non-secret Terraform outputs into Wrangler deployment inputs.
- [ ] Run a staging speculative plan and verify it creates only staging resources.
- [ ] Apply staging, render deployment values, apply the bootstrap migration, and deploy the OpenNext staging Worker.
- [ ] Verify the staging R2 bucket cannot address the existing production bucket name.
- [ ] Commit with `git commit -m "infra: provision isolated Cloudflare staging"`.

### Task 6: GitHub Actions CI, plan, and staging deployment

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/terraform-plan.yml`
- Create: `.github/workflows/deploy-staging.yml`
- Create: `.github/actions/setup-project/action.yml`
- Create: `scripts/cloudflare/smoke.ts`
- Create: `tests/unit/cloudflare-smoke.test.ts`
- Create: `docs/runbooks/cloudflare-github-setup.md`

**Interfaces:**
- Consumes GitHub Environment `staging`
- Produces GitHub Deployment with environment URL and commit SHA

- [ ] Write a failing smoke-test unit test covering `/login`, `/docs/cloud-migration` redirect, OAuth protected-resource metadata, and read-only MCP reachability.
- [ ] Add a reusable setup action that installs the repository-pinned Node and pnpm versions with a dependency cache.
- [ ] Add `ci.yml` for tests, typecheck, lint, Next build, and OpenNext build on pull requests and main.
- [ ] Add `terraform-plan.yml` for fmt, validate, and non-applied staging and production plans on pull requests; upload sanitized plan text with a seven-day retention.
- [ ] Add `deploy-staging.yml` triggered by successful main CI, pinned to the triggering SHA, executing staging Terraform apply, migration, Wrangler deploy, and smoke tests in that order.
- [ ] Configure repository variables for Cloudflare account and zone IDs, and staging secrets for Cloudflare and HCP tokens; do not store application production secrets yet.
- [ ] Verify a test pull request cannot apply infrastructure and merging it deploys only staging.
- [ ] Commit with `git commit -m "ci: deploy main to Cloudflare staging"`.

### Task 7: Phase 0 operational handoff

**Files:**
- Modify: `docs/README.md`
- Create: `docs/runbooks/cloudflare-staging.md`
- Modify: `src/lib/mcp/architecture/manifest.ts`
- Modify: `tests/unit/mcp-architecture-manifest.test.ts`

**Interfaces:**
- Consumes the staging URL and GitHub Deployment record
- Produces the Phase 0 staging checklist

- [ ] Add a failing manifest test requiring the architecture MCP to distinguish current Mac production from Cloudflare staging and to describe Terraform/Wrangler ownership.
- [ ] Update the manifest and documentation without claiming production has migrated.
- [ ] Link the authenticated mobile guide and all operator runbooks from `docs/README.md`.
- [ ] Execute the staging checklist on mobile: login return path, guide rendering, OAuth metadata, and public non-mutating smoke checks.
- [ ] Run all 300+ tests, typecheck, lint, Next build, OpenNext build, Terraform validate, and staging smoke tests.
- [ ] Record the passing staging commit SHA in the guide, mark Phase 0 complete, and commit with `git commit -m "docs: complete Cloudflare foundation handoff"`.

