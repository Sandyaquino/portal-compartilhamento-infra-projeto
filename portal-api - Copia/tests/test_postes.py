# -*- coding: utf-8 -*-
"""
Testes do Mapa de Postes/Ocupacoes:
- GET /api/postes/mapa
- GET /api/postes/{barramento}/ocupacoes
- GET /api/postes/operadoras
- GET /api/postes/resumo
"""
import routers.postes as postes_router_module

COLUNAS_MAPA = ["BARRAMENTO", "X", "Y", "TEM_OCUPACAO_IDENTIFICADA"]
COLUNAS_OCUPACOES = ["ID", "BOARD_NAME", "ORGANIZATION_NAME", "CNPJ", "RAZAO_SOCIAL"]
COLUNAS_OPERADORAS = ["ID", "RAZAO_SOCIAL", "CNPJ", "TOTAL_OCUPACOES"]

BBOX = {"min_x": -40, "max_x": -39, "min_y": -13, "max_y": -12}


class TestListarPostesMapa:
    def test_lista_postes_na_bbox(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_MAPA, [
            ("A505042", -39.5, -12.5, "S"),
            ("A052401", -39.2, -12.3, "N"),
        ])

        response = client.get("/api/postes/mapa", params=BBOX)

        assert response.status_code == 200
        body = response.json()
        assert body["truncado"] is False
        assert len(body["postes"]) == 2
        assert body["postes"][0]["BARRAMENTO"] == "A505042"

    def test_trunca_quando_excede_limite(self, client, fake_db, monkeypatch):
        monkeypatch.setattr(postes_router_module, "LIMITE_PONTOS_MAPA", 2)
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_MAPA, [
            ("A1", -39.5, -12.5, "S"),
            ("A2", -39.4, -12.4, "S"),
            ("A3", -39.3, -12.3, "N"),
        ])

        response = client.get("/api/postes/mapa", params=BBOX)

        assert response.status_code == 200
        body = response.json()
        assert body["truncado"] is True
        assert len(body["postes"]) == 2

    def test_filtra_por_operadora(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_MAPA, [])

        response = client.get("/api/postes/mapa", params={**BBOX, "id_operadora": 5})

        assert response.status_code == 200
        sql = cursor.executed[0][0]
        assert 'O."ID_OPERADORA" IN (?)' in sql

    def test_filtra_por_varias_operadoras(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_MAPA, [])

        response = client.get("/api/postes/mapa", params={**BBOX, "id_operadora": [5, 7, 9]})

        assert response.status_code == 200
        sql, params = cursor.executed[0]
        assert 'O."ID_OPERADORA" IN (?,?,?)' in sql
        assert params[-3:] == [5, 7, 9]

    def test_filtra_por_status_identificado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_MAPA, [])

        response = client.get("/api/postes/mapa", params={**BBOX, "status": "identificado"})

        assert response.status_code == 200
        sql = cursor.executed[0][0]
        assert 'O."ORGANIZATION_NAME" IS NOT NULL' in sql

    def test_filtra_por_status_nao_identificado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_MAPA, [])

        response = client.get("/api/postes/mapa", params={**BBOX, "status": "nao_identificado"})

        assert response.status_code == 200
        sql = cursor.executed[0][0]
        assert 'O."ORGANIZATION_NAME" IS NULL' in sql

    def test_rejeita_status_invalido(self, client, fake_db):
        response = client.get("/api/postes/mapa", params={**BBOX, "status": "invalido"})

        assert response.status_code == 400

    def test_exige_parametros_de_bbox(self, client, fake_db):
        response = client.get("/api/postes/mapa")

        assert response.status_code == 422


class TestListarOcupacoesPoste:
    def test_lista_ocupacoes_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # poste existe
        cursor.queue_described(COLUNAS_OCUPACOES, [
            (10, "OI", "TELEMAR NORTE LESTE S/A", "33000118000500", "TELEMAR NORTE LESTE S/A"),
            (11, "NÃO IDENTIFICADA", None, None, None),
        ])

        response = client.get("/api/postes/A505042/ocupacoes")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["ORGANIZATION_NAME"] == "TELEMAR NORTE LESTE S/A"
        assert body[1]["ORGANIZATION_NAME"] is None

    def test_404_quando_poste_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.get("/api/postes/NAOEXISTE/ocupacoes")

        assert response.status_code == 404


class TestListarOperadoras:
    def test_lista_operadoras_ordenadas_com_contagem(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_OPERADORAS, [
            (1, "TELEMAR NORTE LESTE S/A", "33000118000500", 91975),
            (2, "ZHONET LTDA", "48103254000161", 12),
        ])

        response = client.get("/api/postes/operadoras")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["TOTAL_OCUPACOES"] == 91975


class TestObterResumoPostes:
    def test_calcula_percentual_identificado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((113514,))  # total postes
        cursor.queue((277044,))  # total ocupacoes
        cursor.queue((90000,))   # postes identificados

        response = client.get("/api/postes/resumo")

        assert response.status_code == 200
        body = response.json()
        assert body["total_postes"] == 113514
        assert body["postes_identificados"] == 90000
        assert body["percentual_identificado"] == round((90000 / 113514) * 100, 1)

    def test_percentual_zero_sem_postes(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((0,))
        cursor.queue((0,))
        cursor.queue((0,))

        response = client.get("/api/postes/resumo")

        assert response.status_code == 200
        assert response.json()["percentual_identificado"] == 0
