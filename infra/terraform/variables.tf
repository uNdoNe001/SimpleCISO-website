variable "region" {
  description = "AWS region. Same region as the other Summit Cyber boxes."
  type        = string
  default     = "us-east-2"
}

variable "availability_zone" {
  description = "AZ within the default VPC to place the box (co-located with SimpleSec-web)."
  type        = string
  default     = "us-east-2a"
}

variable "instance_type" {
  description = "EC2 instance type. t3.small has enough memory for the Astro build."
  type        = string
  default     = "t3.small"
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 20
}

variable "repo_url" {
  description = "Public Git URL the box clones and pulls the site from."
  type        = string
  default     = "https://github.com/uNdoNe001/SimpleCISO-website.git"
}

variable "ssm_prefix" {
  description = "SSM Parameter Store prefix for this site's config/secrets."
  type        = string
  default     = "/simpleciso/website"
}

variable "caddy_version" {
  description = "Caddy release to install (static binary from GitHub releases)."
  type        = string
  default     = "2.8.4"
}

variable "notify_to" {
  description = "Where contact-form submissions are emailed."
  type        = string
  default     = "info@simpleciso.ai"
}
