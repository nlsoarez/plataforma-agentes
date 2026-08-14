locals {
  production_hosts = [
    "app.${var.zone_name}",
    "api.${var.zone_name}",
    "evolution.${var.zone_name}",
    "relay.${var.zone_name}",
  ]
  staging_hosts = {
    staging-app       = "staging-app.${var.zone_name}"
    staging-api       = "staging-api.${var.zone_name}"
    staging-evolution = "staging-evolution.${var.zone_name}"
    staging-relay     = "staging-relay.${var.zone_name}"
  }
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "comunora" {
  account_id = var.cloudflare_account_id
  name       = var.tunnel_name
  config_src = "cloudflare"
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "comunora" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.comunora.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "comunora" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.comunora.id
  source     = "cloudflare"

  config = {
    ingress = concat(
      [for hostname in concat(local.production_hosts, values(local.staging_hosts)) : {
        hostname = hostname
        service  = "http://gateway:8080"
      }],
      [{ service = "http_status:404" }]
    )
  }
}

resource "cloudflare_dns_record" "staging" {
  for_each = local.staging_hosts

  zone_id = var.cloudflare_zone_id
  name    = each.key
  content = "${cloudflare_zero_trust_tunnel_cloudflared.comunora.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
  ttl     = 1
  comment = "Comunora OCI staging; gerenciado por Terraform"
}
