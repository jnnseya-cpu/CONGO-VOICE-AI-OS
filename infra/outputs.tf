output "service_url" {
  value       = google_cloud_run_v2_service.app.uri
  description = "Where the platform answers."
}

output "database_connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "For the Cloud SQL connector."
}

output "media_bucket" {
  value = google_storage_bucket.media.name
}

output "service_account" {
  value       = google_service_account.app.email
  description = "Grant this account access to anything the platform must reach."
}

output "secrets_to_populate" {
  value       = [for s in google_secret_manager_secret.app : s.secret_id]
  description = "Created empty. Add a version to each with: gcloud secrets versions add <id> --data-file=-"
}

output "domain" {
  value       = var.domain
  description = "The public origin citizens use. Empty means the service answers only on its run.app URL."
}

output "dns_records_to_create" {
  value = var.domain == "" || var.manage_dns ? [] : try(
    [for r in google_cloud_run_domain_mapping.app[0].status[0].resource_records : "${r.type} ${r.name} ${r.rrdata}"],
    ["mapping created; re-run terraform output once Cloud Run reports the records"],
  )
  description = <<-EOT
    The records to add at the registrar when Terraform does not own the zone.
    Add them, wait for the managed certificate to be issued, then run
    `npm run preflight -- https://<domain>` before sending anyone to it.
  EOT
}
