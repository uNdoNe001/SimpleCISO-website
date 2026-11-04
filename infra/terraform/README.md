# SimpleCISO website — infrastructure

One EC2 box in the **default VPC** (`vpc-08d82cb44e1dc7b9e`, us-east-2) — the same
VPC as `SimpleSec-web` and `simpleciso-test` — fronted by an Elastic IP, running
the Astro Node SSR app behind Caddy. Management and deploys go through **AWS SSM**:
no SSH, no inbound port 22. SMTP secrets live in SSM Parameter Store.

```
terraform apply
  ├─ EC2 (Amazon Linux 2023, t3.small) + Elastic IP
  ├─ security group: inbound 80/443 only
  ├─ IAM role: SSM core + read /simpleciso/website/* params
  ├─ SSM SecureString params: smtp_user, smtp_password (placeholders)
  └─ user_data: install Node 22 + Caddy, clone repo, render .env from SSM,
                npm ci + build, start simpleciso-website + caddy services
```

State is **local** by default (lean). Promote to the shared S3 backend later if
this grows.

## Apply

```bash
cd infra/terraform
terraform init
terraform apply        # review the plan first
```

Outputs: `instance_id`, `public_ip`, `dns_setup`.

## Set the SMTP secret (one time)

The box can't send email until the Gmail app password is set. The parameters are
created as placeholders; fill them out-of-band so they never touch the repo or
Terraform state:

```bash
aws ssm put-parameter --region us-east-2 --overwrite --type SecureString \
  --name /simpleciso/website/smtp_user     --value 'sending-gmail@summitcyber.io'
aws ssm put-parameter --region us-east-2 --overwrite --type SecureString \
  --name /simpleciso/website/smtp_password --value 'xxxxxxxxxxxxxxxx'

# re-render .env.production on the box and restart the service
aws ssm send-command --region us-east-2 \
  --document-name "AWS-RunShellScript" \
  --targets "Key=InstanceIds,Values=$(terraform output -raw instance_id)" \
  --parameters 'commands=["/usr/local/bin/simpleciso-render-env.sh","systemctl restart simpleciso-website"]'
```

(`CONTACT_NOTIFY_TO` defaults to `info@simpleciso.ai` via the `notify_to` variable;
`SMTP_HOST`/`PORT`/`FROM` are set by the renderer. Only `smtp_user` and
`smtp_password` are secrets.)

## DNS

Point the domain at the Elastic IP (`terraform output public_ip`):

```
A   simpleciso.ai       -> <public_ip>
A   www.simpleciso.ai   -> <public_ip>
```

Caddy issues Let's Encrypt certs automatically on first request once DNS resolves.
Until then the box serves fine over HTTP.

## Shell into the box (no SSH)

```bash
aws ssm start-session --region us-east-2 --target $(terraform output -raw instance_id)
```

Boot log: `/var/log/user-data.log`. Service logs:
`journalctl -u simpleciso-website -f` and `journalctl -u caddy -f`.

## Deploy site updates

```bash
aws ssm send-command --region us-east-2 \
  --document-name "AWS-RunShellScript" \
  --targets "Key=InstanceIds,Values=$(terraform output -raw instance_id)" \
  --parameters 'commands=["sudo -u simpleciso /var/www/simpleciso-website/scripts/deploy.sh"]'
```

## Notes

- Changing `user_data.sh.tftpl` replaces the instance (`user_data_replace_on_change`).
  The site rebuilds from `main` on the new box; the EIP stays put, so DNS is stable.
- The box clones over HTTPS from the public repo — no deploy key needed.
