# Cloudflare Terraform foundation

This directory owns Cloudflare infrastructure lifecycles. HCP Terraform stores encrypted state and provides locking, but every `plan` and `apply` runs locally in the invoking CLI (GitHub Actions in the deployment workflow). Wrangler owns application builds, deployments, bindings, migrations, and Workers Secrets; Terraform never uploads application code or secret values.

Phase 0 is staging-only. Do not run a production apply. The production values reserve the future resource names and require D1 and R2 protection; the existing production R2 bucket must be verified and imported before the first production apply.

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

The `protect_d1_data` and `protect_r2_data` inputs cannot be set to `false` when `environment` is `production`. Task 5 must route production resources through literal `lifecycle.prevent_destroy = true` blocks because Terraform lifecycle meta-arguments do not accept variable expressions.

`d1_database_id` and `staging_url` intentionally remain null in this foundation commit. Task 5 replaces them with real resource-derived outputs; no placeholder identifier or fabricated workers.dev hostname is exposed to deployment automation.
