# -*- coding: utf-8 -*-
"""
Testes de PUT /api/tecnico/registro/{id} e PUT /api/turma-campo/registro/{id}:
- exigem token valido + funcionalidade EDITAR_CADASTRO_TECNICO / EDITAR_CADASTRO_EQUIPE
  ligada ao perfil do usuario (tabela PERFIL_FUNCIONALIDADE), senao 403.
- so atualizam os campos de correcao (nao mexem na chave de dedup do CSV).
"""
import main

USUARIO_COLUNAS = ["LOGIN", "NOME", "EMAIL", "PERFIL_ID", "STATUS", "PERFIL"]


def usuario_row(perfil_id=1, status="A"):
    return ("CLB349328", "Sandy", "sandy@teste.com", perfil_id, status, "ADMINISTRADOR")


def token_valido():
    return main._auth_criar_token({"login": "CLB349328", "email": "sandy@teste.com"})


def auth_header():
    return {"Authorization": f"Bearer {token_valido()}"}


class TestEditarRegistroTecnico():
    COLUNAS_REGISTRO = [
        "ID", "MUNICIPIO", "BAIRRO", "POSTES_EXECUTADOS", "OBSERVACAO",
        "STATUS_APRESENTACAO", "USUARIO_EDICAO", "DATA_EDICAO",
    ]

    def registro_row(self):
        return (1, "Salvador", "Centro", 5, "Corrigido", "APRESENTADO", "CLB349328", "2026-08-09T10:00:00")

    def test_sucesso_quando_perfil_tem_funcionalidade(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(USUARIO_COLUNAS, usuario_row())
        cursor.queue([("EDITAR_CADASTRO_TECNICO",), ("EDITAR_CADASTRO_EQUIPE",)])
        cursor.queue((1,))  # SELECT ID ... existe
        cursor.queue_described(self.COLUNAS_REGISTRO, self.registro_row())

        response = client.put(
            "/api/tecnico/registro/1",
            json={"MUNICIPIO": "Salvador", "BAIRRO": "Centro", "POSTES_EXECUTADOS": 5,
                  "OBSERVACAO": "Corrigido", "STATUS_APRESENTADO": "APRESENTADO"},
            headers=auth_header(),
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["registro"]["MUNICIPIO"] == "Salvador"

    def test_403_quando_perfil_sem_funcionalidade(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(USUARIO_COLUNAS, usuario_row(perfil_id=3))  # COMERCIAL
        cursor.queue([("EDITAR_CONTRATO",)])  # so tem funcionalidade de contrato

        response = client.put(
            "/api/tecnico/registro/1",
            json={"MUNICIPIO": "Salvador"},
            headers=auth_header(),
        )

        assert response.status_code == 403

    def test_401_sem_token(self, client, fake_db):
        response = client.put("/api/tecnico/registro/1", json={"MUNICIPIO": "Salvador"})

        assert response.status_code == 401

    def test_404_quando_registro_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(USUARIO_COLUNAS, usuario_row())
        cursor.queue([("EDITAR_CADASTRO_TECNICO",)])
        cursor.queue(None)  # SELECT ID ... nao existe

        response = client.put(
            "/api/tecnico/registro/999",
            json={"MUNICIPIO": "Salvador"},
            headers=auth_header(),
        )

        assert response.status_code == 404


class TestEditarRegistroTurmaCampo():
    COLUNAS_REGISTRO = [
        "ID", "MUNICIPIO", "BAIRRO", "POSTES_EXECUTADOS", "CABOS_REMOVIDOS", "CAIXAS_REMOVIDAS",
        "OBSERVACAO", "STATUS_APRESENTACAO", "USUARIO_EDICAO", "DATA_EDICAO",
    ]

    def registro_row(self):
        return (1, "Salvador", "Centro", 5, 12.5, 2, "Corrigido", "APRESENTADO", "CLB349328", "2026-08-09T10:00:00")

    def test_sucesso_quando_perfil_tem_funcionalidade(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(USUARIO_COLUNAS, usuario_row(perfil_id=2))  # TECNICO
        cursor.queue([("EDITAR_CADASTRO_TECNICO",), ("EDITAR_CADASTRO_EQUIPE",)])
        cursor.queue((1,))
        cursor.queue_described(self.COLUNAS_REGISTRO, self.registro_row())

        response = client.put(
            "/api/turma-campo/registro/1",
            json={"MUNICIPIO": "Salvador", "CABOS_REMOVIDOS": 12.5, "CAIXAS_REMOVIDAS": 2},
            headers=auth_header(),
        )

        assert response.status_code == 200
        assert response.json()["registro"]["CABOS_REMOVIDOS"] == 12.5

    def test_403_quando_perfil_sem_funcionalidade(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(USUARIO_COLUNAS, usuario_row(perfil_id=3))
        cursor.queue([])  # nenhuma funcionalidade

        response = client.put(
            "/api/turma-campo/registro/1",
            json={"MUNICIPIO": "Salvador"},
            headers=auth_header(),
        )

        assert response.status_code == 403
