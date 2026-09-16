"""Carrega a evidência do cenário Aurora para os notebooks das práticas.

Os eventos seguem o Elastic Common Schema e vêm aninhados, como sairiam do
Elasticsearch. Aqui eles viram uma tabela de colunas planas (`source.ip`,
`user.name`, `event.dataset`), com os mesmos nomes que a consulta KQL usa no
Kibana, para que o notebook e a plataforma falem a mesma língua.
"""

import json
from pathlib import Path
from typing import Dict, List

import pandas as pd

CENARIO = Path(__file__).resolve().parent.parent / "cenario" / "saida"


def ler_eventos(caminho: Path = CENARIO / "aurora-telecom.json") -> pd.DataFrame:
    documentos: List[Dict] = json.loads(Path(caminho).read_text())
    tabela = pd.json_normalize(documentos)
    tabela["@timestamp"] = pd.to_datetime(tabela["@timestamp"], format="ISO8601")
    return tabela.sort_values("@timestamp").reset_index(drop=True)


def ler_gabarito(caminho: Path = CENARIO / "gabarito.json") -> Dict[str, str]:
    """As respostas conferidas por código, por chave da pergunta."""
    estudos = json.loads(Path(caminho).read_text())
    return {pergunta["chave"]: pergunta["resposta"]
            for estudo in estudos for pergunta in estudo["perguntas"]}


def conferir(chave: str, obtido, gabarito: Dict[str, str]) -> str:
    """Compara o que o notebook obteve com o gabarito e diz o resultado."""
    esperado = gabarito[chave]
    bate = str(obtido) == esperado
    return f"{'ok  ' if bate else 'ERRO'} {chave}: obtido {obtido!r}, gabarito {esperado!r}"
