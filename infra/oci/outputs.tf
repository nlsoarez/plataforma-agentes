output "server_public_ip" {
  description = "IP publico usado somente para SSH administrativo."
  value       = oci_core_instance.comunora.public_ip
}

output "ssh_command" {
  value = "ssh ubuntu@${oci_core_instance.comunora.public_ip}"
}

output "backup_bucket" {
  value = oci_objectstorage_bucket.backups.name
}

output "object_storage_namespace" {
  value = data.oci_objectstorage_namespace.current.namespace
}

output "data_volume_attachment" {
  value = oci_core_volume_attachment.data.id
}
