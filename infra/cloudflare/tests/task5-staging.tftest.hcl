mock_provider "cloudflare" {}

run "staging_plan_contains_only_staging_resources" {
  command = plan

  variables {
    cloudflare_account_id = "11111111111111111111111111111111"
    cloudflare_zone_id    = "22222222222222222222222222222222"
    environment           = "staging"
    worker_name           = "skill-compass-cloudflare-staging"
    d1_database_name      = "skill-compass-staging"
    r2_bucket_name        = "skill-compass-audio-staging"
    protect_d1_data       = false
    protect_r2_data       = false
  }

  assert {
    condition = (
      length(cloudflare_d1_database.staging) == 1 &&
      length(cloudflare_r2_bucket.staging) == 1 &&
      length(cloudflare_worker.staging) == 1
    )
    error_message = "The staging plan must create one staging D1 database, R2 bucket, and Worker metadata resource."
  }

  assert {
    condition = (
      length(cloudflare_d1_database.production) == 0 &&
      length(cloudflare_r2_bucket.production) == 0
    )
    error_message = "The staging plan must not contain production D1 or R2 resource instances."
  }

  assert {
    condition = (
      cloudflare_worker.staging[0].name == "skill-compass-cloudflare-staging" &&
      cloudflare_worker.staging[0].subdomain.enabled &&
      !cloudflare_worker.staging[0].subdomain.previews_enabled
    )
    error_message = "Terraform must own only the staging Worker metadata and workers.dev availability."
  }
}

run "staging_rejects_the_verified_production_r2_name" {
  command = plan

  variables {
    cloudflare_account_id = "11111111111111111111111111111111"
    cloudflare_zone_id    = "22222222222222222222222222222222"
    environment           = "staging"
    worker_name           = "skill-compass-cloudflare-staging"
    d1_database_name      = "skill-compass-staging"
    r2_bucket_name        = "skill-compass-podcast-dev"
    protect_d1_data       = false
    protect_r2_data       = false
  }

  expect_failures = [check.resource_names_match_environment]
}
