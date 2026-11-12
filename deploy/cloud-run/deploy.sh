#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
project=saq-qurylys
region=europe-west1
service=ale-archive-preview
repository=ale-archive-preview
number=$(gcloud projects describe "$project" --format='value(projectNumber)')
origin="https://${service}-${number}.${region}.run.app"
# A dedicated repository and service; the existing saq-qurylys-api is untouched.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project="$project"
if ! gcloud artifacts repositories describe "$repository" --location="$region" --project="$project" >/dev/null 2>&1; then
 gcloud artifacts repositories create "$repository" --repository-format=docker --location="$region" --project="$project"
fi
image="${region}-docker.pkg.dev/${project}/${repository}/site:$(git rev-parse --short HEAD)"
gcloud builds submit --project="$project" --region="$region" --config=deploy/cloud-run/cloudbuild.yaml --substitutions="_IMAGE=${image}" .
private="$HOME/.ale-archive-preview"
mkdir -p "$private";chmod 700 "$private"
export ALE_PREVIEW_ORIGIN="$origin" ALE_PREVIEW_PRIVATE="$private"
export ALE_PREVIEW_EMAIL="$(gcloud config get-value account 2>/dev/null)"
node --input-type=module <<'JS'
import {randomBytes} from 'node:crypto';import {writeFile,readFile} from 'node:fs/promises';
const dir=process.env.ALE_PREVIEW_PRIVATE;let credentials;
try{credentials=JSON.parse(await readFile(dir+'/credentials.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;credentials={email:process.env.ALE_PREVIEW_EMAIL,password:randomBytes(24).toString('hex'),sessionSecret:randomBytes(32).toString('hex')};await writeFile(dir+'/credentials.json',JSON.stringify(credentials,null,2),{mode:0o600});}
await writeFile(dir+'/environment.yaml',Object.entries({BETTER_AUTH_URL:process.env.ALE_PREVIEW_ORIGIN,BETTER_AUTH_SECRET:credentials.sessionSecret,STAFF_ADMIN_EMAIL:credentials.email,STAFF_ADMIN_PASSWORD:credentials.password,STAFF_ADMIN_NAME:'Администратор ALEteam',ASSISTANT_MODE:'local-model',MODERATION_MODE:'local',FILE_PROCESSING_TIMEOUT_MS:'120000'}).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});
JS
gcloud run deploy "$service" --project="$project" --region="$region" --image="$image" --port=8080 --cpu=1 --memory=2Gi --min=0 --max=1 --concurrency=10 --timeout=300 --allow-unauthenticated --env-vars-file="$private/environment.yaml" --startup-probe='httpGet.path=/api/health,httpGet.port=8080,periodSeconds=10,timeoutSeconds=5,failureThreshold=24'
actual=$(gcloud run services describe "$service" --project="$project" --region="$region" --format='value(status.url)')
if [[ "$actual" != "$origin" ]]; then
 gcloud run services update "$service" --project="$project" --region="$region" --update-env-vars="BETTER_AUTH_URL=$actual"
fi
printf '\nСайт: %s\nВход: %s\nПароль хранится только в %s/credentials.json\n' "$actual" "$ALE_PREVIEW_EMAIL" "$private"
echo 'Cloud Shell можно закрыть. При холодном старте исходные материалы восстановятся, новые изменения сбросятся.'
