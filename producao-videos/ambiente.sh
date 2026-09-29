#!/usr/bin/env bash
# Sobe uma instalação descartável do Hikari só para gravar as demonstrações.
#
# Tudo que aparece nos vídeos é fictício: o cenário Aurora Telecom do minicurso,
# equipes e pessoas inventadas e uma prova simulada. Nenhum dado de edição real
# entra aqui, e a instalação de operação local não é tocada.
#
# Uso:  bash producao-videos/ambiente.sh          sobe e povoa
#       bash producao-videos/ambiente.sh --remover apaga a instalação

set -euo pipefail

PASTA=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PLATAFORMA=${HIKARI_PLATFORM_DIR:-"$PASTA/../../hikari/hikari-platform"}
LOCAL="$PLATAFORMA/deploy/local"
PACOTE="$PLATAFORMA/minicurso-threat-hunting/cenario/saida/minicurso-aurora.zip"

export COMPOSE_PROJECT_NAME=hikaridemo
export COMPOSE_FILE="$LOCAL/docker-compose.yml"
export CTFD_PORT=8012 MAIL_UI_PORT=8013 MAIL_SMTP_PORT=8014
export CTFD_URL="http://localhost:$CTFD_PORT"
export HIKARI_ACCEPTANCE_CONTEXT=1
export ES_JAVA_OPTS="-Xms512m -Xmx1g"
export KIBANA_NODE_OPTIONS="--max-old-space-size=1024"
export KAFKA_HEAP_OPTS="-Xms192m -Xmx384m"
export LS_JAVA_OPTS="-Xms128m -Xmx256m"
export HIKARI_GOOGLE_CLIENT_ID= HIKARI_GOOGLE_CLIENT_SECRET=

source "$LOCAL/lib/compose.sh"

if [[ "${1:-}" == "--remover" ]]; then
  hikari_compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans
  exit 0
fi

esperar_plataforma() {
  until curl -s -o /dev/null -w '%{http_code}' "$CTFD_URL/" | grep -qE '200|302'; do sleep 3; done
  until hikari_compose -p "$COMPOSE_PROJECT_NAME" exec -T kibana \
      curl -s localhost:5601/hikari/kibana/api/status 2>/dev/null | grep -q '"level":"available"'; do
    sleep 5
  done
}

hikari_compose -p "$COMPOSE_PROJECT_NAME" up -d --build
esperar_plataforma

cd "$LOCAL"
for passo in setup_ctfd ensure_admin apply_theme apply_branding configure_siem import_siem_dashboards; do
  bash "scripts/$passo.sh"
done

bash scripts/substituir_cenario.sh "$PACOTE"

hikari_compose cp "$PASTA/povoar.py" ctfd:/tmp/povoar.py
hikari_compose exec -T ctfd env PYTHONPATH=/opt/CTFd python /tmp/povoar.py 2>/dev/null | grep -E '^(OK|ERRO)'
echo "Instalação de demonstração em $CTFD_URL"
