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
