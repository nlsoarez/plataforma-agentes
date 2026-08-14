#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Execute com sudo."
mountpoint -q /srv/comunora || die "/srv/comunora nao esta montado no volume persistente"
require_command docker
docker compose version >/dev/null

install -d -m 0700 "$COMUNORA_ENV_DIR"
install -d -m 0750 -o ubuntu -g docker /srv/comunora/{app,state,tmp,backups}
install -d -m 0755 /srv/comunora/data/{platform-postgres,platform-redis,evolution-postgres,evolution-redis}
install -d -m 0755 /srv/comunora/cache/restic

for template in "$REPO_ROOT"/infra/env/*.env.example; do
  target="$COMUNORA_ENV_DIR/$(basename "${template%.example}")"
  if [[ ! -e "$target" ]]; then
    install -m 0600 -o root -g root "$template" "$target"
    printf 'Criado template: %s\n' "$target"
  fi
done

if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
  install -m 0644 /dev/null "$COMPOSE_ENV_FILE"
  cat >"$COMPOSE_ENV_FILE" <<'EOF'
COMUNORA_ENV_DIR=/etc/comunora/env
COMUNORA_DATA_DIR=/srv/comunora/data
COMUNORA_STATE_DIR=/srv/comunora/state
NEXT_PUBLIC_API_URL=https://api.comunora.com.br
NEXT_PUBLIC_APP_URL=https://app.comunora.com.br
NEXT_PUBLIC_SITE_URL=https://comunora.com.br
NEXT_PUBLIC_DOCS_URL=https://docs.comunora.com.br
NEXT_PUBLIC_STATUS_URL=https://status.comunora.com.br
NEXT_PUBLIC_BRAND_NAME=Comunora
NEXT_PUBLIC_SUPPORT_EMAIL=suporte@comunora.com.br
EOF
fi

for unit in "$REPO_ROOT"/infra/systemd/*; do
  install -m 0644 "$unit" "/etc/systemd/system/$(basename "$unit")"
done
systemctl daemon-reload
systemctl enable --now comunora-backup.timer comunora-restore-check.timer comunora-healthcheck.timer

printf 'Provisionamento da aplicacao concluido. Preencha %s e execute validate-env.sh.\n' "$COMUNORA_ENV_DIR"
