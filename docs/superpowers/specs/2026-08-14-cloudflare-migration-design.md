# Skill Compass Cloudflare Migration Design

## 1. Purpose

Move Skill Compass production off the Mac mini so that Web, MCP, Today, X technical news, OAuth, and eventually Podcast generation remain available when the Mac is stopped, restarted, or unhealthy.

The migration must:

- preserve `https://agent.finegate.xyz` as the production origin and MCP issuer;
- minimize recurring cost by using Cloudflare's free allowances where practical;
- manage infrastructure as code;
- use staging before production;
- keep the current Mac deployment available as a temporary fallback during cutover;
- preserve user-scoped learning data, OAuth state, X connections, and existing R2 Podcast assets;
- provide a mobile-readable, authenticated migration document inside Skill Compass.

## 2. Target Architecture

| Responsibility | Target |
|---|---|
| Next.js Web application | Cloudflare Workers through OpenNext |
| Learning and Architecture MCP endpoints | The same Cloudflare Worker application |
| Relational state | Cloudflare D1 |
| Podcast audio | Existing Cloudflare R2 bucket |
| Podcast jobs | Cloudflare Queues and a dead-letter queue |
| Scheduled Podcast enqueueing | Cloudflare Cron Triggers |
| Runtime secrets | Workers Secrets |
| DNS and custom domain | Cloudflare DNS and Worker routing |
| Infrastructure definitions | Terraform |
| Terraform execution | GitHub Actions |
| Terraform state | HCP Terraform remote state only |
| Application deployment and operational commands | Wrangler |
| D1 schema migrations | Drizzle-generated SQLite migrations applied with Wrangler |

The Mac mini remains a development machine and temporary read-only fallback. It is not part of the final production request path.

## 3. Environments

Two isolated environments are required.

### 3.1 Staging

- Initially exposed through a `workers.dev` URL.
- Uses a distinct Worker, D1 database, configuration, bindings, Secrets, and test data.
- Uses a staging GitHub Environment.
- Uses a dedicated staging R2 bucket so tests cannot write to or delete production objects.
- Must not receive production OAuth tokens or production user secrets.

### 3.2 Production

- Uses `agent.finegate.xyz`.
- Uses its own Worker, D1 database, Secrets, bindings, Queue, and HCP Terraform workspace.
- Reuses the existing production Podcast R2 bucket by importing it into Terraform rather than recreating it.
- Uses a protected GitHub Environment that requires manual approval.

HCP Terraform workspaces:

```text
skill-compass-staging
skill-compass-production
```

## 4. Infrastructure Ownership

The repository must document a single owner for every class of change. Terraform and Wrangler must not manage the same resource lifecycle.

### 4.1 Terraform owns

- D1 databases;
- R2 buckets;
- Queues and dead-letter queues;
- Cron Triggers;
- DNS records and Worker custom-domain routing;
- environment-specific resource names and lifecycle protection;
- observability and security configuration supported by the Cloudflare provider.

Existing Cloudflare resources, including the production R2 bucket and relevant DNS records, must be imported. Destructive replacement of production D1 or R2 resources must be blocked with lifecycle protection.

### 4.2 Wrangler owns

- OpenNext build and Worker application deployment;
- application binding declarations that attach Terraform-created D1, R2, and Queue resources to the deployed Worker;
- local Workers-compatible preview;
- D1 migration execution;
- Workers Secret value registration and rotation;
- Worker log tailing and operational diagnostics.

Wrangler is an execution and deployment tool, not the source of truth for infrastructure lifecycle.
Terraform outputs the resource identifiers and names consumed by the deployment workflow. The workflow passes those values to Wrangler without committing a generated production configuration. Terraform never uploads application code, and Wrangler never creates or deletes the bound D1, R2, or Queue resources.

### 4.3 HCP Terraform owns

HCP Terraform is used only as the remote state backend. It stores encrypted state history and locks state during changes. It does not run `plan` or `apply` for this project.

GitHub Actions continues to execute:

```text
terraform init
terraform plan
terraform apply
```

Terraform state is the mapping and last-known snapshot connecting Terraform resource addresses to real Cloudflare resource identifiers. Before planning, Terraform refreshes this information against Cloudflare. State must never be committed to Git.

### 4.4 Secrets ownership

- Terraform declares infrastructure and non-sensitive bindings, not secret values.
- GitHub Environments hold deployment credentials needed by workflows.
- Wrangler registers application secret values as Workers Secrets.
- Staging workflows cannot read production secrets.
- Production deployment requires the production GitHub Environment.
- Local development uses an ignored `.dev.vars` file.

Initial production secrets include session signing, OAuth token encryption, Gemini, X OAuth, Google OAuth, and MCP configuration secrets. macOS Keychain is removed from the production runtime.

## 5. Repository Structure

