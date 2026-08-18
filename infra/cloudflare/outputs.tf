output "worker_name" {
  description = "Worker service name consumed by the Wrangler deployment workflow."
  value = local.is_staging ? (
    cloudflare_worker.staging[0].name
  ) : local.resource_names.worker
}

output "d1_database_name" {
  description = "D1 database name consumed by the Wrangler deployment workflow."
  value = local.is_staging ? (
    cloudflare_d1_database.staging[0].name
  ) : cloudflare_d1_database.production[0].name
}

output "d1_database_id" {
  description = "D1 database ID consumed by the Wrangler deployment workflow."
  value = local.is_staging ? (
    cloudflare_d1_database.staging[0].id
  ) : cloudflare_d1_database.production[0].id
}

output "r2_bucket_name" {
  description = "R2 bucket name consumed by the Wrangler deployment workflow."
  value = local.is_staging ? (
    cloudflare_r2_bucket.staging[0].name
  ) : cloudflare_r2_bucket.production[0].name
}

output "staging_workers_dev_enabled" {
  description = "Whether the staging Worker is available on its workers.dev subdomain."
  value = local.is_staging ? (
    cloudflare_worker.staging[0].subdomain.enabled
  ) : false
}

output "staging_url" {
  description = "Staging workers.dev URL. Wrangler reports the account-specific URL after deployment."
  value       = null
}
