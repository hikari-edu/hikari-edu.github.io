"""Monta os vídeos das demonstrações a partir das cenas gravadas e da narração.

Cada cena é cortada a partir do instante em que a tela ficou pronta, recebe a
fala dela e dura a fala mais uma pausa. As cenas se juntam num vídeo VP9 em
1080p com legenda em português e uma capa, nos caminhos que a página usa.

Uso:  python3 montar.py [video...]
"""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List

from pydantic import BaseModel

PASTA = Path(__file__).parent
SAIDA = PASTA / "saida"
SITE = PASTA.parent / "assets" / "demos"
ATRASO_DA_FALA_S = 0.35
FOLGA_S = 0.9
# A página já publica estes nomes; o vídeo do pós-prova sai com o nome antigo.
# A capa sai do meio da segunda cena, exceto onde outra cena representa melhor o vídeo.
CENA_DA_CAPA = {"siem": "dashboard"}
ARQUIVO_NO_SITE = {"competidor": "competidor", "siem": "siem", "placar": "placar",
                   "operacao": "operacao", "depois": "pesquisa"}


class CenaGravada(BaseModel):
    cena: str
    arquivo: str
    pronto_ms: int
    fala_s: float


class Roteiro(BaseModel):
    videos: List[dict]


def falas() -> Dict[str, Dict[str, str]]:
    roteiro = json.loads((PASTA / "roteiro.json").read_text(encoding="utf-8"))
    return {video["chave"]: {cena["id"]: cena["fala"] for cena in video["cenas"]} for video in roteiro["videos"]}


def rodar(*argumentos: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *argumentos], check=True)


def segmento(cena: CenaGravada, audio: Path, destino: Path) -> float:
    duracao = cena.fala_s + ATRASO_DA_FALA_S + FOLGA_S
    atraso_ms = int(ATRASO_DA_FALA_S * 1000)
    rodar("-ss", f"{cena.pronto_ms / 1000:.3f}", "-i", str(SAIDA / cena.arquivo), "-i", str(audio),
          "-t", f"{duracao:.3f}",
          "-filter_complex", f"[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[v];"
                             f"[1:a]adelay={atraso_ms}|{atraso_ms},aresample=48000,apad[a]",
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
          "-c:a", "libopus", "-b:a", "96k", "-ac", "2", str(destino))
    return duracao


def tempo_vtt(segundos: float) -> str:
    horas, resto = divmod(segundos, 3600)
    minutos, segundos = divmod(resto, 60)
    return f"{int(horas):02d}:{int(minutos):02d}:{segundos:06.3f}"


def legenda(cenas: List[CenaGravada], duracoes: List[float], textos: Dict[str, str]) -> str:
    linhas = ["WEBVTT", ""]
    inicio = 0.0
    for cena, duracao in zip(cenas, duracoes):
        comeca = inicio + ATRASO_DA_FALA_S
        linhas += [f"{tempo_vtt(comeca)} --> {tempo_vtt(comeca + cena.fala_s)}", textos[cena.cena], ""]
        inicio += duracao
    return "\n".join(linhas)


def montar(video: str, cenas: List[CenaGravada], textos: Dict[str, str]) -> None:
    nome = ARQUIVO_NO_SITE[video]
    with tempfile.TemporaryDirectory() as temporaria:
        pasta = Path(temporaria)
        duracoes = [segmento(cena, SAIDA / "narracao" / video / f"{cena.cena}.mp3", pasta / f"{indice:02d}.webm")
                    for indice, cena in enumerate(cenas)]
        lista = pasta / "lista.txt"
        lista.write_text("".join(f"file '{pasta / f'{indice:02d}.webm'}'\n" for indice in range(len(cenas))))
        destino = SITE / f"hikari-demo-{nome}.webm"
        rodar("-f", "concat", "-safe", "0", "-i", str(lista), "-c", "copy", str(destino))
    (SITE / "captions" / f"{nome}.vtt").write_text(legenda(cenas, duracoes, textos), encoding="utf-8")
    posicao = [cena.cena for cena in cenas].index(CENA_DA_CAPA[video]) if video in CENA_DA_CAPA else min(1, len(cenas) - 1)
    capa = sum(duracoes[:posicao]) + duracoes[posicao] * 0.6
    rodar("-ss", f"{capa:.2f}", "-i", str(destino), "-frames:v", "1", "-q:v", "3", str(SITE / "posters" / f"{nome}.jpg"))
    print(f"  {destino.name}: {sum(duracoes):.1f} s, {len(cenas)} cenas")


def main(pedidos: List[str]) -> None:
    gravadas = json.loads((SAIDA / "cenas.json").read_text(encoding="utf-8"))
    textos = falas()
    for video in pedidos or list(gravadas):
        cenas = [CenaGravada.model_validate(cena) for cena in gravadas[video]]
        montar(video, cenas, textos[video])


if __name__ == "__main__":
    analisador = argparse.ArgumentParser(description=__doc__)
    analisador.add_argument("videos", nargs="*")
    main(analisador.parse_args().videos)
