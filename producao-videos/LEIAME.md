# Produção das demonstrações

Os cinco vídeos e as telas da seção "A plataforma" são gravados na plataforma
real, numa instalação descartável com o cenário fictício Aurora Telecom (o mesmo
do minicurso), equipes e pessoas inventadas e uma prova simulada.

| Passo | Arquivo | O que faz |
| --- | --- | --- |
| 1 | `ambiente.sh` | sobe a instalação `hikaridemo` na porta 8012, instala o pacote Aurora e roda `povoar.py` |
| 2 | `sessoes.py` | imprime os cookies `competidor=` e `admin=` da instalação (vão para `saida/sessoes.txt`) |
| 3 | `narrar.py` | gera a fala de cada cena do `roteiro.json` e mede a duração |
| 4 | `cartoes.js` | desenha os cartões de abertura e fechamento a partir de `cartao.html` |
| 5 | `gravar.js` | grava cada cena pelo tempo da sua fala, quadro a quadro, em 1920×1080 |
| 6 | `encerrar.py` | encerra a prova, para o vídeo do pós-prova |
| 7 | `montar.py` | junta cartões, cenas e fala com transições, normaliza o áudio em −16 LUFS, gera legenda e capa |

`produzir.sh` executa todos os passos em ordem:

```bash
EDGE_TTS=/caminho/edge-tts PLAYWRIGHT=/caminho/playwright-core PYTHON=/caminho/python \
  bash produzir.sh
```

As telas da página saem de `capturas.js`, com a prova em andamento
(logo depois de `ambiente.sh`):

```bash
node capturas.js /caminho/playwright-core saida/sessoes.txt
```

Para desfazer a instalação: `bash ambiente.sh --remover`.

A plataforma aparece em `demonstracao.hikari.test`, nome que o navegador da
gravação resolve para a instalação local. Os scripts usam as fontes e o emblema
do repositório `hikari-platform`, ao lado deste.

A voz é a `pt-BR-ThalitaMultilingualNeural` do Edge TTS. Cada fala do roteiro foi
conferida contra o que a tela mostra; ao mudar uma tela, confira a fala junto.
