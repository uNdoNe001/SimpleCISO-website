# SimpleCISO marketing website: a small EC2 box in the default VPC (same VPC as
# SimpleSec-web and simpleciso-test), fronted by an Elastic IP, running the Astro
# Node SSR app behind Caddy (auto-TLS). Management goes through AWS SSM — no SSH,
# no inbound port 22. SMTP secrets live in SSM Parameter Store.

data "aws_caller_identity" "current" {}

# Latest Amazon Linux 2023 AMI (SSM agent + AWS CLI preinstalled).
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "in_az" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "availability-zone"
    values = [var.availability_zone]
  }
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name       = "simpleciso-web"
}

# --- SMTP secrets (SSM SecureString; set out-of-band, never in the repo) -----
# Created with placeholders; the box reads them at boot. Fill them once with:
#   aws ssm put-parameter --overwrite --type SecureString \
#     --name /simpleciso/website/smtp_user     --value 'sending-gmail@summitcyber.io'
#   aws ssm put-parameter --overwrite --type SecureString \
#     --name /simpleciso/website/smtp_password --value 'xxxxxxxxxxxxxxxx'
# value changes are ignored here so `terraform apply` never clobbers them.
resource "aws_ssm_parameter" "smtp_user" {
  name  = "${var.ssm_prefix}/smtp_user"
  type  = "SecureString"
  value = "CHANGEME"
  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "smtp_password" {
  name  = "${var.ssm_prefix}/smtp_password"
  type  = "SecureString"
  value = "CHANGEME"
  lifecycle {
    ignore_changes = [value]
  }
}

# --- Security group: inbound web only; management is via SSM ------------------
resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "SimpleCISO website: inbound HTTP/HTTPS only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (ACME challenges + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-web" }
}

# --- Instance role: SSM managed + read our SMTP SSM params -------------------
data "aws_iam_policy_document" "instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${local.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.instance_assume.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "instance_inline" {
  statement {
    sid       = "ReadSmtpSecrets"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${var.ssm_prefix}/*"]
  }
  statement {
    sid       = "DecryptSecrets"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "instance_inline" {
  name   = "box-runtime"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance_inline.json
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name}-instance"
  role = aws_iam_role.instance.name
}

# --- The box -----------------------------------------------------------------
resource "aws_instance" "box" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.in_az.ids[0]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  vpc_security_group_ids = [aws_security_group.web.id]

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    region        = var.region
    repo_url      = var.repo_url
    ssm_prefix    = var.ssm_prefix
    caddy_version = var.caddy_version
    notify_to     = var.notify_to
  })
  # Re-bootstrap the box when the provisioning script changes.
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  depends_on = [
    aws_ssm_parameter.smtp_user,
    aws_ssm_parameter.smtp_password,
    aws_iam_instance_profile.instance,
  ]

  tags = { Name = local.name }
}

resource "aws_eip" "box" {
  count    = var.use_eip ? 1 : 0
  domain   = "vpc"
  instance = aws_instance.box.id
  tags     = { Name = "${local.name}-eip" }
}

locals {
  public_ip = var.use_eip ? aws_eip.box[0].public_ip : aws_instance.box.public_ip
}
