locals {
  workspace_environments = {
    skill-compass-staging    = "staging"
    skill-compass-production = "production"
  }

  expected_workspace = "skill-compass-${var.environment}"
  selected_environment = lookup(
    local.workspace_environments,
    terraform.workspace,
    null,
  )

  is_production = var.environment == "production"
  is_staging    = var.environment == "staging"

  verified_production_r2_bucket_name = "skill-compass-podcast-dev"

  resource_names = {
    worker      = var.worker_name
    d1_database = var.d1_database_name
    r2_bucket   = var.r2_bucket_name
  }
}

check "workspace_matches_environment" {
  assert {
    condition     = local.selected_environment == var.environment
    error_message = "TF_WORKSPACE must select ${local.expected_workspace} when environment is ${var.environment}."
  }
}

check "resource_names_match_environment" {
  assert {
    condition = local.is_staging ? (
      alltrue([
        for name in values(local.resource_names) :
        can(regex("(^|[-_])staging($|[-_])", name)) &&
        !can(regex("(^|[-_])production($|[-_])", name))
      ]) && var.r2_bucket_name != local.verified_production_r2_bucket_name
      ) : (
      alltrue([
        for name in [var.worker_name, var.d1_database_name] :
        can(regex("(^|[-_])production($|[-_])", name)) &&
        !can(regex("(^|[-_])staging($|[-_])", name))
      ]) && var.r2_bucket_name == local.verified_production_r2_bucket_name
    )
    error_message = "Worker, D1, and R2 names must identify only the selected ${var.environment} environment."
  }
}
