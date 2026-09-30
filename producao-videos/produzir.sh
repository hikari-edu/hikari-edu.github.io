#!/usr/bin/env bash
# Produz as demonstrações do zero: ambiente fictício, narração, cartões, gravação e montagem.
#
# Uso:  EDGE_TTS=/caminho/edge-tts PLAYWRIGHT=/caminho/playwright-core PYTHON=/caminho/python \
#         bash produzir.sh [competidor siem placar operacao depois]
#
# PYTHON precisa ter pydantic. O ambiente é recriado a cada execução, porque as
# cenas mudam o estado da prova: a competidora erra, acerta e compra uma dica, e o
# vídeo do pós-prova só pode ser gravado com a prova encerrada.

set -euo pipefail

PASTA=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
: "${EDGE_TTS:?defina EDGE_TTS}" "${PLAYWRIGHT:?defina PLAYWRIGHT}"
PYTHON=${PYTHON:-python3}
VIDEOS=("$@")
[[ ${#VIDEOS[@]} -gt 0 ]] || VIDEOS=(competidor siem placar operacao depois)
SESSOES="$PASTA/saida/sessoes.txt"

cd "$PASTA"
mkdir -p saida
bash ambiente.sh --remover
bash ambiente.sh

docker cp sessoes.py hikaridemo-ctfd-1:/tmp/sessoes.py
docker exec hikaridemo-ctfd-1 env PYTHONPATH=/opt/CTFd python /tmp/sessoes.py ana.lima 2>/dev/null \
  | grep -E '^(competidor|admin)=' > "$SESSOES"

"$PYTHON" narrar.py --edge-tts "$EDGE_TTS"
node cartoes.js "$PLAYWRIGHT"

antes=() depois=()
for video in "${VIDEOS[@]}"; do
  if [[ "$video" == depois ]]; then depois+=("$video"); else antes+=("$video"); fi
done
rm -rf saida/cenas saida/cenas.json
[[ ${#antes[@]} -eq 0 ]] || node gravar.js "$PLAYWRIGHT" "$SESSOES" "${antes[@]}"
if [[ ${#depois[@]} -gt 0 ]]; then
  docker cp encerrar.py hikaridemo-ctfd-1:/tmp/encerrar.py
  docker exec hikaridemo-ctfd-1 env PYTHONPATH=/opt/CTFd python /tmp/encerrar.py 2>/dev/null | tail -1
  node gravar.js "$PLAYWRIGHT" "$SESSOES" depois
fi
"$PYTHON" montar.py "${VIDEOS[@]}"
echo "Produção concluída: ${VIDEOS[*]}"
