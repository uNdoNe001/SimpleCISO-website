output "instance_id" {
  description = "EC2 instance id (use with: aws ssm start-session --target <id>)."
  value       = aws_instance.box.id
}

output "public_ip" {
  description = "Elastic IP — point the simpleciso.ai A record here."
  value       = aws_eip.box.public_ip
}

output "vpc_id" {
  description = "VPC the box runs in (should match the other Summit Cyber boxes)."
  value       = data.aws_vpc.default.id
}

output "dns_setup" {
  description = "DNS records to create once the box is up."
  value       = "A  simpleciso.ai  -> ${aws_eip.box.public_ip}   and   A  www.simpleciso.ai  -> ${aws_eip.box.public_ip}"
}
