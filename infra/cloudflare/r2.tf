resource "cloudflare_r2_bucket" "staging" {
  count = local.is_staging ? 1 : 0

  account_id    = var.cloudflare_account_id
  location      = "apac"
  name          = var.r2_bucket_name
  storage_class = "Standard"
}

# The production bucket already exists. This address is reserved for a future,
# separately approved import; Phase 0 must never apply it as a create action.
resource "cloudflare_r2_bucket" "production" {
  count = local.is_production ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}
