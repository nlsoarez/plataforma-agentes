variable "cloudflare_api_token" {
  description = "Token com Cloudflare Tunnel Edit e Zone DNS Edit."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "zone_name" {
  type    = string
  default = "comunora.com.br"
}

variable "tunnel_name" {
  type    = string
  default = "comunora-oci-production"
}
