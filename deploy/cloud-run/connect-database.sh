#!/usr/bin/env bash
# Run in authenticated Cloud Shell. The database URL is never echoed or committed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
project=saq-qurylys
region=europe-west1
service=ale-archive-preview
secret=ale-archive-database-url
private=$(mktemp -d /tmp/ale-database-XXXXXX)
chmod 700 "$private"
trap 'rm -rf "$private"' EXIT
read -r -s -p 'Вставь прямую строку PostgreSQL из Neon (ввод скрыт): ' database_url
printf '\n'
printf '%s' "$database_url" > "$private/url"
unset database_url
chmod 600 "$private/url"
node --input-type=module - "$private/url" <<'JS'
import {readFileSync} from 'node:fs';
try{const u=new URL(readFileSync(process.argv[2],'utf8').trim());if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.username||!u.password||u.pathname.length<2||u.hostname.includes('-pooler.')||!['require','verify-full'].includes(u.searchParams.get('sslmode')))throw Error();}catch{console.error('Нужна прямая PostgreSQL URL с паролем и sslmode=require, без Connection pooling.');process.exit(1);}
JS
image="${region}-docker.pkg.dev/${project}/ale-archive-preview/site:$(git rev-parse --short HEAD)"
gcloud builds submit --project="$project" --region="$region" --config=deploy/cloud-run/cloudbuild.yaml --substitutions="_IMAGE=${image}" .
gcloud services enable secretmanager.googleapis.com --project="$project"
if ! gcloud secrets describe "$secret" --project="$project" >/dev/null 2>&1; then
 gcloud secrets create "$secret" --project="$project" --replication-policy=automatic >/dev/null
fi
version=$(gcloud secrets versions add "$secret" --project="$project" --data-file="$private/url" --format='value(name)')
version=${version##*/}
account=$(gcloud run services describe "$service" --project="$project" --region="$region" --format='value(spec.template.spec.serviceAccountName)')
if [[ -z "$account" ]]; then
 number=$(gcloud projects describe "$project" --format='value(projectNumber)')
 account="${number}-compute@developer.gserviceaccount.com"
fi
gcloud secrets add-iam-policy-binding "$secret" --project="$project" --member="serviceAccount:$account" --role=roles/secretmanager.secretAccessor >/dev/null
gcloud run services update "$service" --project="$project" --region="$region" --image="$image" --update-secrets="DATABASE_URL=${secret}:${version}"
echo 'Постоянная база подключена. Существующие материалы восстановлены; новые аккаунты и записи сохраняются после перезапуска.'
echo 'Загружаемые пользователями файлы пока не имеют постоянного хранилища.'
