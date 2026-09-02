# -*- coding: utf-8 -*-
"""
Testes dos 3 endpoints de etapa (Fase 2 da refatoração):
analise-cadastral, parecer, contratacao.
Todos seguem o mesmo padrão: _validar_processo_existe (1 SELECT) + INSERT.
"""


class TestAnaliseCadastral:
    def test_registra_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe

        response = client.post(
            "/api/processos/1/analise-cadastral",
            json={
                "id_etapa": 10,
                "dados_conferidos": True,
                "cnpj_validado": True,
                "responsavel_validado": True,
                "contato_confirmado": False,
            },
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

        insert_sql, insert_params = cursor.executed[-1]
        assert "PORTAL_COMPARTILHAMENTO_ANALISE_CADASTRAL" in insert_sql
        # dados_conferidos/cnpj_validado/responsavel_validado -> 'S', contato_confirmado -> 'N'
        assert insert_params[2:6] == ["S", "S", "S", "N"]

    def test_404_quando_processo_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post(
            "/api/processos/999/analise-cadastral",
            json={
                "id_etapa": 10,
                "dados_conferidos": True,
                "cnpj_validado": True,
                "responsavel_validado": True,
                "contato_confirmado": True,
            },
        )

        assert response.status_code == 404


class TestParecer:
    def test_registra_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))

        response = client.post(
            "/api/processos/1/parecer",
            json={"id_etapa": 30, "resultado": "APROVADO", "observacao": "Tudo certo"},
        )

        assert response.status_code == 200
        assert response.json()["success"] is True


class TestContratacao:
    def test_registra_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))

        response = client.post(
            "/api/processos/1/contratacao",
            json={
                "numero_pn": "PN-123",
                "numero_contrato": "CT-456",
                "data_assinatura": "2026-01-15",
                "url_contrato": "https://sharepoint/contrato.pdf",
            },
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_404_quando_processo_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post(
            "/api/processos/999/contratacao",
            json={
                "numero_pn": "PN-123",
                "numero_contrato": "CT-456",
                "url_contrato": "https://sharepoint/contrato.pdf",
            },
        )

        assert response.status_code == 404
