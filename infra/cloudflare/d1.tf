resource "cloudflare_d1_database" "staging" {
  count = local.is_staging ? 1 : 0

  account_id            = var.cloudflare_account_id
  name                  = var.d1_database_name
  primary_location_hint = "apac"

  # Cloudflare's D1 API rejects provider updates that send
  # read_replication=null while the beta field is not configured.
  # https://github.com/cloudflare/terraform-provider-cloudflare/issues/6309
  lifecycle {
    ignore_changes = [read_replication]
  }
}

resource "cloudflare_d1_database" "production" {
  count = local.is_production ? 1 : 0

  account_id            = var.cloudflare_account_id
  name                  = var.d1_database_name
  primary_location_hint = "apac"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [read_replication]
  }
}
