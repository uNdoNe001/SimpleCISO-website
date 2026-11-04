# SimpleCISO website

Marketing site for **SimpleCISO** — the AI-assisted, human-governed security
program management product from [Summit Cyber](https://www.summitcyber.io), and
the GRC/program counterpart to [SimpleSec](https://simplesec.ai).

Built with **Astro 7 + Tailwind v4**, server-rendered on Node, fronted by Caddy
(auto-TLS). The contact form emails the team on each submission via SMTP
(nodemailer).

- **Live:** https://simpleciso.ai
- **Stack:** Astro (Node SSR) · Tailwind v4 (CSS-first `@theme`) · nodemailer
- **Hosting:** single EC2 box in the Summit default VPC, managed via AWS SSM

## Local development

Requires **Node >= 22.23.4** (Astro 7 / Vite 8).

```bash
npm install
npm run dev        # http://localhost:4321
```

The contact form calls `POST /api/contact`. Without SMTP configured it returns a
clear 503 ("email delivery is not configured") — the rest of the site works. To
exercise email locally, create `.env.local` from `.env.example`.

```bash
npm run build      # outputs dist/ (static client + Node server entry)
npm run preview
```

## Pages

| Route        | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `/`          | Home — positioning, product dashboard mock, how-it-works, governance |
| `/platform`  | Capabilities, the assess→prove lifecycle, SimpleSec sync, frameworks |
| `/contact`   | Request-a-demo form (emails the team + acks the sender)           |
| `/privacy`   | Privacy notice (noindex)                                          |
| `/api/contact` | SSR endpoint that sends the emails (nodemailer)                 |

Theme tokens live in `src/styles/global.css` under `@theme { … }` — there is **no**
`tailwind.config.js` (Tailwind v4 is CSS-first).

## Contact-form email

`/api/contact` sends two emails per submission (a notification to the team and an
acknowledgement to the sender). Configure via environment variables — on the
server these are rendered into `.env.production` from SSM at boot (see below).

| Var                | Example                                   |
| ------------------ | ----------------------------------------- |
| `SMTP_ENABLED`     | `true`                                    |
| `SMTP_HOST`        | `smtp.gmail.com`                          |
| `SMTP_PORT`        | `587`                                     |
| `SMTP_USER`        | sending Gmail address                     |
| `SMTP_PASSWORD`    | Gmail app password (16 chars, no spaces)  |
| `SMTP_FROM`        | `SimpleCISO <sender@summitcyber.io>`      |
| `CONTACT_NOTIFY_TO`| `info@simpleciso.ai`                      |

## Deployment

Infrastructure is Terraform in [`infra/terraform/`](infra/terraform/). It
provisions one Amazon Linux 2023 EC2 box in the **default VPC** (the same VPC as
`SimpleSec-web` and `simpleciso-test`), an Elastic IP, a web-only security group
(80/443), and an SSM-managed instance role. There is **no SSH** — shell and
deploys go through SSM.

The box's `user_data` installs Node 22 + Caddy, clones this repo, renders
`.env.production` from SSM, builds, and starts:

- `simpleciso-website.service` — the Astro Node server on `127.0.0.1:4321`
- `caddy.service` — public TLS on 80/443, reverse-proxying the app

See [`infra/terraform/README.md`](infra/terraform/README.md) for apply steps,
setting the SMTP secret, DNS, and pushing updates.

### Pushing site updates

Code changes land by pushing to `main`, then refreshing the box over SSM:

```bash
aws ssm send-command --region us-east-2 \
  --document-name "AWS-RunShellScript" \
  --targets "Key=InstanceIds,Values=<instance_id>" \
  --parameters 'commands=["sudo -u simpleciso /var/www/simpleciso-website/scripts/deploy.sh"]'
```

`scripts/deploy.sh` does `git pull` → `npm ci` → `npm run build` → restart.

---

A product of Summit Cyber. SimpleCISO reports **readiness and evidence
coverage** — never "certified" or "compliant." Material decisions require human
sign-off.
