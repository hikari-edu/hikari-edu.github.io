"""Gera a narração de cada cena do roteiro e mede a duração de cada fala.

A duração medida comanda a gravação: cada cena fica na tela exatamente o tempo
da própria fala, mais uma pausa curta. Por isso a narração vem antes da imagem.

Uso:  python3 narrar.py --edge-tts caminho/para/edge-tts
"""

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Dict

from pydantic import BaseModel

PASTA = Path(__file__).parent
SAIDA = PASTA / "saida" / "narracao"


class Cena(BaseModel):
    id: str
    fala: str


class Video(BaseModel):
    chave: str
    titulo: str
    cenas: list[Cena]


class Roteiro(BaseModel):
    voz: str
    velocidade: str
    videos: list[Video]


def ler_roteiro() -> Roteiro:
    return Roteiro.model_validate_json((PASTA / "roteiro.json").read_text(encoding="utf-8"))


def sintetizar(edge_tts: Path, roteiro: Roteiro, texto: str, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(edge_tts), "--voice", roteiro.voz, f"--rate={roteiro.velocidade}",
         "--text", texto_para_voz(texto), "--write-media", str(destino)],
        check=True, capture_output=True,
    )


def texto_para_voz(texto: str) -> str:
    return re.sub(r"\bHikari\b", "Ricari", texto, flags=re.IGNORECASE)


def duracao(arquivo: Path) -> float:
    medida = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arquivo)],
        check=True, capture_output=True, text=True,
    )
    return round(float(medida.stdout.strip()), 3)


def narrar(edge_tts: Path) -> Dict[str, Dict[str, float]]:
    roteiro = ler_roteiro()
    duracoes: Dict[str, Dict[str, float]] = {}
    for video in roteiro.videos:
        duracoes[video.chave] = {}
        for cena in video.cenas:
            arquivo = SAIDA / video.chave / f"{cena.id}.mp3"
            sintetizar(edge_tts, roteiro, cena.fala, arquivo)
            duracoes[video.chave][cena.id] = duracao(arquivo)
            print(f"  {video.chave}/{cena.id}: {duracoes[video.chave][cena.id]:.1f} s")
    (SAIDA / "duracoes.json").write_text(json.dumps(duracoes, indent=2), encoding="utf-8")
    return duracoes


if __name__ == "__main__":
    analisador = argparse.ArgumentParser(description=__doc__)
    analisador.add_argument("--edge-tts", type=Path, required=True)
    narrar(analisador.parse_args().edge_tts)
