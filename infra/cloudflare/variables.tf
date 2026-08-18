variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the environment resources."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "cloudflare_account_id must be a 32-character lowercase hexadecimal Cloudflare account ID."
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for agent.finegate.xyz."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_zone_id))
    error_message = "cloudflare_zone_id must be a 32-character lowercase hexadecimal Cloudflare zone ID."
  }
}

variable "environment" {
  description = "Deployment environment represented by the selected HCP Terraform workspace."
  type        = string
  nullable    = false

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production."
  }
}

variable "worker_name" {
  description = "Cloudflare Worker service name for this environment."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.worker_name))
    error_message = "worker_name must contain 1-63 lowercase letters, numbers, or hyphens and must start and end with a letter or number."
  }
}

variable "d1_database_name" {
  description = "Cloudflare D1 database name for this environment."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$", var.d1_database_name))
    error_message = "d1_database_name must contain 2-64 lowercase letters, numbers, underscores, or hyphens and must start and end with a letter or number."
  }
}

variable "r2_bucket_name" {
  description = "Cloudflare R2 bucket name for this environment."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.r2_bucket_name))
    error_message = "r2_bucket_name must contain 3-63 lowercase letters, numbers, or hyphens and must start and end with a letter or number."
  }
}

variable "protect_d1_data" {
  description = "Selects the protected D1 resource path when resources are declared. Production cannot disable it."
  type        = bool
  default     = true

  validation {
    condition     = var.environment != "production" || var.protect_d1_data
    error_message = "protect_d1_data must be true for production."
  }
}

variable "protect_r2_data" {
  description = "Selects the protected R2 resource path when resources are declared. Production cannot disable it."
  type        = bool
  default     = true

  validation {
    condition     = var.environment != "production" || var.protect_r2_data
    error_message = "protect_r2_data must be true for production."
  }
}
