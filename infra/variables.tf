variable "project_id" {
  type        = string
  description = "Google Cloud project."
}

variable "region" {
  type        = string
  default     = "africa-south1"
  description = <<-EOT
    Primary region.

    The programme's intent is that citizen data stays in the Democratic Republic
    of the Congo. There is no cloud region in the country, so the pilot runs from
    the nearest available one — Johannesburg — and migrates when an in-country
    option exists. Same continent, materially better latency to Kinshasa than
    Europe, and an easier transfer argument to make.

    Whatever is chosen here, set data_residency and deployment_jurisdiction to
    match: a region is not a jurisdiction, and the platform will not infer one
    from the other.
  EOT
}

variable "deployment_jurisdiction" {
  type        = string
  default     = "ZA"
  description = "ISO 3166-1 alpha-2 country the region above is in. Declared, never guessed."
}

variable "data_residency" {
  type        = list(string)
  default     = ["ZA", "US"]
  description = <<-EOT
    Jurisdictions this deployment may send citizen data to.

    A destination outside this list is never registered, so no ordering, retry or
    fallback can reach it. The default is the pilot's honest posture: hosted in
    South Africa, with AI providers and telephony in the United States.

    ["CD"] is the strictest setting. It refuses every remote provider: the
    platform still triages by protocol, detects danger signs, grades severity and
    speaks the fixed emergency scripts — none of that ever used a model — but it
    stops understanding free speech. See docs/DATA_RESIDENCY.md.
  EOT
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

# ── The web domain ───────────────────────────────────────────────────────────

variable "domain" {
  type        = string
  default     = ""
  description = <<-EOT
    The domain citizens type, without a scheme: congovoicecd.com.

    Leave it empty and the service answers only on its generated run.app URL,
    which is fine for staging and wrong for anything else: canonical links, the
    sitemap, social images and — the one that breaks silently — the telephony
    provider's webhook signatures are all computed against the public origin.
  EOT
}

variable "manage_dns" {
  type        = bool
  default     = false
  description = <<-EOT
    Whether Terraform owns the DNS zone for `domain`.

    False when the zone lives with a registrar or a ministry's own DNS, which is
    the common case for a .cd domain: Terraform then creates the domain mapping
    and prints the records to add by hand.
  EOT
}

variable "dns_zone_name" {
  type        = string
  default     = ""
  description = "Existing Cloud DNS managed-zone name, when manage_dns is true."
}
