#!/usr/bin/env bash
# Run once in Cloud Shell. Prepare input now and publish at the team's freeze time.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
private=$(mktemp -d /tmp/ale-deadline-XXXXXX)
chmod 700 "$private"
cleanup() {
 python3 - "$private" <<'PY'
import shutil,sys
shutil.rmtree(sys.argv[1])
PY
}
trap cleanup EXIT
gcloud run services describe ale-archive-preview --project=saq-qurylys --region=europe-west1 --format=json > "$private/service.json"
needs_database=0
if ! python3 - "$private/service.json" <<'PY'
import json,sys
service=json.load(open(sys.argv[1]))
variables=service['spec']['template']['spec']['containers'][0].get('env',[])
sys.exit(0 if any(v.get('name')=='DATABASE_URL' and (v.get('value') or v.get('valueFrom')) for v in variables) else 1)
PY
then
 needs_database=1
 read -r -s -p 'Постоянная БД ещё не подключена. Вставь прямую строку Neon сейчас (ввод скрыт): ' database_url
 printf '\n'
 printf '%s\n' "$database_url" > "$private/database-url"
 unset database_url
 chmod 600 "$private/database-url"
 python3 - "$private/database-url" <<'PY'
import sys
from pathlib import Path
from urllib.parse import urlparse,parse_qs
try:
 u=urlparse(Path(sys.argv[1]).read_text().strip())
 assert u.scheme in ('postgres','postgresql') and u.hostname and u.username and u.password and len(u.path)>1
 assert '-pooler.' not in u.hostname and parse_qs(u.query).get('sslmode',[''])[0] in ('require','verify-full')
except Exception:
 print('Нужна прямая PostgreSQL URL с паролем и sslmode=require, без Connection pooling.',file=sys.stderr)
 sys.exit(1)
PY
fi
# 18:22 UTC = 23:22 Qyzylorda: leave twenty minutes for build and verification.
export ALE_RELEASE_BUILD_AT="${ALE_RELEASE_BUILD_AT:-2026-11-12T18:22:00Z}"
python3 -u <<'PY'
from datetime import datetime,timezone
import os,time
start=datetime.fromisoformat(os.environ['ALE_RELEASE_BUILD_AT'].replace('Z','+00:00'))
while True:
 remaining=(start-datetime.now(timezone.utc)).total_seconds()
 if remaining<=0:break
 print('До финальной сборки: '+str(int(remaining//60)+1)+' мин. Cloud Shell оставь открытым.',flush=True)
 time.sleep(min(60,remaining))
print('Получаю итоговую версию команды и начинаю публикацию.',flush=True)
PY
git pull --ff-only https://github.com/Almzhn09/ALEteam.git artur-full-tz-20261109
if [[ "$needs_database" == 1 ]]; then
 bash deploy/cloud-run/connect-database.sh < "$private/database-url"
else
 bash deploy/cloud-run/update.sh
fi
