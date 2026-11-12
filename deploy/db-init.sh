#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username postgres --dbname archive --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE archive_app WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE archive OWNER TO archive_app;
ALTER SCHEMA public OWNER TO archive_app;
SQL
