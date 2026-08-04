output "tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.comunora.id
}

output "tunnel_cname" {
  value = "${cloudflare_zero_trust_tunnel_cloudflared.comunora.id}.cfargotunnel.com"
}

output "tunnel_token" {
  description = "Gravar em /etc/comunora/env/cloudflared.env como TUNNEL_TOKEN."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.comunora.token
  sensitive   = true
}

output "staging_urls" {
  value = [for hostname in values(local.staging_hosts) : "https://${hostname}"]
}
