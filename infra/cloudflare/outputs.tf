output "worker_name" {
  description = "Worker service name consumed by the Wrangler deployment workflow."
  value       = local.resource_names.worker
}

output "d1_database_id" {
  description = "D1 database ID consumed by Wrangler. Populated when Task 5 declares the database resource."
  value       = null
}

output "r2_bucket_name" {
  description = "R2 bucket name consumed by the Wrangler deployment workflow."
  value       = local.resource_names.r2_bucket
}

output "staging_url" {
  description = "Staging workers.dev URL. Populated when Task 5 declares the Worker service metadata."
  value       = null
}
