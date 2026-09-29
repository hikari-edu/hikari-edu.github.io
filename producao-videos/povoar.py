"""Povoa a instalação de demonstração com uma prova fictícia em andamento.

Roda dentro do contêiner do CTFd, depois que o pacote Aurora foi instalado.
Cria equipes e pessoas inventadas, abre uma execução que começou há duas horas
e meia e distribui acertos, erros e buscas ao longo desse tempo, para que placar,
evolução e destaques tenham o que mostrar. A equipe Farol fica sem o primeiro
acerto do caso 1: é ele que o vídeo do competidor resolve ao vivo.
"""

import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List

from CTFd import create_app

SEMENTE = 20261015
INICIO_HA = timedelta(minutes=150)
DURACAO_EM_MINUTOS = 240
SENHA_DAS_PESSOAS = "demonstracao-aurora"
TRILHAS = (
    ("c1-origem", "c1-contas", "c1-conta", "c1-instante", "c1-servidor", "c1-persistencia"),
    ("c2-dominio", "c2-estacao", "c2-intervalo", "c2-executavel", "c2-pai", "c2-exfiltracao", "c2-volume"),
    ("c3-conta", "c3-grupos", "c3-estacao", "c3-primeiro", "c3-processo", "c3-sombras", "c3-arquivos"),
)


@dataclass(frozen=True)
class EquipeFicticia:
    nome: str
    pessoas: List[str]
    acertos_por_trilha: List[int]


EQUIPES = (
    EquipeFicticia("Farol", ["ana.lima", "bruno.teixeira", "carla.nunes"], [0, 3, 2]),
    EquipeFicticia("Maré Alta", ["diego.ramos", "elisa.campos", "fabio.moraes", "gabi.rocha"], [6, 5, 4]),
    EquipeFicticia("Sentinela", ["heitor.alves", "iara.pinto", "joao.melo"], [6, 4, 5]),
    EquipeFicticia("Mandacaru", ["karen.dias", "lucas.freire", "marta.sena", "nina.prado", "otavio.reis"], [5, 4, 3]),
    EquipeFicticia("Jangada", ["paula.gomes", "rafael.cunha"], [4, 2, 3]),
    EquipeFicticia("Ipê Roxo", ["sara.lopes", "tiago.barros", "ursula.vaz"], [3, 3, 1]),
    EquipeFicticia("Carcará", ["vitor.matos", "wanda.lessa", "yuri.farias"], [2, 1, 2]),
    EquipeFicticia("Baobá", ["zeca.moura", "alice.brito"], [1, 1, 0]),
)


def criar_pessoas_e_equipes(db, Users, Teams):
    equipes = {}
    for ficticia in EQUIPES:
        equipe = Teams(name=ficticia.nome, email=f"{slug(ficticia.nome)}@demonstracao.test",
                       password=SENHA_DAS_PESSOAS)
        db.session.add(equipe)
        db.session.flush()
        for nome in ficticia.pessoas:
            pessoa = Users(name=nome, email=f"{nome}@demonstracao.test", password=SENHA_DAS_PESSOAS,
                           type="user", verified=True, team_id=equipe.id)
            db.session.add(pessoa)
            db.session.flush()
            equipe.captain_id = equipe.captain_id or pessoa.id
        equipes[ficticia.nome] = equipe
    db.session.commit()
    return equipes


def slug(nome: str) -> str:
    return nome.lower().replace(" ", "-").replace("ê", "e").replace("á", "a").replace("é", "e")


def abrir_execucao(db, CompetitionRun, start_run):
    agora = datetime.utcnow()
    execucao = CompetitionRun(key="demonstracao-aurora", name="Demonstração — Aurora Telecom",
                              scoring_mode="teams", duration_minutes=DURACAO_EM_MINUTOS, team_size_limit=5)
    db.session.add(execucao)
    db.session.commit()
    start_run(execucao, agora - INICIO_HA)
    return execucao


def distribuir_acertos(db, equipes, desafio_por_chave, Solves, Fails, sorteio):
    inicio = datetime.utcnow() - INICIO_HA
    janela = INICIO_HA.total_seconds() - 300
    for ficticia in EQUIPES:
        equipe = equipes[ficticia.nome]
        for trilha, quantos in zip(TRILHAS, ficticia.acertos_por_trilha):
            instantes = sorted(sorteio.uniform(0, janela) for _ in range(quantos))
            for chave, segundos in zip(trilha, instantes):
                registrar_acerto(db, equipe, desafio_por_chave[chave], inicio + timedelta(seconds=segundos),
                                 Solves, Fails, sorteio)
    db.session.commit()


def registrar_acerto(db, equipe, desafio, momento, Solves, Fails, sorteio):
    autor = sorteio.choice(equipe.members)
    resposta = desafio.flags[0].content
    if sorteio.random() < 0.3:
        db.session.add(Fails(user_id=autor.id, team_id=equipe.id, challenge_id=desafio.id, ip="127.0.0.1",
                             provided="flag{palpite}", date=momento - timedelta(seconds=sorteio.randint(60, 600))))
    db.session.add(Solves(user_id=autor.id, team_id=equipe.id, challenge_id=desafio.id, ip="127.0.0.1",
                          provided=resposta, date=momento))


def registrar_buscas(db, equipes, execucao, HikariActivity, sorteio):
    agora = datetime.utcnow()
    for equipe in equipes.values():
        for _ in range(sorteio.randint(40, 120)):
            momento = agora - timedelta(seconds=sorteio.uniform(0, INICIO_HA.total_seconds()))
            db.session.add(HikariActivity(competition_key=execucao.key, event_type="kibana.query",
                                          actor_id=sorteio.choice(equipe.members).id, actor_role="user",
                                          team_id=equipe.id, occurred_at=momento, payload={}))
    db.session.commit()


def main():
    app = create_app()
    with app.app_context():
        from CTFd.models import Challenges, Fails, Solves, Teams, Users, db
        from CTFd.plugins.hikari_plugin.hikari_activity.models import HikariActivity
        from CTFd.plugins.hikari_plugin.hikari_competitions.models import CompetitionRun
        from CTFd.plugins.hikari_plugin.hikari_competitions.service import start_run
        from CTFd.plugins.hikari_plugin.hikari_challenge_library.models import ChallengeLibraryEntry

        sorteio = random.Random(SEMENTE)
        desafio_por_chave = {
            entrada.challenge_key: Challenges.query.get(entrada.challenge_id)
            for entrada in ChallengeLibraryEntry.query.all()
        }
        equipes = criar_pessoas_e_equipes(db, Users, Teams)
        execucao = abrir_execucao(db, CompetitionRun, start_run)
        distribuir_acertos(db, equipes, desafio_por_chave, Solves, Fails, sorteio)
        registrar_buscas(db, equipes, execucao, HikariActivity, sorteio)
        print(f"OK {len(equipes)} equipes, execução {execucao.key} em andamento")


if __name__ == "__main__":
    main()