```text
infra/cloudflare/
  versions.tf
  provider.tf
  d1.tf
  r2.tf
  queues.tf
  workers.tf
  dns.tf
  variables.tf
  outputs.tf
  environments/
    staging.tfvars
    production.tfvars

migrations/
wrangler.jsonc
open-next.config.ts

.github/workflows/
  ci.yml
  terraform-plan.yml
  deploy-staging.yml
  deploy-production.yml
```

Reusable Terraform modules may be introduced only where staging and production would otherwise duplicate a complete resource definition. The initial structure should remain small and explicit.

## 6. Branch and Deployment Strategy

Use trunk-based development.

- `main` is the only long-lived branch.
- Work occurs on short-lived `codex/*` or `feature/*` branches.
- There is no long-lived `staging` branch.
- Pull requests must pass application and infrastructure checks before merge.

### 6.1 Pull request checks

- unit and integration tests;
- type checking and linting;
- Next.js build;
- OpenNext build and Workers-compatible preview tests;
- Terraform format and validation;
- speculative Terraform plans for staging and production;
- static validation of D1 migrations;
- no `apply`, migration, Secret update, or deployment.

### 6.2 Merge to main

Merging to `main` automatically deploys that commit to staging:

1. apply staging Terraform;
2. apply staging D1 migrations;
3. build the OpenNext Worker;
4. deploy with Wrangler;
5. execute automated smoke and integration tests;
6. publish the deployed commit SHA and staging URL.

### 6.3 Production promotion

Production is never automatically updated by merging to `main`. A manual GitHub Actions dispatch selects a commit SHA that has passed staging.

The production GitHub Environment requires approval. After approval, the workflow:

1. verifies that the selected SHA has a successful staging deployment;
2. displays the fresh production Terraform plan;
3. applies production Terraform;
4. verifies a D1 recovery point or export;
5. applies backward-compatible D1 migrations;
6. builds and deploys the selected SHA with Wrangler;
7. runs public smoke tests;
8. records a GitHub Deployment referencing the exact SHA.

If newer changes enter `main` after staging verification, they must not be included in the production promotion unless separately verified.

## 7. Database Migration

The current MySQL schema must be translated to Drizzle's SQLite/D1 schema. MySQL-specific behavior must be identified with tests before replacement. Areas requiring explicit review include enums, timestamp defaults, upsert behavior, affected-row assumptions, JSON columns, SQL expressions, indexes, and transaction boundaries.

Data migration includes:

- users and authentication data;
- sessions where preservation is safe and necessary;
- Today assignments, questions, answers, reasoning, optional confidence, scores, and self-assessments;
- sources and user-scoped configuration;
- Podcast settings, jobs, episodes, chunks, assets, and chat history;
- OAuth clients, authorization state, access tokens, refresh-token families, and rotation metadata;
- encrypted X and Google OAuth tokens;
- application audit and job state required for continuity.

Migration tooling must be deterministic and repeatable. It must support a dry run, redact secrets from logs, compare source and destination counts, validate primary and foreign-key relationships, and produce a machine-readable report.

Schema evolution follows `expand -> migrate -> contract`. Production migrations must be backward compatible with the previously deployed Worker. Destructive cleanup occurs only in a later deployment after application compatibility is confirmed.

## 8. Production Cutover and Rollback

The project is currently single-user, so cutover uses a short maintenance window rather than dual writes.

1. Put the Mac application into read-only maintenance mode.
2. Take a final MySQL backup.
3. Export and import the final data delta into production D1.
4. Verify counts, identifiers, OAuth records, learning progress, and Podcast asset references.
5. Deploy the production Worker.
6. Route `agent.finegate.xyz` to the Worker.
7. verify login, OAuth, MCP, Today, X news, and Podcast playback;
8. enable writes on the Cloudflare application.

The Mac application and MySQL remain unchanged and read-only for an observation period. Before Cloudflare accepts new writes, routing can be restored to the Mac. After Cloudflare accepts new writes, rollback requires an explicit data reconciliation decision and must not silently return traffic to stale MySQL data.

The production domain and MCP issuer remain unchanged to minimize ChatGPT reconnection. Session signing and token-encryption secrets must be preserved so migrated encrypted records remain readable. Reauthentication procedures must still be documented and tested.

## 9. Phase 1: Web, Learning, MCP, OAuth, and X

Phase 1 moves:

- the authenticated Next.js application;
- login and session handling;
- Today, scoring, skills, history, and sources;
- Learning and Architecture MCP endpoints;
- MCP OAuth authorization and refresh-token rotation;
- X post lookup and daily technical news;
- Podcast listing, chat, and playback of existing R2 assets;
- the authenticated migration documentation.

Phase 1 does not generate new Podcast audio in Cloudflare. Existing Podcast metadata is migrated, and the five ready R2-backed episodes must remain playable.

