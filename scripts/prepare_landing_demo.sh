#!/usr/bin/env bash
set -euo pipefail

# Creates a disposable, active competition used only by the public demo recorder.
# Run this against the isolated hikarivideo stack, never against an event edition.

site_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
platform_dir=${HIKARI_PLATFORM_DIR:-"$site_dir/../hikari/hikari-platform"}
local_dir="$platform_dir/deploy/local"
base_url=${CTFD_URL:-http://localhost:8012}
compose_project=${COMPOSE_PROJECT_NAME:-hikarivideo}
admin_name=${ADMIN_NAME:-admin}
admin_password=${ADMIN_PASSWORD:?Defina ADMIN_PASSWORD para gravar as demonstrações.}
output_file=${HIKARI_DEMO_SCENARIO:-"$site_dir/output/recordings/scenario.json"}
stamp=$(date +%s)
workspace=$(mktemp -d)
cookie_jar="$workspace/cookies.txt"
log_file="$workspace/evidencia-$stamp.json"
trap 'rm -rf "$workspace"' EXIT

extract_nonce() {
  rg -o 'name="nonce"[^>]*value="[^"]+"' "$1" \
    | head -1 | sed -E 's/.*value="([^"]+)"/\1/'
}

extract_csrf() {
  rg -o "'csrfNonce':[[:space:]]*\"[0-9a-f]+\"" "$1" \
    | head -1 | sed -E 's/.*"([^"]+)"/\1/'
}

db_value() {
  docker-compose -p "$compose_project" -f "$local_dir/docker-compose.yml" \
    exec -T db mariadb -N -uroot -pctfd -e "USE ctfd; $1"
}

login_page="$workspace/login.html"
curl -fsS -c "$cookie_jar" -b "$cookie_jar" -o "$login_page" "$base_url/login"
nonce=$(extract_nonce "$login_page")
[[ -n "$nonce" ]] || { echo "Não foi possível obter o nonce de login." >&2; exit 1; }
login_code=$(curl -sS -c "$cookie_jar" -b "$cookie_jar" -o /dev/null -w '%{http_code}' \
  -X POST "$base_url/login" \
  --data-urlencode "name=$admin_name" \
  --data-urlencode "password=$admin_password" \
  --data-urlencode "nonce=$nonce")
[[ "$login_code" == "302" ]] || { echo "Login técnico retornou HTTP $login_code." >&2; exit 1; }

competition_page="$workspace/competitions.html"
curl -fsS -c "$cookie_jar" -b "$cookie_jar" -o "$competition_page" "$base_url/admin/hikari/competitions"
csrf=$(extract_csrf "$competition_page")
[[ -n "$csrf" ]] || { echo "Não foi possível obter o nonce administrativo." >&2; exit 1; }

active_id=$(rg -o 'competitions/[0-9]+/finish' "$competition_page" | head -1 | rg -o '[0-9]+' || true)
if [[ -n "$active_id" ]]; then
  curl -fsS -c "$cookie_jar" -b "$cookie_jar" -o /dev/null \
    -X POST "$base_url/admin/hikari/competitions/$active_id/finish" \
    --data-urlencode "nonce=$csrf"
fi

challenge_name="Evidência de demonstração $stamp"
run_key="demo-$stamp"
flag="hikari{demonstracao_$stamp}"
marker="hikari-demo-marker-$stamp"
jq -n --arg marker "$marker" --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
  [
    {
      "@timestamp": $timestamp,
      marker: $marker,
      "Source IP": "198.51.100.42",
      "Destination IP": "203.0.113.12",
      "Destination Port": "443",
      "Threat Severity (custom)": "critical",
      "Fortinet Message (custom)": "Credencial exposta usada em acesso remoto.",
      "Event Name": "remote_access",
      "Detect Name (custom)": "Uso de credencial exposta",
      "URL (custom)": "https://portal.example.test/login",
      "Command Line (custom)": "curl https://portal.example.test/login",
      "Service Name (custom)": "HTTPS",
      "Destination Country (custom)": "BR"
    },
    {
      "@timestamp": $timestamp,
      marker: $marker,
      "Source IP": "198.51.100.43",
      "Destination IP": "203.0.113.13",
      "Destination Port": "22",
      "Threat Severity (custom)": "high",
      "Fortinet Message (custom)": "Tentativas repetidas de autenticação SSH.",
      "Event Name": "ssh_authentication",
      "Detect Name (custom)": "Autenticação SSH suspeita",
      "URL (custom)": "ssh://203.0.113.13:22",
      "Command Line (custom)": "ssh analyst@203.0.113.13",
      "Service Name (custom)": "SSH",
      "Destination Country (custom)": "BR"
    },
    {
      "@timestamp": $timestamp,
      marker: $marker,
      "Source IP": "198.51.100.44",
      "Destination IP": "203.0.113.14",
      "Destination Port": "53",
      "Threat Severity (custom)": "medium",
      "Fortinet Message (custom)": "Consulta DNS para domínio recém-observado.",
      "Event Name": "dns_query",
      "Detect Name (custom)": "Consulta para domínio incomum",
      "URL (custom)": "dns://suspicious.example.test",
      "Command Line (custom)": "dig suspicious.example.test",
      "Service Name (custom)": "DNS",
      "Destination Country (custom)": "US"
    },
    {
      "@timestamp": $timestamp,
      marker: $marker,
      "Source IP": "198.51.100.45",
      "Destination IP": "203.0.113.15",
      "Destination Port": "80",
      "Threat Severity (custom)": "low",
      "Fortinet Message (custom)": "Conexão HTTP de inventário.",
      "Event Name": "http_connection",
      "Detect Name (custom)": "Conexão HTTP",
      "URL (custom)": "http://inventory.example.test",
      "Command Line (custom)": "curl http://inventory.example.test",
      "Service Name (custom)": "HTTP",
      "Destination Country (custom)": "DE"
    }
  ]
' > "$log_file"

challenge_code=$(curl -sS -c "$cookie_jar" -b "$cookie_jar" -o /dev/null -w '%{http_code}' \
  -X POST "$base_url/admin/hikari/add-challenge" \
  -F "name=$challenge_name" \
  -F 'category=Forense' \
  -F 'description=Examine os eventos liberados no SIEM e identifique a evidência marcada para esta investigação.' \
  -F 'value=100' \
  -F 'type=hikari' \
  -F "nonce=$csrf" \
  -F "file_log=@$log_file")
[[ "$challenge_code" == "302" ]] || { echo "Criação do desafio retornou HTTP $challenge_code." >&2; exit 1; }

challenge_id=$(db_value "SELECT id FROM challenges WHERE name='${challenge_name}';" | tr -d '[:space:]')
[[ -n "$challenge_id" ]] || { echo "Desafio sintético não encontrado." >&2; exit 1; }

flag_response=$(curl -fsS -c "$cookie_jar" -b "$cookie_jar" \
  -H "Content-Type: application/json" -H "Csrf-Token: $csrf" \
  -X POST "$base_url/api/v1/flags" \
  -d "{\"challenge\":$challenge_id,\"type\":\"static\",\"content\":\"$flag\"}")
[[ "$(jq -r '.success' <<< "$flag_response")" == "true" ]] || { echo "Não foi possível criar a flag sintética." >&2; exit 1; }

run_code=$(curl -sS -c "$cookie_jar" -b "$cookie_jar" -o /dev/null -w '%{http_code}' \
  -X POST "$base_url/admin/hikari/competitions" \
  --data-urlencode "key=$run_key" \
  --data-urlencode 'name=Demonstração controlada' \
  --data-urlencode 'scoring_mode=teams' \
  --data-urlencode 'duration_minutes=60' \
  --data-urlencode "nonce=$csrf")
[[ "$run_code" == "302" ]] || { echo "Criação da execução retornou HTTP $run_code." >&2; exit 1; }
run_id=$(db_value "SELECT id FROM hikari_competition_runs WHERE \`key\`='$run_key';" | tr -d '[:space:]')
[[ -n "$run_id" ]] || { echo "Execução sintética não encontrada." >&2; exit 1; }

start_code=$(curl -sS -c "$cookie_jar" -b "$cookie_jar" -o /dev/null -w '%{http_code}' \
  -X POST "$base_url/admin/hikari/competitions/$run_id/start" \
  --data-urlencode 'start_mode=now' \
  --data-urlencode "nonce=$csrf")
[[ "$start_code" == "302" ]] || { echo "Início da execução retornou HTTP $start_code." >&2; exit 1; }

mkdir -p "$(dirname "$output_file")"
jq -n --argjson challenge_id "$challenge_id" --arg flag "$flag" --arg marker "$marker" \
  '{challengeId:$challenge_id, flag:$flag, marker:$marker}' > "$output_file"
echo "$output_file"
