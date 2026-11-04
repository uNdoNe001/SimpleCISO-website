output "instance_id" {
  description = "EC2 instance id (use with: aws ssm start-session --target <id>)."
  value       = aws_instance.box.id
}

output "public_ip" {
  description = "Public IP — point the simpleciso.ai A record here."
  value       = local.public_ip
}

output "eip_in_use" {
  description = "Whether a permanent Elastic IP backs the public IP."
  value       = var.use_eip
}

output "vpc_id" {
  description = "VPC the box runs in (should match the other Summit Cyber boxes)."
  value       = data.aws_vpc.default.id
}

output "dns_setup" {
  description = "DNS records to create once the box is up."
  value       = "A  simpleciso.ai  -> ${local.public_ip}   and   A  www.simpleciso.ai  -> ${local.public_ip}"
}
