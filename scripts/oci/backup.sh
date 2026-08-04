#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command restic
require_command jq
require_command docker
load_env_file "$COMUNORA_ENV_DIR/backup.env"

for name in RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [[ -n "${!name:-}" && "${!name}" != *CHANGE_ME* ]] || die "$name nao configurada em backup.env"
done

tmp_root="/srv/comunora/tmp"
mkdir -p "$tmp_root" /srv/comunora/cache/restic
tmp="$(mktemp -d "$tmp_root/backup.XXXXXXXX")"
assert_path_under "$tmp" "$tmp_root"
cleanup() { rm -rf -- "$tmp"; }
trap cleanup EXIT

compose exec -T platform-postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --format=custom' \
  >"$tmp/platform.dump"
compose exec -T evolution-postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --format=custom' \
  >"$tmp/evolution.dump"

snapshot_redis() {
  local service="$1" destination="$2" remote="/tmp/comunora-backup.rdb"
  compose exec -T "$service" sh -ec \
    'rm -f /tmp/comunora-backup.rdb; REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --rdb /tmp/comunora-backup.rdb >/dev/null'
  compose cp "$service:$remote" "$destination" >/dev/null
  compose exec -T "$service" rm -f "$remote"
}

snapshot_redis platform-redis "$tmp/platform-redis.rdb"
snapshot_redis evolution-redis "$tmp/evolution-redis.rdb"

for file in "$tmp"/*; do [[ -s "$file" ]] || die "Backup vazio: $file"; done
printf '%s\n' "$(date --iso-8601=seconds)" >"$tmp/created-at.txt"

if ! restic snapshots --json >/dev/null 2>&1; then
  restic init
fi
(
  cd "$tmp"
  restic backup . --tag comunora-production
)
restic forget --tag comunora-production --keep-daily 7 --keep-weekly 2 --prune

quota="${RESTIC_QUOTA_BYTES:-16106127360}"
used="$(restic stats latest --mode raw-data --json | jq -r '.total_size')"
[[ "$used" =~ ^[0-9]+$ ]] || die "Nao foi possivel calcular o uso do repositorio"
(( used <= quota )) || die "Repositorio de backup excedeu o limite preventivo: $used > $quota bytes"

printf 'Backup concluido: %s bytes armazenados.\n' "$used"
