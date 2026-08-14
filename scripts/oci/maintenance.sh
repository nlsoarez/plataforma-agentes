#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

action="${1:-status}"
flag="$COMUNORA_STATE_DIR/maintenance.enabled"
assert_path_under "$flag" "$COMUNORA_STATE_DIR"
mkdir -p "$COMUNORA_STATE_DIR"

case "$action" in
  on)
    : >"$flag"
    compose exec -T gateway nginx -s reload
    printf 'Manutencao ativada.\n'
    ;;
  off)
    rm -f -- "$flag"
    compose exec -T gateway nginx -s reload
    printf 'Manutencao desativada.\n'
    ;;
  status)
    [[ -f "$flag" ]] && printf 'on\n' || printf 'off\n'
    ;;
  *) die "Uso: $0 on|off|status" ;;
esac
