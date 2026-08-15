# Cloudflare Terraform foundation

This directory owns Cloudflare infrastructure lifecycles. HCP Terraform stores encrypted state and provides locking, but every `plan` and `apply` runs locally in the invoking CLI (GitHub Actions in the deployment workflow). Wrangler owns application builds, versions, deployments, bindings, migrations, and Workers Secrets; Terraform never uploads application code or secret values. The `cloudflare_worker.staging` resource uses provider 5.22's metadata-only Worker API to own the service name, tags, and `workers.dev` setting without declaring Worker content or bindings.

Phase 0 is staging-only. Do not run a production apply. The production values reserve the future resource names and require D1 and R2 protection; the existing production R2 bucket must be verified and imported before the first production apply.

The environment-specific resource addresses are deliberately explicit:

| Environment | D1                                     | R2                                   | Worker metadata                |
| ----------- | -------------------------------------- | ------------------------------------ | ------------------------------ |
| Staging     | `cloudflare_d1_database.staging[0]`    | `cloudflare_r2_bucket.staging[0]`    | `cloudflare_worker.staging[0]` |
| Production  | `cloudflare_d1_database.production[0]` | `cloudflare_r2_bucket.production[0]` | Deferred until Phase 1         |

Production R2 is declaration-only in Phase 0. Do not apply or import it yet. Before the first authorized production plan, reconcile `environments/production.tfvars` with the actual bucket name, then import the existing bucket into `cloudflare_r2_bucket.production[0]`; never allow Terraform to recreate it.

## Required HCP Terraform setup

Create the HCP Terraform organization `yosuke-skill-compass` and these CLI-driven workspaces before initialization:

| Workspace | Execution mode | Required tags |
| --- | --- | --- |
| `skill-compass-staging` | Local | `application=skill-compass`, `component=cloudflare` |
| `skill-compass-production` | Local | `application=skill-compass`, `component=cloudflare` |

Local execution mode is required: HCP Terraform is state-only for this repository. The shared tags associate both workspaces with this configuration, and `TF_WORKSPACE` selects exactly one by name for each non-interactive command.

Authenticate without writing a token to the repository:

```sh
export TF_TOKEN_app_terraform_io='<HCP Terraform user or team token>'
```

## Cloudflare inputs

Account and zone IDs are passed as Terraform environment variables. A Cloudflare API token is not needed for `validate`, but is required by the provider for `plan` and `apply`.

```sh
export TF_VAR_cloudflare_account_id='<32-character account ID>'
export TF_VAR_cloudflare_zone_id='<32-character zone ID>'
export CLOUDFLARE_API_TOKEN='<scoped Cloudflare API token>'
```

Never put token or secret values in `.tfvars`, Terraform state, a plan file, or generated deployment values.

## Initialize and validate

Use the workspace name and matching environment file together:

```sh
export TF_WORKSPACE=skill-compass-staging
terraform -chdir=infra/cloudflare init -input=false
terraform -chdir=infra/cloudflare validate
terraform -chdir=infra/cloudflare plan -input=false -var-file=environments/staging.tfvars
```

Without Cloudflare credentials, the checked-in mocked-provider plan contract remains safe to run and proves the staging graph has exactly one staging D1 database, R2 bucket, and metadata-only Worker while production resource counts stay zero:

```sh
export TF_WORKSPACE=skill-compass-staging
terraform -chdir=infra/cloudflare test -filter=tests/task5-staging.tftest.hcl
```

Production validation uses the production workspace but must not be applied during Phase 0:

```sh
export TF_WORKSPACE=skill-compass-production
terraform -chdir=infra/cloudflare init -input=false
terraform -chdir=infra/cloudflare validate
terraform -chdir=infra/cloudflare plan -input=false -var-file=environments/production.tfvars
```

Run formatting from the repository root:

```sh
terraform -chdir=infra/cloudflare fmt -check -recursive
```

The `protect_d1_data` and `protect_r2_data` inputs cannot be set to `false` when `environment` is `production`. Production D1 and R2 use literal `lifecycle.prevent_destroy = true` blocks because Terraform lifecycle meta-arguments do not accept variable expressions.

## Render and deploy staging

After an authorized staging apply, render the non-secret Terraform outputs into the ignored Wrangler configuration. The renderer reads Terraform's JSON from standard input, requires the Worker name, D1 name and UUID, and R2 name to be explicitly non-sensitive, and rejects production or mixed staging/production names. It writes the file with owner-only permissions and relocates Worker and asset paths relative to the generated file.

```sh
terraform -chdir=infra/cloudflare output -json \
  | pnpm exec tsx scripts/cloudflare/render-deploy-config.ts
```

The result is `.cloudflare/deploy-values.json`. It contains no secret values and is ignored by Git. Use it only after the Terraform apply has returned real resource values:

```sh
pnpm build:cloudflare
pnpm exec wrangler d1 migrations apply DB \
  --config .cloudflare/deploy-values.json \
  --env staging \
  --remote
pnpm exec opennextjs-cloudflare deploy \
  --config .cloudflare/deploy-values.json \
  --env staging
```

Terraform exposes the real D1 ID, D1 name, R2 name, Worker name, and whether `workers.dev` is enabled. Provider 5.22 does not expose the account-wide workers.dev subdomain through `cloudflare_worker`, so `staging_url` remains null instead of fabricating a hostname; Wrangler reports the account-specific URL after the first deployment.
