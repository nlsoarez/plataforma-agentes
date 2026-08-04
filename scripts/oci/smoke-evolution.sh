#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command docker
suffix="$$"
network="comunora-evolution-smoke-$suffix"
database="comunora-evolution-smoke-db-$suffix"
redis="comunora-evolution-smoke-redis-$suffix"
api="comunora-evolution-smoke-api-$suffix"
password="smoke-only-$suffix-$(date +%s)"

cleanup() {
  docker rm -f "$api" "$redis" "$database" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run -d --name "$database" --network "$network" \
  -e POSTGRES_USER=evolution -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=evolution \
  postgres:17.10-trixie >/dev/null
docker run -d --name "$redis" --network "$network" redis:8.2.1-alpine \
  redis-server --requirepass "$password" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$database" pg_isready -U evolution -d evolution >/dev/null 2>&1 && break
  sleep 2
done

docker run -d --name "$api" --network "$network" \
  -e SERVER_URL=http://evolution-smoke.local \
  -e DATABASE_ENABLED=true \
  -e DATABASE_PROVIDER=postgresql \
  -e DATABASE_CONNECTION_URI="postgresql://evolution:$password@$database:5432/evolution" \
  -e DATABASE_CONNECTION_CLIENT_NAME=smoke \
  -e CACHE_REDIS_ENABLED=true \
  -e CACHE_REDIS_URI="redis://default:$password@$redis:6379/0" \
  -e CACHE_LOCAL_ENABLED=false \
  -e AUTHENTICATION_API_KEY="smoke-$password" \
  -e TELEMETRY=false \
  evoapicloud/evolution-api:v2.3.7 >/dev/null

for _ in $(seq 1 90); do
  if docker exec "$api" node -e "fetch('http://127.0.0.1:8080').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    printf 'Evolution API v2.3.7 iniciou com PostgreSQL 17 e Redis 8 sem sessoes reais.\n'
    exit 0
  fi
  if [[ "$(docker inspect --format '{{.State.Status}}' "$api")" == "exited" ]]; then break; fi
  sleep 2
done

docker logs --tail 100 "$api" >&2 || true
die "Smoke test da Evolution API falhou"
