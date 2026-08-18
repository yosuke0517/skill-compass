mock_provider "cloudflare" {}

run "production_reserves_the_verified_existing_r2_for_future_import" {
  command = plan

  variables {
    cloudflare_account_id = "11111111111111111111111111111111"
    cloudflare_zone_id    = "22222222222222222222222222222222"
    environment           = "production"
    worker_name           = "skill-compass-cloudflare-production"
    d1_database_name      = "skill-compass-production"
    r2_bucket_name        = "skill-compass-podcast-dev"
    protect_d1_data       = true
    protect_r2_data       = true
  }

  assert {
    condition = (
      length(cloudflare_d1_database.staging) == 0 &&
      length(cloudflare_r2_bucket.staging) == 0 &&
      length(cloudflare_worker.staging) == 0 &&
      length(cloudflare_d1_database.production) == 1 &&
      length(cloudflare_r2_bucket.production) == 1 &&
      length(cloudflare_worker.production) == 1 &&
      cloudflare_worker.production[0].subdomain.enabled == true &&
      cloudflare_r2_bucket.production[0].name == "skill-compass-podcast-dev"
    )
    error_message = "The production declaration must reserve only the verified existing R2 bucket for future import."
  }
}
