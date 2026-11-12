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
python3 - "$private/url" <<'PY_VALIDATE'
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
try:
    u = urlparse(Path(sys.argv[1]).read_text().strip())
    assert u.scheme in ('postgres', 'postgresql') and u.hostname and u.username and u.password and len(u.path) > 1
    assert '-pooler.' not in u.hostname and parse_qs(u.query).get('sslmode', [''])[0] in ('require', 'verify-full')
except Exception:
    print('Нужна прямая PostgreSQL URL с паролем и sslmode=require, без Connection pooling.', file=sys.stderr)
    sys.exit(1)
PY_VALIDATE
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

actual=$(gcloud run services describe "$service" --project="$project" --region="$region" --format='value(status.url)')
printf '%s\n' "$actual"
if [[ "${ALE_SKIP_PUBLIC_CHECK:-0}" != 1 ]]; then
 python3 deploy/cloud-run/check-public.py "$actual"
fi
