#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:-production}"
require_command curl

disk_use="$(df --output=pcent /srv/comunora | tail -n 1 | tr -dc '0-9')"
[[ "$disk_use" =~ ^[0-9]+$ ]] || die "Nao foi possivel medir o volume /srv/comunora"
(( disk_use < 85 )) || die "Volume /srv/comunora acima de 85%: ${disk_use}%"

for service in platform-postgres platform-redis evolution-postgres evolution-redis web api gateway cloudflared; do
  wait_for_service "$service" 3
done

compose exec -T platform-postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select current_database(), current_setting('\''server_version'\'');"'
compose exec -T evolution-postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select current_database(), current_setting('\''server_version'\'');"'
compose exec -T platform-redis sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping | grep -q PONG'
compose exec -T evolution-redis sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping | grep -q PONG'

curl -fsS -H 'Host: staging-app.comunora.com.br' http://127.0.0.1:8080/gateway-health >/dev/null 2>&1 \
  || compose exec -T gateway wget -qO- --header='Host: staging-app.comunora.com.br' http://127.0.0.1:8080/gateway-health >/dev/null

if [[ "$mode" == "production" ]]; then
  for service in worker evolution-api embratel-relay; do wait_for_service "$service" 3; done
  compose exec -T evolution-api node -e "fetch('http://127.0.0.1:8080').then(r=>{if(!r.ok)process.exit(1)})"
  compose exec -T embratel-relay node -e "fetch('http://127.0.0.1:8788/health').then(r=>{if(!r.ok)process.exit(1)})"
fi

if [[ "${CHECK_PUBLIC:-0}" == "1" ]]; then
  hosts=(staging-app staging-api)
  [[ "$mode" == "production" ]] && hosts+=(staging-evolution staging-relay)
  for host in "${hosts[@]}"; do
    curl --fail --silent --show-error --max-time 20 "https://${host}.comunora.com.br/health" >/dev/null \
      || { [[ "$host" == "staging-evolution" ]] && curl -fsS "https://${host}.comunora.com.br/" >/dev/null; }
  done
fi

printf 'Healthcheck %s concluido.\n' "$mode"