Phase 1 completes only when the Mac can be unavailable without affecting the Web application, Today, X, MCP, OAuth, or existing Podcast playback.

## 10. Phase 2: Podcast Generation

Phase 2 replaces the local polling worker with Cloudflare-native execution.

- Cron Trigger identifies due user schedules and enqueues idempotent jobs.
- Manual generation uses the same enqueue interface.
- Queue consumers generate scripts and enqueue audio chunks.
- Chunk consumers call Gemini TTS and store chunk audio in R2.
- Finalization combines or assembles the completed asset in a Workers-compatible way and updates D1.
- A dead-letter queue retains jobs that exceed retry limits.
- D1 stores status, attempts, error codes, timestamps, and idempotency keys.
- Workers Secrets provide Gemini and connected-service credentials.

Queue handlers must be idempotent because messages may be retried. A retry must not create a duplicate episode, duplicate asset, or repeated external side effect.

Phase 2 completes when a daily and a manually requested Podcast can be generated with the Mac turned off.

## 11. Authenticated Mobile Migration Documentation

Skill Compass provides:

```text
/docs/cloud-migration
```

The page must be responsive and readable on mobile. It contains:

- current and target architecture;
- migration phases and current progress;
- Terraform, Wrangler, HCP Terraform, GitHub Actions, and Workers Secrets responsibilities;
- branch and deployment strategy;
- staging verification checklist;
- production approval and rollback procedure;
- security and cost considerations.

The route requires authentication. An unauthenticated request redirects to:

```text
/login?next=%2Fdocs%2Fcloud-migration
```

After successful authentication, the user returns to the original internal path. The login page must preserve `next` through validation errors and must also honor it when the user is already authenticated.

Redirect validation accepts only application-internal paths beginning with exactly one `/`. Absolute URLs, protocol-relative URLs, backslashes, control characters, and malformed encodings fall back to `/dashboard`. This prevents open redirects.

Codex can then return the HTTPS link directly in chat for mobile access.

## 12. Security Controls

- Cloudflare API Tokens use the minimum permissions needed by each workflow.
- Staging and production credentials are separate.
- Production workflows use protected GitHub Environments.
- Secret values never enter Terraform configuration, Terraform state, logs, artifacts, or committed files.
- D1 and R2 production resources have deletion protection in Terraform.
- OAuth tokens remain encrypted at rest in D1.
- MCP user scoping and allowlisted-owner checks remain enforced after migration.
- Migration logs contain identifiers and counts only where necessary and redact credentials, tokens, answer reasoning, and personal data.
- Public smoke tests must not mutate learning state.
- Dependency and OpenNext versions are pinned and security updates are reviewed before production promotion.

## 13. Failure Handling and Observability

- A failed staging deployment prevents production promotion.
- A failed Terraform apply stops before migration or application deployment.
- A failed migration stops the Worker deployment.
- A failed Worker deployment leaves the prior production version active.
- Public smoke-test failure marks the deployment failed and surfaces the previous-version rollback action.
- Queue retries are bounded and terminate in a dead-letter queue.
- Cloudflare Worker logs and deployment identifiers include environment and commit SHA.
- GitHub Actions summaries link the Terraform plan, Worker deployment, migration result, and smoke-test result.

## 14. Verification

### Automated

- existing unit and integration suite on Node.js;
- Workers-compatible OpenNext preview suite;
- MySQL-to-D1 migration fixture tests;
- D1 schema and query contract tests;
- login `next` redirect security tests;
- MCP initialize, tools/list, read, and controlled write tests;
- OAuth authorization code and refresh rotation tests;
- X provider fallback and rate-limit tests;
- R2 existing-asset playback tests;
- Terraform format, validate, and speculative plans;
- production public smoke tests.

### Manual staging checklist

- mobile login and `/docs/cloud-migration` display;
- redirect back to the requested authenticated page;
- Today display, answer, scoring, and history;
- temporary ChatGPT connection to staging MCP;
- `get_today`, `submit_today_answer`, `get_x_post`, and `get_daily_tech_posts`;
- OAuth callbacks and token refresh;
- existing Podcast playback and download;
- no production secrets or data visible from staging.

## 15. Completion Criteria

The migration is complete when:

- Web, Today, MCP, OAuth, X news, and existing Podcast playback work with the Mac powered off;
- new Podcast generation also works with the Mac powered off after Phase 2;
- merging to `main` automatically deploys the exact commit to staging;
- a verified staging commit can be manually approved and promoted to production;
- Terraform reports no unexplained production drift;
- GitHub Actions can reproduce both infrastructure and application deployments;
- Terraform state is remote, encrypted, versioned, and locked;
- production data and R2 assets have verified recovery procedures;
- the Tunnel and local production LaunchAgents can be retired without service impact.
