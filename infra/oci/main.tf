data "oci_identity_availability_domains" "available" {
  compartment_id = var.compartment_ocid
}

data "oci_core_images" "ubuntu_arm64" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "oci_objectstorage_namespace" "current" {
  compartment_id = var.compartment_ocid
}

locals {
  availability_domain = data.oci_identity_availability_domains.available.availability_domains[0].name
  common_tags = {
    application = "comunora"
    environment = "production"
    managed_by  = "terraform"
  }
}

resource "oci_core_vcn" "comunora" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.42.0.0/16"]
  display_name   = "comunora-vcn"
  dns_label      = "comunora"
  freeform_tags  = local.common_tags
}

resource "oci_core_internet_gateway" "comunora" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.comunora.id
  display_name   = "comunora-internet-gateway"
  enabled        = true
  freeform_tags  = local.common_tags
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.comunora.id
  display_name   = "comunora-public-routes"
  freeform_tags  = local.common_tags

  route_rules {
    network_entity_id = oci_core_internet_gateway.comunora.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_security_list" "deny_inbound" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.comunora.id
  display_name   = "comunora-deny-public-inbound"
  freeform_tags  = local.common_tags

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.comunora.id
  cidr_block                 = "10.42.10.0/24"
  display_name               = "comunora-public-subnet"
  dns_label                  = "prod"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.deny_inbound.id]
  prohibit_public_ip_on_vnic = false
  freeform_tags              = local.common_tags
}

resource "oci_core_network_security_group" "server" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.comunora.id
  display_name   = "comunora-server-nsg"
  freeform_tags  = local.common_tags
}

resource "oci_core_network_security_group_security_rule" "ssh" {
  network_security_group_id = oci_core_network_security_group.server.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.admin_cidr
  source_type               = "CIDR_BLOCK"
  description               = "SSH somente do IP administrativo"

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_network_security_group_security_rule" "egress" {
  network_security_group_id = oci_core_network_security_group.server.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  description               = "Saida necessaria para Tunnel, APIs e atualizacoes"
}

resource "oci_core_instance" "comunora" {
  availability_domain = local.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = var.instance_name
  shape               = var.instance_shape
  freeform_tags       = local.common_tags

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "${var.instance_name}-vnic"
    hostname_label   = "comunora-prod"
    nsg_ids          = [oci_core_network_security_group.server.id]
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm64.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gbs
    boot_volume_vpus_per_gb = 10
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      data_device = "/dev/oracleoci/oraclevdb"
    }))
  }

  lifecycle {
    precondition {
      condition     = length(data.oci_core_images.ubuntu_arm64.images) > 0
      error_message = "Nenhuma imagem Ubuntu 24.04 ARM64 compativel com o shape A1 foi encontrada."
    }
  }
}

resource "oci_core_volume" "data" {
  availability_domain = local.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "comunora-data"
  size_in_gbs         = var.data_volume_gbs
  vpus_per_gb         = 10
  freeform_tags       = local.common_tags
}

resource "oci_core_volume_attachment" "data" {
  attachment_type                     = "paravirtualized"
  instance_id                         = oci_core_instance.comunora.id
  volume_id                           = oci_core_volume.data.id
  device                              = "/dev/oracleoci/oraclevdb"
  is_pv_encryption_in_transit_enabled = true
}

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.current.namespace
  name           = var.backup_bucket_name
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Disabled"
  freeform_tags  = local.common_tags
}
