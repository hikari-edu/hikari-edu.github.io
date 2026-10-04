"""Monta os vídeos das demonstrações a partir das cenas gravadas, da narração e dos cartões.

Cada cena é cortada a partir do instante em que a tela ficou pronta e recebe a
sua fala. O vídeo abre com o cartão do título, fecha com o cartão da marca, e
toda passagem entre partes é uma transição cruzada de imagem e som. O áudio sai
normalizado em -16 LUFS, a legenda acompanha os tempos já com as transições, e
a capa vem da cena que melhor representa o vídeo.

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
ATRASO_DA_FALA_S = 0.45
FOLGA_S = 0.8
ABERTURA_S = 2.4
FECHAMENTO_S = 2.8
TRANSICAO_S = 0.4
QUADROS = 30
CODIFICACAO = ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-row-mt", "1",
               "-deadline", "good", "-cpu-used", "2", "-pix_fmt", "yuv420p"]
# A capa sai do meio da segunda cena, exceto onde outra cena representa melhor o vídeo.
CENA_DA_CAPA = {"siem": "dashboard"}
# A página já publica estes nomes; o vídeo do pós-prova sai com o nome antigo.
ARQUIVO_NO_SITE = {"competidor": "competidor", "caso1": "caso1", "caso2": "caso2",
                   "caso3": "caso3", "siem": "siem", "placar": "placar",
                   "operacao": "operacao", "depois": "pesquisa"}


class CenaGravada(BaseModel):
    cena: str
    arquivo: str
    pronto_ms: int
    fala_s: float

    @property
    def duracao(self) -> float:
        return self.fala_s + ATRASO_DA_FALA_S + FOLGA_S


def falas() -> Dict[str, Dict[str, str]]:
    roteiro = json.loads((PASTA / "roteiro.json").read_text(encoding="utf-8"))
    return {video["chave"]: {cena["id"]: cena["fala"] for cena in video["cenas"]} for video in roteiro["videos"]}


def rodar(*argumentos: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *argumentos], check=True)


def duracao_audio(arquivo: Path) -> float:
    medida = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(arquivo)],
        check=True, capture_output=True, text=True,
    )
    return float(medida.stdout.strip())


def parte_da_cena(cena: CenaGravada, audio: Path, destino: Path) -> None:
    atraso_ms = int(ATRASO_DA_FALA_S * 1000)
    rodar("-ss", f"{cena.pronto_ms / 1000:.3f}", "-i", str(SAIDA / cena.arquivo), "-i", str(audio),
          "-t", f"{cena.duracao:.3f}",
          "-filter_complex", f"[0:v]fps={QUADROS},scale=1920:1080:flags=lanczos,setsar=1[v];"
                             f"[1:a]adelay={atraso_ms}|{atraso_ms},aresample=48000,aformat=channel_layouts=stereo,apad[a]",
          "-map", "[v]", "-map", "[a]", *CODIFICACAO, "-c:a", "libopus", "-b:a", "128k", str(destino))


def parte_do_cartao(imagem: Path, duracao: float, destino: Path) -> None:
    rodar("-loop", "1", "-t", f"{duracao:.3f}", "-i", str(imagem),
          "-f", "lavfi", "-t", f"{duracao:.3f}", "-i", "anullsrc=r=48000:cl=stereo",
          "-filter_complex", f"[0:v]fps={QUADROS},scale=1920:1080,setsar=1[v]",
          "-map", "[v]", "-map", "1:a", *CODIFICACAO, "-c:a", "libopus", "-b:a", "128k", str(destino))


def juntar(partes: List[Path], duracoes: List[float], destino: Path) -> None:
    """Encadeia as partes com transição cruzada e normaliza o áudio do resultado."""
    entradas = [argumento for parte in partes for argumento in ("-i", str(parte))]
    filtros, video, audio, acumulado = [], "[0:v]", "[0:a]", duracoes[0]
    for indice in range(1, len(partes)):
        deslocamento = acumulado - TRANSICAO_S
        filtros.append(f"{video}[{indice}:v]xfade=transition=fade:duration={TRANSICAO_S}:offset={deslocamento:.3f}[v{indice}]")
        filtros.append(f"{audio}[{indice}:a]acrossfade=d={TRANSICAO_S}[a{indice}]")
        video, audio = f"[v{indice}]", f"[a{indice}]"
        acumulado = deslocamento + duracoes[indice]
    filtros.append(f"{audio}loudnorm=I=-16:TP=-2.5:LRA=11,aresample=48000[saida_a]")
    rodar(*entradas, "-filter_complex", ";".join(filtros), "-map", video, "-map", "[saida_a]",
          *CODIFICACAO, "-c:a", "libopus", "-b:a", "128k", str(destino))


def tempo_vtt(segundos: float) -> str:
    horas, resto = divmod(segundos, 3600)
    minutos, segundos = divmod(resto, 60)
    return f"{int(horas):02d}:{int(minutos):02d}:{segundos:06.3f}"


def inicios_das_cenas(cenas: List[CenaGravada]) -> List[float]:
    """Instante em que cada cena começa no vídeo final, já descontadas as transições."""
    inicios, relogio = [], ABERTURA_S - TRANSICAO_S
    for cena in cenas:
        inicios.append(relogio)
        relogio += cena.duracao - TRANSICAO_S
    return inicios


def legenda(video: str, cenas: List[CenaGravada], textos: Dict[str, str]) -> str:
    linhas = ["WEBVTT", ""]
    for cena, inicio in zip(cenas, inicios_das_cenas(cenas)):
        audio = SAIDA / "narracao" / video / f"{cena.cena}.mp3"
        fala_s = duracao_audio(audio)
        if fala_s > cena.fala_s + 0.4:
            raise ValueError(f"A narração de {cena.cena} excede a cena gravada")
        comeca = inicio + ATRASO_DA_FALA_S
        linhas += [f"{tempo_vtt(comeca)} --> {tempo_vtt(comeca + fala_s)}", textos[cena.cena], ""]
    return "\n".join(linhas)


def instante_da_capa(video: str, cenas: List[CenaGravada]) -> float:
    nomes = [cena.cena for cena in cenas]
    posicao = nomes.index(CENA_DA_CAPA[video]) if video in CENA_DA_CAPA else min(1, len(cenas) - 1)
    return inicios_das_cenas(cenas)[posicao] + cenas[posicao].duracao * 0.6


def montar(video: str, cenas: List[CenaGravada], textos: Dict[str, str]) -> None:
    nome = ARQUIVO_NO_SITE[video]
    destino = SITE / f"hikari-demo-{nome}.webm"
    legendas = legenda(video, cenas, textos)
    with tempfile.TemporaryDirectory() as temporaria:
        pasta = Path(temporaria)
        partes, duracoes = [pasta / "abertura.webm"], [ABERTURA_S]
        parte_do_cartao(SAIDA / "cartoes" / f"{video}-abertura.png", ABERTURA_S, partes[0])
        for indice, cena in enumerate(cenas):
            parte = pasta / f"{indice:02d}.webm"
            parte_da_cena(cena, SAIDA / "narracao" / video / f"{cena.cena}.mp3", parte)
            partes.append(parte)
            duracoes.append(cena.duracao)
        partes.append(pasta / "fechamento.webm")
        duracoes.append(FECHAMENTO_S)
        parte_do_cartao(SAIDA / "cartoes" / "fechamento.png", FECHAMENTO_S, partes[-1])
        juntar(partes, duracoes, destino)
    (SITE / "captions" / f"{nome}.vtt").write_text(legendas, encoding="utf-8")
    rodar("-ss", f"{instante_da_capa(video, cenas):.2f}", "-i", str(destino), "-frames:v", "1", "-q:v", "3",
          str(SITE / "posters" / f"{nome}.jpg"))
    total = sum(duracoes) - TRANSICAO_S * (len(duracoes) - 1)
    print(f"  {destino.name}: {total:.1f} s, {len(cenas)} cenas")


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
