resource "cloudflare_d1_database" "staging" {
  count = local.is_staging ? 1 : 0

  account_id            = var.cloudflare_account_id
  name                  = var.d1_database_name
  primary_location_hint = "apac"
}

resource "cloudflare_d1_database" "production" {
  count = local.is_production ? 1 : 0

  account_id            = var.cloudflare_account_id
  name                  = var.d1_database_name
  primary_location_hint = "apac"

  lifecycle {
    prevent_destroy = true
  }
}
