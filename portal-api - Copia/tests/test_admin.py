# -*- coding: utf-8 -*-
"""
Testes de /api/admin/**: usuários, perfis, funcionalidades e permissões.
Todas as rotas exigem que o PERFIL do usuário do token seja literalmente
ADMINISTRADOR (_exigir_perfil_administrador) - regra de negócio explícita,
não usa o catálogo de funcionalidades como as demais telas do portal.
"""
import main

USUARIO_COLUNAS = ["LOGIN", "NOME", "EMAIL", "PERFIL_ID", "STATUS", "PERFIL"]


def usuario_row(perfil_id=1, status="A", perfil="ADMINISTRADOR"):
    return ("CLB349328", "Sandy", "sandy@teste.com", perfil_id, status, perfil)


def token_valido():
    return main._auth_criar_token({"login": "CLB349328", "email": "sandy@teste.com"})


def auth_header():
    return {"Authorization": f"Bearer {token_valido()}"}


def queue_auth_ok(cursor, perfil="ADMINISTRADOR"):
    cursor.queue_described(USUARIO_COLUNAS, usuario_row(perfil=perfil))


class TestUsuarios:
    LISTA_COLUNAS = ["LOGIN", "NOME", "EMAIL", "PERFIL_ID", "PERFIL", "STATUS", "ULTIMO_LOGIN", "EMPRESA", "TELEFONE"]

    def test_listar_sucesso(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue_described(self.LISTA_COLUNAS, [
            ("CLB349328", "Sandy", "sandy@teste.com", 1, "ADMINISTRADOR", "A", None, None, None),
        ])

        response = client.get("/api/admin/usuarios", headers=auth_header())

        assert response.status_code == 200
        assert response.json()[0]["LOGIN"] == "CLB349328"

    def test_listar_403_quando_perfil_nao_e_administrador(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor, perfil="TECNICO")

        response = client.get("/api/admin/usuarios", headers=auth_header())

        assert response.status_code == 403

    def test_listar_401_sem_token(self, client, fake_db):
        response = client.get("/api/admin/usuarios")

        assert response.status_code == 401

    def test_criar_sucesso(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue((2,))    # perfil existe
        cursor.queue(None)    # login nao existe
        cursor.queue(None)    # email nao existe

        response = client.post(
            "/api/admin/usuarios",
            json={"login": "NOVO123", "nome": "Novo Usuario", "email": "novo@teste.com", "perfil_id": 2},
            headers=auth_header(),
        )

        assert response.status_code == 200
        body = response.json()
        assert body["usuario"]["LOGIN"] == "NOVO123"
        assert body["usuario"]["STATUS"] == "A"

    def test_criar_login_duplicado(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue((2,))            # perfil existe
        cursor.queue(("NOVO123",))    # login ja existe

        response = client.post(
            "/api/admin/usuarios",
            json={"login": "NOVO123", "nome": "Novo Usuario", "email": "novo@teste.com", "perfil_id": 2},
            headers=auth_header(),
        )

        assert response.status_code == 409

    def test_criar_email_duplicado(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue((2,))          # perfil existe
        cursor.queue(None)          # login nao existe
        cursor.queue(("OUTRO",))    # email ja usado por outro login

        response = client.post(
            "/api/admin/usuarios",
            json={"login": "NOVO123", "nome": "Novo Usuario", "email": "sandy@teste.com", "perfil_id": 2},
            headers=auth_header(),
        )

        assert response.status_code == 409

    def test_criar_perfil_inexistente(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(None)  # perfil nao existe

        response = client.post(
            "/api/admin/usuarios",
            json={"login": "NOVO123", "nome": "Novo Usuario", "email": "novo@teste.com", "perfil_id": 999},
            headers=auth_header(),
        )

        assert response.status_code == 400

    def test_editar_sucesso(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(("CLB349328",))  # usuario existe
        cursor.queue((1,))            # perfil existe
        cursor.queue(None)            # email nao usado por outro login

        response = client.put(
            "/api/admin/usuarios/CLB349328",
            json={"nome": "Sandy Editada", "email": "sandy@teste.com", "perfil_id": 1, "status": "A"},
            headers=auth_header(),
        )

        assert response.status_code == 200
        assert response.json()["usuario"]["NOME"] == "Sandy Editada"

    def test_editar_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(None)  # usuario nao existe

        response = client.put(
            "/api/admin/usuarios/NAOEXISTE",
            json={"nome": "X", "email": "x@teste.com", "perfil_id": 1, "status": "A"},
            headers=auth_header(),
        )

        assert response.status_code == 404

    def test_editar_status_invalido(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)

        response = client.put(
            "/api/admin/usuarios/CLB349328",
            json={"nome": "Sandy", "email": "sandy@teste.com", "perfil_id": 1, "status": "X"},
            headers=auth_header(),
        )

        assert response.status_code == 400


class TestPerfis:
    LISTA_COLUNAS = ["ID", "NOME", "DESCRICAO", "QTD_USUARIOS"]

    def test_listar_sucesso(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue_described(self.LISTA_COLUNAS, [(1, "ADMINISTRADOR", "Acesso total", 1)])

        response = client.get("/api/admin/perfis", headers=auth_header())

        assert response.status_code == 200
        assert response.json()[0]["NOME"] == "ADMINISTRADOR"

    def test_criar_sucesso(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(None)   # nome nao existe
        cursor.queue((3,))   # MAX(ID)+1 ja calculado pela query -> 3

        response = client.post(
            "/api/admin/perfis",
            json={"nome": "FISCAL", "descricao": "Perfil de fiscalizacao"},
            headers=auth_header(),
        )

        assert response.status_code == 200
        assert response.json()["perfil"]["ID"] == 3

    def test_criar_nome_duplicado(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue((1,))  # ja existe perfil com esse nome

        response = client.post(
            "/api/admin/perfis",
            json={"nome": "ADMINISTRADOR"},
            headers=auth_header(),
        )

        assert response.status_code == 409

    def test_editar_sucesso_perfil_comum(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(("TECNICO",))  # nome atual do perfil 2, nao e administrador
        cursor.queue(None)          # nenhum outro perfil com o novo nome

        response = client.put(
            "/api/admin/perfis/2",
            json={"nome": "TECNICO_CAMPO", "descricao": "renomeado"},
            headers=auth_header(),
        )

        assert response.status_code == 200
        assert response.json()["perfil"]["NOME"] == "TECNICO_CAMPO"

    def test_editar_bloqueia_renomear_perfil_administrador(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(("ADMINISTRADOR",))  # nome atual do perfil 1

        response = client.put(
            "/api/admin/perfis/1",
            json={"nome": "OUTRONOME", "descricao": "x"},
            headers=auth_header(),
        )

        assert response.status_code == 400

    def test_excluir_bloqueia_perfil_administrador(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(("ADMINISTRADOR",))  # nome atual do perfil 1

        response = client.delete("/api/admin/perfis/1", headers=auth_header())

        assert response.status_code == 400

    def test_excluir_bloqueado_com_usuarios(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(("TECNICO",))  # perfil existe, nao e administrador
        cursor.queue((2,))   # 2 usuarios vinculados

        response = client.delete("/api/admin/perfis/1", headers=auth_header())

        assert response.status_code == 409

    def test_excluir_sucesso(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue(("FISCAL",))  # perfil existe, nao e administrador
        cursor.queue((0,))   # nenhum usuario vinculado

        response = client.delete("/api/admin/perfis/5", headers=auth_header())

        assert response.status_code == 200
        assert response.json()["success"] is True


class TestFuncionalidadesEPermissoes:
    def test_listar_funcionalidades_do_perfil(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue([(1,), (2,), (9,)])

        response = client.get("/api/admin/perfis/1/funcionalidades", headers=auth_header())

        assert response.status_code == 200
        assert response.json()["funcionalidade_ids"] == [1, 2, 9]

    def test_substituir_funcionalidades_do_perfil(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue((1,))    # perfil existe
        cursor.queue((16,))   # MAX(ID) atual da tabela de vinculo

        response = client.put(
            "/api/admin/perfis/1/funcionalidades",
            json={"funcionalidade_ids": [1, 2, 9]},
            headers=auth_header(),
        )

        assert response.status_code == 200
        assert response.json()["funcionalidade_ids"] == [1, 2, 9]

    def test_listar_permissoes_do_perfil(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue_described(
            ["MODULO_ID", "VISUALIZAR", "EDITAR", "EXCLUIR", "EXPORTAR"],
            [(1, "S", "S", "S", "S")],
        )

        response = client.get("/api/admin/perfis/1/permissoes", headers=auth_header())

        assert response.status_code == 200
        assert response.json()[0]["MODULO_ID"] == 1

    def test_salvar_permissoes_do_perfil(self, client, fake_db):
        _, cursor = fake_db
        queue_auth_ok(cursor)
        cursor.queue((1,))   # perfil existe
        cursor.queue((9,))   # MAX(ID) atual da PERMISSAO

        response = client.put(
            "/api/admin/perfis/1/permissoes",
            json={"permissoes": [
                {"modulo_id": 4, "visualizar": True, "editar": True, "excluir": False, "exportar": True},
            ]},
            headers=auth_header(),
        )

        assert response.status_code == 200
        assert response.json()["success"] is True
