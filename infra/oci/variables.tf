variable "compartment_ocid" {
  description = "OCID do compartment onde a infraestrutura sera criada."
  type        = string
}

variable "region" {
  description = "Regiao domestica OCI. Always Free deve permanecer na home region."
  type        = string
  default     = "sa-saopaulo-1"
}

variable "admin_cidr" {
  description = "IPv4/CIDR administrativo autorizado a acessar SSH, por exemplo 203.0.113.10/32."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.admin_cidr)) && var.admin_cidr != "0.0.0.0/0"
    error_message = "admin_cidr deve ser um CIDR especifico; 0.0.0.0/0 nao e permitido."
  }
}

variable "ssh_public_key" {
  description = "Conteudo da chave publica SSH do administrador."
  type        = string
  sensitive   = true
}

variable "instance_name" {
  description = "Nome da VM."
  type        = string
  default     = "comunora-prod"
}

variable "instance_shape" {
  description = "Shape ARM64 Always Free."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "instance_ocpus" {
  type    = number
  default = 2
}

variable "instance_memory_gbs" {
  type    = number
  default = 12
}

variable "boot_volume_gbs" {
  type    = number
  default = 50
}

variable "data_volume_gbs" {
  type    = number
  default = 100
}

variable "backup_bucket_name" {
  type    = string
  default = "comunora-backups"
}
