"""Encerra a execução em andamento da instalação de demonstração, antes do vídeo do pós-prova."""

from datetime import datetime

from CTFd import create_app

app = create_app()
with app.app_context():
    from CTFd.plugins.hikari_plugin.hikari_competitions.service import active_run, finish_run

    execucao = active_run()
    finish_run(execucao, datetime.utcnow())
    print(f"encerrada: {execucao.key} ({execucao.status})")
