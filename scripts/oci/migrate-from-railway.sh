#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

phase=""
confirmation=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) phase="${2:-}"; shift 2 ;;
    --confirm) confirmation="${2:-}"; shift 2 ;;
    *) die "Argumento desconhecido: $1" ;;
  esac
done
[[ "$phase" == "rehearsal" || "$phase" == "cutover" ]] || die "Use --phase rehearsal|cutover"
[[ "$confirmation" == "TARGET-DATA-WILL-BE-REPLACED" ]] || die "Confirmacao obrigatoria: --confirm TARGET-DATA-WILL-BE-REPLACED"

"$SCRIPT_DIR/validate-env.sh"
load_env_file "$COMUNORA_ENV_DIR/migration-source.env"
for name in SOURCE_PLATFORM_DATABASE_URL SOURCE_PLATFORM_REDIS_URL SOURCE_EVOLUTION_DATABASE_URL SOURCE_EVOLUTION_REDIS_URL; do
  [[ -n "${!name:-}" && "${!name}" != *CHANGE_ME* ]] || die "$name nao configurada"
done

if [[ "$phase" == "cutover" ]]; then
  [[ -f "$COMUNORA_STATE_DIR/maintenance.enabled" ]] || die "Ative a manutencao antes do corte"
  [[ -f "$COMUNORA_STATE_DIR/source-writers-stopped" ]] || die "O marcador de writers Railway parados esta ausente"
fi

stamp="$(date +%Y%m%d-%H%M%S)"
artifacts="/srv/comunora/backups/migration-$phase-$stamp"
mkdir -p "$artifacts"
assert_path_under "$artifacts" /srv/comunora/backups
chmod 0700 "$artifacts"

export_pg() {
  local image="$1" url="$2" destination="$3"
  docker run --rm -e SOURCE_URL="$url" "$image" sh -ec \
    'pg_dump "$SOURCE_URL" --no-owner --no-acl --format=custom' >"$destination"
  [[ -s "$destination" ]] || die "Dump PostgreSQL vazio: $destination"
}

export_redis() {
  local url="$1" destination="$2" filename
  filename="$(basename "$destination")"
  docker run --rm -e SOURCE_URL="$url" -e DESTINATION="/backup/$filename" \
    -v "$artifacts:/backup" redis:8.2.1-alpine sh -ec \
    'redis-cli -u "$SOURCE_URL" --rdb "$DESTINATION" >/dev/null'
  [[ -s "$destination" ]] || die "Snapshot Redis vazio: $destination"
}

export_pg pgvector/pgvector:0.8.2-pg18-bookworm "$SOURCE_PLATFORM_DATABASE_URL" "$artifacts/platform.dump"
export_pg postgres:17.10-trixie "$SOURCE_EVOLUTION_DATABASE_URL" "$artifacts/evolution.dump"
export_redis "$SOURCE_PLATFORM_REDIS_URL" "$artifacts/platform-redis.rdb"
export_redis "$SOURCE_EVOLUTION_REDIS_URL" "$artifacts/evolution-redis.rdb"

compose --profile active stop worker embratel-relay evolution-api api web >/dev/null 2>&1 || true
compose up -d platform-postgres evolution-postgres
wait_for_service platform-postgres
wait_for_service evolution-postgres

restore_postgres() {
  local service="$1" dump="$2"
  compose exec -T "$service" sh -ec \
    'case "$POSTGRES_DB" in (*[!A-Za-z0-9_]*|"") exit 2;; esac; PGPASSWORD="$POSTGRES_PASSWORD" dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"; PGPASSWORD="$POSTGRES_PASSWORD" createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
  compose exec -T "$service" sh -ec \
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error' <"$dump"
}

restore_postgres platform-postgres "$artifacts/platform.dump"
restore_postgres evolution-postgres "$artifacts/evolution.dump"

compose stop platform-redis evolution-redis >/dev/null 2>&1 || true
restore_rdb() {
  local data_dir="$1" snapshot="$2"
  assert_path_under "$data_dir" "$COMUNORA_DATA_DIR"
  mkdir -p "$data_dir"
  rm -f -- "$data_dir/dump.rdb"
  if [[ -d "$data_dir/appendonlydir" ]]; then
    find "$data_dir/appendonlydir" -mindepth 1 -delete
    rmdir -- "$data_dir/appendonlydir"
  fi
  install -m 0640 "$snapshot" "$data_dir/dump.rdb"
  docker run --rm -v "$data_dir:/data" redis:8.2.1-alpine chown redis:redis /data/dump.rdb
}

restore_rdb "$COMUNORA_DATA_DIR/platform-redis" "$artifacts/platform-redis.rdb"
restore_rdb "$COMUNORA_DATA_DIR/evolution-redis" "$artifacts/evolution-redis.rdb"
REDIS_APPENDONLY_OVERRIDE=no compose up -d --force-recreate platform-redis evolution-redis
wait_for_service platform-redis
wait_for_service evolution-redis

for service in platform-redis evolution-redis; do
  compose exec -T "$service" sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli CONFIG SET appendonly yes >/dev/null'
  for _ in $(seq 1 60); do
    in_progress="$(compose exec -T "$service" sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --raw INFO persistence' | sed -n 's/^aof_rewrite_in_progress://p' | tr -d '\r')"
    [[ "$in_progress" == "0" ]] && break
    sleep 2
  done
done
compose up -d --force-recreate platform-redis evolution-redis
wait_for_service platform-redis
wait_for_service evolution-redis

compose --profile ops run --rm migrate pnpm --filter @plataforma/db provision:runtime-role
compose --profile ops run --rm migrate
compose --profile ops run --rm migrate pnpm --filter @plataforma/db provision:runtime-role

if [[ "$phase" == "cutover" ]]; then
  "$SCRIPT_DIR/deploy.sh" production
else
  "$SCRIPT_DIR/deploy.sh" rehearsal
fi

printf 'Migracao %s concluida. Artefatos preservados em %s\n' "$phase" "$artifacts"
