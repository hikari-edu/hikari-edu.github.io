# Práticas em notebook

Um notebook por estudo de caso, com os mesmos passos que o capítulo percorre no
Kibana: a consulta ingênua que cai na isca, a pergunta refinada que responde à
hipótese, os pivôs e a conferência das respostas contra o gabarito.

```bash
cd cenario && python3 gerar.py     # escreve saida/aurora-telecom.json e saida/gabarito.json
cd ../notebooks
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/jupyter lab              # abra caso1.ipynb, caso2.ipynb, caso3.ipynb
```

Os notebooks leem a evidência de `../cenario/saida/`. Eles não dependem do
Kibana nem da plataforma: servem para quem prefere o caderno, e para conferir em
casa o que foi feito na tela durante o minicurso. A última célula de cada um
compara o resultado obtido com o gabarito e imprime `ok` ou `ERRO` por pergunta.
