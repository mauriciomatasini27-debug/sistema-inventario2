#!/usr/bin/env bash
# Postgres local del box para tests de cutover (PERS2-S4, ADR-0052). Nunca Supabase.
#   scripts/pg-local.sh start   -> initdb si falta, arranca en 127.0.0.1:54329, crea bases y migra
#   scripts/pg-local.sh stop
#   scripts/pg-local.sh url <db> -> imprime la URL local (sin secretos: auth trust solo en 127.0.0.1)
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DATA=${PGDATA_LOCAL:-/workspace/.pgdata}
PORT=${PG_LOCAL_PORT:-54329}
DBS=${PG_LOCAL_DBS:-"pers_tenant_a pers_tenant_b"}
url() { echo "postgres://postgres@127.0.0.1:$PORT/$1"; }
[ -x "$PGBIN/pg_ctl" ] || { echo "Falta Postgres: sudo apt-get install -y postgresql" >&2; exit 1; }
case "${1:-start}" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
    fi
    if ! "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      "$PGBIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -o "-p $PORT -c listen_addresses=127.0.0.1 -k /tmp" -w start >/dev/null
    fi
    cd "$(dirname "$0")/.."
    for db in $DBS; do
      "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 \
        || "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$db"
      TENANT_DATABASE_URL=$(url "$db") npx drizzle-kit migrate >/dev/null
      echo "ok $db $(url "$db")"
    done ;;
  stop) "$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null && echo stopped ;;
  url) url "${2:?db}" ;;
  *) echo "uso: $0 start|stop|url <db>" >&2; exit 2 ;;
esac
