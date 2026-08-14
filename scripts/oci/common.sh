#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/compose.production.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/etc/comunora/compose.env}"
COMUNORA_ENV_DIR="${COMUNORA_ENV_DIR:-/etc/comunora/env}"
COMUNORA_DATA_DIR="${COMUNORA_DATA_DIR:-/srv/comunora/data}"
COMUNORA_STATE_DIR="${COMUNORA_STATE_DIR:-/srv/comunora/state}"

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Comando obrigatorio ausente: $1"
}

require_file() {
  [[ -f "$1" ]] || die "Arquivo obrigatorio ausente: $1"
}

load_env_file() {
  require_file "$1"
  set -a
  # shellcheck disable=SC1090
  source "$1"
  set +a
}

wait_for_service() {
  local service="$1"
  local attempts="${2:-60}"
  local id status
  for _ in $(seq 1 "$attempts"); do
    id="$(compose ps -q "$service")"
    if [[ -n "$id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      [[ "$status" == "healthy" || "$status" == "running" ]] && return 0
      [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]] && break
    fi
    sleep 5
  done
  compose ps "$service" >&2 || true
  compose logs --tail 80 "$service" >&2 || true
  die "Servico nao ficou saudavel: $service"
}

assert_path_under() {
  local child parent
  child="$(readlink -m -- "$1")"
  parent="$(readlink -m -- "$2")"
  [[ "$child" == "$parent"/* ]] || die "Caminho fora do diretorio permitido: $child"
}
