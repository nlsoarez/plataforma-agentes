#!/usr/bin/env bash

set -Eeuo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command curl
require_command jq
load_env_file "$COMUNORA_ENV_DIR/cloudflare-api.env"
for name in CF_API_TOKEN CF_ZONE_ID CF_TUNNEL_CNAME; do
  [[ -n "${!name:-}" && "${!name}" != *CHANGE_ME* ]] || die "$name nao configurada"
done

api_base="https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records"
hosts=(app.comunora.com.br api.comunora.com.br evolution.comunora.com.br relay.comunora.com.br)

cf_call() {
  local method="$1" url="$2" data="${3:-}" response
  if [[ -n "$data" ]]; then
    response="$(curl -fsS -X "$method" -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data "$data" "$url")"
  else
    response="$(curl -fsS -X "$method" -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' "$url")"
  fi
  jq -e '.success == true' <<<"$response" >/dev/null || { jq '.errors' <<<"$response" >&2; return 1; }
  printf '%s' "$response"
}

lookup_record() {
  local host="$1"
  cf_call GET "$api_base?name=$host" | jq '.result[0] // empty'
}

action="${1:-}"
case "$action" in
  switch)
    backup="/srv/comunora/backups/cloudflare-dns-$(date +%Y%m%d-%H%M%S).json"
    mkdir -p "$(dirname "$backup")"
    tmp="$(mktemp /srv/comunora/tmp/cloudflare-dns.XXXXXXXX)"
    assert_path_under "$tmp" /srv/comunora/tmp
    trap 'rm -f -- "$tmp"' EXIT
    for host in "${hosts[@]}"; do
      current="$(lookup_record "$host")"
      if [[ -n "$current" ]]; then
        jq '{absent:false,id,name,type,content,ttl,proxied,comment}' <<<"$current" >>"$tmp"
        id="$(jq -r '.id' <<<"$current")"
      else
        jq -n --arg name "$host" '{absent:true,name:$name}' >>"$tmp"
        id=""
      fi
      payload="$(jq -n --arg name "$host" --arg content "$CF_TUNNEL_CNAME" '{type:"CNAME",name:$name,content:$content,ttl:1,proxied:true,comment:"Comunora OCI cutover"}')"
      if [[ -n "$id" ]]; then cf_call PUT "$api_base/$id" "$payload" >/dev/null; else cf_call POST "$api_base" "$payload" >/dev/null; fi
      printf 'DNS atualizado: %s\n' "$host"
    done
    jq -s '.' "$tmp" >"$backup"
    chmod 0600 "$backup"
    printf 'Backup DNS: %s\n' "$backup"
    ;;
  rollback)
    backup="${2:-}"
    require_file "$backup"
    while IFS= read -r row; do
      host="$(jq -r '.name' <<<"$row")"
      current="$(lookup_record "$host")"
      current_id="$(jq -r '.id // empty' <<<"$current")"
      if [[ "$(jq -r '.absent' <<<"$row")" == "true" ]]; then
        [[ -z "$current_id" ]] || cf_call DELETE "$api_base/$current_id" >/dev/null
      else
        payload="$(jq '{type,name,content,ttl,proxied} + (if .comment then {comment:.comment} else {} end)' <<<"$row")"
        [[ -n "$current_id" ]] || die "Registro desapareceu durante rollback: $host"
        cf_call PUT "$api_base/$current_id" "$payload" >/dev/null
      fi
      printf 'DNS restaurado: %s\n' "$host"
    done < <(jq -c '.[]' "$backup")
    ;;
  *) die "Uso: $0 switch | rollback ARQUIVO_BACKUP" ;;
esac
