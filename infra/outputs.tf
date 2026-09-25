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
