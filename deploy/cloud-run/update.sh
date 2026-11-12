#!/usr/bin/env bash
# Preserve the live service's auth settings and database secret on updates.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
project=saq-qurylys
region=europe-west1
service=ale-archive-preview
private=$(mktemp -d /tmp/ale-update-XXXXXX)
chmod 700 "$private"
trap 'rm -rf "$private"' EXIT
# Keep the service description private: it can include sensitive environment values.
gcloud run services describe "$service" --project="$project" --region="$region" --format=json > "$private/service.json"
if ! python3 - "$private/service.json" <<'PY'
import json,sys
service=json.load(open(sys.argv[1]))
variables=service['spec']['template']['spec']['containers'][0].get('env',[])
sys.exit(0 if any(v.get('name')=='DATABASE_URL' and (v.get('value') or v.get('valueFrom')) for v in variables) else 1)
PY
then
 echo 'Постоянная БД ещё не подключена. Сейчас потребуется прямая строка PostgreSQL из Neon.'
 bash deploy/cloud-run/connect-database.sh
 exit 0
fi
image="${region}-docker.pkg.dev/${project}/ale-archive-preview/site:$(git rev-parse --short HEAD)"
gcloud builds submit --project="$project" --region="$region" --config=deploy/cloud-run/cloudbuild.yaml --substitutions="_IMAGE=${image}" .
gcloud run services update "$service" --project="$project" --region="$region" --image="$image"
echo 'Обновлённая версия опубликована. Подключение БД и настройки входа сохранены.'
actual=$(gcloud run services describe "$service" --project="$project" --region="$region" --format='value(status.url)')
printf '%s\n' "$actual"
if [[ "${ALE_SKIP_PUBLIC_CHECK:-0}" != 1 ]]; then
 python3 deploy/cloud-run/check-public.py "$actual"
fi
