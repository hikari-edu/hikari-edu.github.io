"""Produz aulas narradas dos três casos a partir do PDF didático revisado."""

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


PASTA = Path(__file__).resolve().parent
DESTINO_PADRAO = PASTA.parent / "assets" / "demos"


@dataclass(frozen=True)
class Cena:
    pagina: int
    fala: str


def executar(*argumentos: str) -> None:
    subprocess.run(argumentos, check=True, capture_output=True)


def duracao(arquivo: Path) -> float:
    resultado = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(arquivo)],
        check=True, capture_output=True, text=True,
    )
    return float(resultado.stdout.strip())


def instante(segundos: float) -> str:
    milissegundos = round(segundos * 1000)
    horas, restante = divmod(milissegundos, 3_600_000)
    minutos, restante = divmod(restante, 60_000)
    segundos_inteiros, restante = divmod(restante, 1000)
    return f"{horas:02}:{minutos:02}:{segundos_inteiros:02}.{restante:03}"


def ler_cenas() -> dict[str, list[Cena]]:
    roteiro = json.loads((PASTA / "aulas.json").read_text(encoding="utf-8"))
    return {
        caso: [Cena(pagina=cena["pagina"], fala=cena["fala"]) for cena in cenas]
        for caso, cenas in roteiro.items()
    }


def trechos_da_legenda(fala: str) -> list[str]:
    trechos = []
    palavras = []
    for palavra in fala.split():
        if palavras and len(" ".join([*palavras, palavra])) > 78:
            trechos.append(" ".join(palavras))
            palavras = []
        palavras.append(palavra)
    if palavras:
        trechos.append(" ".join(palavras))
    return trechos


def legendas_da_cena(fala: str, inicio: float, duracao_da_fala: float) -> list[str]:
    trechos = trechos_da_legenda(fala)
    total = sum(len(trecho.split()) for trecho in trechos)
    linhas = []
    acumulado = 0
    for trecho in trechos:
        proximo = acumulado + len(trecho.split())
        comeco = inicio + duracao_da_fala * acumulado / total
        fim = inicio + duracao_da_fala * proximo / total
        linhas.extend([f"{instante(comeco)} --> {instante(fim)}", trecho, ""])
        acumulado = proximo
    return linhas


def produzir_cena(
    cena: Cena, indice: int, pasta: Path, slides: Path, sintetizador: Path,
) -> tuple[Path, float]:
    imagem = pasta / f"{indice:02}.png"
    audio = pasta / f"{indice:02}.mp3"
    video = pasta / f"{indice:02}.mp4"
    executar("pdftoppm", "-f", str(cena.pagina), "-l", str(cena.pagina),
             "-scale-to-x", "1920", "-scale-to-y", "1080", "-png",
             "-singlefile", str(slides), str(imagem.with_suffix("")))
    fala = re.sub(r"\bHikari\b", "Ricari", cena.fala, flags=re.IGNORECASE)
    executar(str(sintetizador), "--voice", "pt-BR-ThalitaMultilingualNeural",
             "--rate=-4%", "--text", fala, "--write-media", str(audio))
    tempo = duracao(audio) + 1.2
    executar("ffmpeg", "-y", "-v", "error", "-loop", "1", "-framerate", "25",
             "-i", str(imagem), "-i", str(audio), "-t", str(tempo),
             "-af", "apad", "-c:v", "libx264", "-preset", "medium",
             "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac",
             "-b:a", "160k", "-movflags", "+faststart", str(video))
    return video, tempo


def produzir_aula(
    caso: str, cenas: list[Cena], slides: Path, sintetizador: Path,
    destino: Path, apenas_legendas: bool,
) -> None:
    pasta = PASTA / "saida" / "aulas" / caso
    pasta.mkdir(parents=True, exist_ok=True)
    segmentos = []
    legendas = ["WEBVTT", ""]
    inicio = 0.0
    for indice, cena in enumerate(cenas, start=1):
        if apenas_legendas:
            tempo = duracao(pasta / f"{indice:02}.mp3") + 1.2
        else:
            segmento, tempo = produzir_cena(cena, indice, pasta, slides, sintetizador)
            segmentos.append(segmento)
        legendas.extend(legendas_da_cena(cena.fala, inicio, tempo - 1.2))
        inicio += tempo
    destino.mkdir(parents=True, exist_ok=True)
    if not apenas_legendas:
        lista = pasta / "segmentos.txt"
        lista.write_text("".join(f"file '{segmento.name}'\n" for segmento in segmentos))
        executar("ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
                 "-i", str(lista), "-c", "copy", "-movflags", "+faststart",
                 str(destino / f"aula-{caso}.mp4"))
    legendas_path = destino / "captions" / f"aula-{caso}.vtt"
    legendas_path.parent.mkdir(parents=True, exist_ok=True)
    legendas_path.write_text("\n".join(legendas), encoding="utf-8")
    print(f"{caso}: {instante(inicio)}")


def main() -> None:
    argumentos = argparse.ArgumentParser(description=__doc__)
    argumentos.add_argument("--slides", type=Path, required=True)
    argumentos.add_argument("--edge-tts", type=Path, required=True)
    argumentos.add_argument("--destino", type=Path, default=DESTINO_PADRAO)
    argumentos.add_argument("--apenas-legendas", action="store_true")
    opcoes = argumentos.parse_args()
    for caso, cenas in ler_cenas().items():
        produzir_aula(caso, cenas, opcoes.slides, opcoes.edge_tts,
                     opcoes.destino, opcoes.apenas_legendas)


if __name__ == "__main__":
    main()
