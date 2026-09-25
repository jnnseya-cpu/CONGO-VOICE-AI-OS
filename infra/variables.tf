variable "project_id" {
  type        = string
  description = "Google Cloud project."
}

variable "region" {
  type        = string
  default     = "europe-west1"
  description = "Primary region. Chosen for latency to Kinshasa; revisit when a residency decision is taken."
}

variable "environment" {
  type        = string
  description = "dev, staging, pilot or prod."
  validation {
    condition     = contains(["dev", "staging", "pilot", "prod"], var.environment)
    error_message = "environment must be one of dev, staging, pilot, prod."
  }
}

variable "image" {
  type        = string
  description = "Container image, by digest rather than tag so a deploy is reproducible."
}

variable "public_url" {
  type        = string
  description = "Public origin, used for canonical links and provider callbacks."
}

variable "db_tier" {
  type    = string
  default = "db-custom-2-7680"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Application database password. Supply from a secret store, never a committed file."
}

variable "min_instances" {
  type        = number
  default     = 1
  description = "Never zero in an environment that answers calls: a cold start is a citizen waiting."
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "media_backstop_days" {
  type        = number
  default     = 400
  description = "Bucket-level backstop. The application deletes on its own schedule and audits it."
}

variable "secret_names" {
  type = list(string)
  default = [
    "session_secret",
    "data_encryption_key",
    "database_url",
    "cron_secret",
    "anthropic_api_key",
    "gemini_api_key",
    "openai_api_key",
  ]
  description = "Secret containers to create. Values are added by a person, never by Terraform."
}
