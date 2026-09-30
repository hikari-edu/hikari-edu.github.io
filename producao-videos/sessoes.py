"""Imprime cookies de sessão da instalação de demonstração.

Roda dentro do contêiner do CTFd. A primeira linha é a da competidora fictícia
pedida; a segunda, a do administrador. Nada é gravado no banco.

Uso:  python sessoes.py ana.lima > sessoes.txt
"""

import sys

from CTFd import create_app
from CTFd.models import Users
from CTFd.utils.security.signing import hmac

app = create_app()


def cookie(usuario) -> str:
    cliente = app.test_client()
    with cliente.session_transaction() as sessao:
        sessao["id"] = usuario.id
        sessao["hash"] = hmac(usuario.password)
    cliente.get("/")
    return next(biscoito.value for biscoito in cliente.cookie_jar if biscoito.name == "session")


with app.app_context():
    competidora = Users.query.filter_by(name=sys.argv[1]).one()
    administrador = Users.query.filter_by(type="admin").order_by(Users.id).first()
    print("competidor=" + cookie(competidora))
    print("admin=" + cookie(administrador))
