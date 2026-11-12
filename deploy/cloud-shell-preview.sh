#!/usr/bin/env bash
# Temporary, interactive Cloud Shell preview. No billed GCP services are created.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v docker >/dev/null || { echo 'Docker is required (run in Google Cloud Shell).'; exit 1; }
command -v node >/dev/null || { echo 'Node.js is required (available in Google Cloud Shell).'; exit 1; }
mkdir -p .local/cloud-shell-preview
chmod 700 .local/cloud-shell-preview
npm run deploy:setup
chmod 644 deploy/db-init.sh deploy/Caddyfile
# These are local containers in this Cloud Shell, not changes to existing GCP services.
docker compose --env-file deploy/.env -f deploy/compose.yaml --project-name ale-preview --profile workers up -d --build --wait app jobs
if [[ ! -x .local/cloud-shell-preview/cloudflared ]]; then
  case "$(uname -m)" in x86_64) arch=amd64;; aarch64) arch=arm64;; *) echo 'Unsupported architecture'; exit 1;; esac
  curl --fail --location --silent --show-error "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}" -o .local/cloud-shell-preview/cloudflared
  chmod 700 .local/cloud-shell-preview/cloudflared
fi
log=.local/cloud-shell-preview/tunnel.log
.local/cloud-shell-preview/cloudflared tunnel --url http://127.0.0.1:3100 --protocol http2 --no-autoupdate > "$log" 2>&1 &
tunnel_pid=$!
trap 'kill "$tunnel_pid" 2>/dev/null || true' EXIT INT TERM
url=''
for ((i=0;i<60;i++)); do
  url=$(sed -nE 's/.*(https:\/\/[a-z0-9-]+\.trycloudflare\.com).*/\1/p' "$log" | head -n 1)
  [[ -n "$url" ]] && break
  kill -0 "$tunnel_pid" 2>/dev/null || { echo "Tunnel failed. Inspect $log"; exit 1; }
  sleep 1
done
[[ -n "$url" ]] || { echo "Tunnel URL not received. Inspect $log"; exit 1; }
# Align authentication, origin validation and canonical links with the actual public URL.
node --input-type=module - "$url" <<'JS'
import {readFile,writeFile} from 'node:fs/promises';
const file='deploy/.env',url=process.argv[2];
if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url))throw Error('Unexpected tunnel origin');
const text=await readFile(file,'utf8');await writeFile(file,text.replace(/^BETTER_AUTH_URL=.*$/m,'BETTER_AUTH_URL='+url),{mode:0o600});
JS
docker compose --env-file deploy/.env -f deploy/compose.yaml --project-name ale-preview up -d --no-deps --no-build --force-recreate --wait app
printf '\nСсылка для показа: %s\nОставьте Cloud Shell и эту команду работающими. Ctrl+C закрывает ссылку.\n' "$url"
wait "$tunnel_pid"
