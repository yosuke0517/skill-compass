terraform {
  required_version = "~> 1.13.0"

  cloud {
    organization = "yosuke-skill-compass"

    workspaces {
      tags = {
        application = "skill-compass"
        component   = "cloudflare"
      }
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22.0"
    }
  }
}
