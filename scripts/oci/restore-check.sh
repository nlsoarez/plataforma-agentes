#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command restic
require_command docker
load_env_file "$COMUNORA_ENV_DIR/backup.env"

tmp_root="/srv/comunora/tmp"
mkdir -p "$tmp_root"
tmp="$(mktemp -d "$tmp_root/restore-check.XXXXXXXX")"
assert_path_under "$tmp" "$tmp_root"
platform_container="comunora-restore-platform-$$"
evolution_container="comunora-restore-evolution-$$"

cleanup() {
  docker rm -f "$platform_container" "$evolution_container" >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT

restic restore latest --target "$tmp/restore"
backup_dir="$(dirname "$(find "$tmp/restore" -type f -name platform.dump -print -quit)")"
[[ "$backup_dir" != "." && -d "$backup_dir" ]] || die "platform.dump nao encontrado no ultimo snapshot"
for file in platform.dump evolution.dump platform-redis.rdb evolution-redis.rdb; do
  [[ -s "$backup_dir/$file" ]] || die "Arquivo ausente no ultimo backup: $file"
done

docker run --rm -v "$backup_dir:/restore:ro" redis:8.2.1-alpine redis-check-rdb /restore/platform-redis.rdb >/dev/null
docker run --rm -v "$backup_dir:/restore:ro" redis:8.2.1-alpine redis-check-rdb /restore/evolution-redis.rdb >/dev/null

docker run -d --name "$platform_container" \
  -e POSTGRES_PASSWORD=restore_check_only -e POSTGRES_DB=plataforma \
  pgvector/pgvector:0.8.2-pg18-bookworm >/dev/null
docker run -d --name "$evolution_container" \
  -e POSTGRES_PASSWORD=restore_check_only -e POSTGRES_DB=evolution \
  postgres:17.10-trixie >/dev/null

wait_postgres() {
  local container="$1" database="$2"
  for _ in $(seq 1 60); do
    docker exec "$container" pg_isready -U postgres -d "$database" >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "PostgreSQL temporario nao iniciou: $container"
}

wait_postgres "$platform_container" plataforma
wait_postgres "$evolution_container" evolution
docker exec -i "$platform_container" pg_restore -U postgres -d plataforma --no-owner --no-acl --exit-on-error <"$backup_dir/platform.dump"
docker exec -i "$evolution_container" pg_restore -U postgres -d evolution --no-owner --no-acl --exit-on-error <"$backup_dir/evolution.dump"

platform_tables="$(docker exec "$platform_container" psql -U postgres -d plataforma -Atc "select count(*) from pg_tables where schemaname='public'")"
evolution_tables="$(docker exec "$evolution_container" psql -U postgres -d evolution -Atc "select count(*) from pg_tables where schemaname='public'")"
(( platform_tables > 0 )) || die "Restore da plataforma nao criou tabelas"
(( evolution_tables > 0 )) || die "Restore da Evolution nao criou tabelas"

printf 'Restore validado: plataforma=%s tabelas, evolution=%s tabelas.\n' "$platform_tables" "$evolution_tables"
