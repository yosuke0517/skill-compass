# This resource owns only the staging Worker's service metadata. Wrangler owns
# versions, code uploads, deployments, and application bindings.
resource "cloudflare_worker" "staging" {
  count = local.is_staging ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = var.worker_name
  tags = [
    "application:skill-compass",
    "environment:staging",
  ]

  subdomain = {
    enabled          = true
    previews_enabled = false
  }
}
