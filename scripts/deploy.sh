#!/usr/bin/env bash
# Pull, build, and restart the SimpleCISO marketing site.
# Run from the deployed checkout (/var/www/simpleciso-website) as the service user.
#
#   sudo -u simpleciso /var/www/simpleciso-website/scripts/deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ git pull"
git pull --ff-only

echo "→ npm ci"
npm ci

echo "→ npm run build"
npm run build

echo "→ restart service"
sudo systemctl restart simpleciso-website
sleep 2
sudo systemctl status simpleciso-website --no-pager -l | head -20

echo
echo "Deployed. Tail logs with:  journalctl -u simpleciso-website -f"
