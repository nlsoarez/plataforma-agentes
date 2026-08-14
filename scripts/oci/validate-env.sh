#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

required=(
  platform-db.env
  platform-redis.env
  platform-runtime.env
  platform-admin.env
  evolution-db.env
  evolution-redis.env
  evolution.env
  relay.env
  cloudflared.env
)

require_file "$COMPOSE_ENV_FILE"
for name in "${required[@]}"; do
  file="$COMUNORA_ENV_DIR/$name"
  require_file "$file"
  mode="$(stat -c '%a' "$file")"
  (( (8#$mode & 8#077) == 0 )) || die "$file deve ter permissao 0600 ou mais restrita; atual: $mode"
  if grep -Eq 'CHANGE_ME|RAILWAY_[A-Z0-9_-]*\.up\.railway\.app' "$file"; then
    die "$file ainda contem placeholder ou endpoint Railway"
  fi
done

platform_key="$(sed -n 's/^EVOLUTION_API_KEY=//p' "$COMUNORA_ENV_DIR/platform-runtime.env")"
evolution_key="$(sed -n 's/^AUTHENTICATION_API_KEY=//p' "$COMUNORA_ENV_DIR/evolution.env")"
relay_key="$(sed -n 's/^EVOLUTION_TOKEN=//p' "$COMUNORA_ENV_DIR/relay.env")"
[[ -n "$platform_key" && "$platform_key" == "$evolution_key" && "$platform_key" == "$relay_key" ]] \
  || die "As chaves Evolution da plataforma, Evolution API e relay devem ser identicas"

printf 'Configuracao validada em %s\n' "$COMUNORA_ENV_DIR"
