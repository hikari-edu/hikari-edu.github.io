# Produção das demonstrações

Os cinco vídeos da página são gravados na plataforma real, numa instalação
descartável com o cenário fictício Aurora Telecom (o mesmo do minicurso), equipes
e pessoas inventadas e uma prova simulada. Nenhum dado de edição real aparece.

| Passo | Arquivo | O que faz |
| --- | --- | --- |
| 1 | `ambiente.sh` | sobe a instalação `hikaridemo` na porta 8012, instala o pacote Aurora e roda `povoar.py` |
| 2 | `narrar.py` | gera a fala de cada cena do `roteiro.json` e mede a duração |
| 3 | `gravar.js` | grava cada cena pelo tempo da sua fala, com cursor visível |
| 4 | `montar.py` | corta o carregamento, junta fala e imagem, gera legenda e capa |

```bash
bash ambiente.sh
python3 narrar.py --edge-tts /caminho/para/edge-tts
node gravar.js /caminho/para/playwright-core sessoes.txt competidor siem placar operacao
# encerrar a execução da demonstração antes do vídeo do pós-prova
node gravar.js /caminho/para/playwright-core sessoes.txt depois
python3 montar.py
bash ambiente.sh --remover
```

`sessoes.txt` traz duas linhas, `competidor=` e `admin=`, com cookies de sessão da
instalação de demonstração; ele não entra no repositório.

A voz é a `pt-BR-ThalitaMultilingualNeural` do Edge TTS, usada enquanto a
plataforma é distribuída sob licença MIT. Cada fala do roteiro foi conferida
contra o que a tela mostra; ao mudar uma tela, confira a fala junto.
