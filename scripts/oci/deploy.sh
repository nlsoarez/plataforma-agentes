#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:-rehearsal}"
[[ "$mode" == "rehearsal" || "$mode" == "production" ]] || die "Uso: $0 rehearsal|production"
require_command docker
"$SCRIPT_DIR/validate-env.sh"

cd "$REPO_ROOT"
for service in web api worker embratel-relay migrate; do
  compose --profile active --profile ops build "$service"
done

compose up -d platform-postgres platform-redis evolution-postgres evolution-redis
for service in platform-postgres platform-redis evolution-postgres evolution-redis; do
  wait_for_service "$service"
done

compose --profile ops run --rm migrate pnpm --filter @plataforma/db provision:runtime-role
compose --profile ops run --rm migrate
compose --profile ops run --rm migrate pnpm --filter @plataforma/db provision:runtime-role

compose up -d web api
wait_for_service web
wait_for_service api
compose up -d gateway cloudflared
wait_for_service gateway

if [[ "$mode" == "production" ]]; then
  compose --profile active up -d evolution-api
  wait_for_service evolution-api 90
  compose --profile active up -d embratel-relay worker
  wait_for_service embratel-relay
  wait_for_service worker
else
  compose --profile active stop worker evolution-api embratel-relay >/dev/null 2>&1 || true
fi

"$SCRIPT_DIR/healthcheck.sh" "$mode"
