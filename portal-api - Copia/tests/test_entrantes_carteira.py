# -*- coding: utf-8 -*-
"""
Testes da Carteira de Análise da Jornada de Entrantes:
- GET /api/novos-entrantes/carteira
- GET /api/novos-entrantes/analistas
- PATCH /api/novos-entrantes/entrada/{id}/atribuir
- GET /api/novos-entrantes/sla-analise
"""


class TestListarCarteira:
    COLUNAS = [
        "ID_ENTRADA", "RAZAO_SOCIAL", "NOME_FANTASIA", "CNPJ", "MUNICIPIO", "UF",
        "STATUS_ENTRADA", "DATA_RECEBIMENTO", "RESPONSAVEL_ANALISE", "PRAZO_ANALISE",
        "DATA_ATRIBUICAO",
    ]

    def test_lista_entrantes_da_fila(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(self.COLUNAS, [
            (1, "Empresa A", "A", "11111111000101", "Salvador", "BA", "NOVO",
             "2026-08-01T10:00:00", None, None, None),
            (2, "Empresa B", "B", "22222222000102", "Feira de Santana", "BA", "ANALISADO",
             "2026-08-02T10:00:00", "CLB349328", "2026-08-10", "2026-08-05T09:00:00"),
        ])

        response = client.get("/api/novos-entrantes/carteira")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["RESPONSAVEL_ANALISE"] is None
        assert body[1]["RESPONSAVEL_ANALISE"] == "CLB349328"


class TestListarAnalistas:
    def test_lista_usuarios_ativos(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(["LOGIN", "NOME"], [
            ("CLB349328", "Sandy Aquino dos Santos"),
        ])

        response = client.get("/api/novos-entrantes/analistas")

        assert response.status_code == 200
        assert response.json() == [{"LOGIN": "CLB349328", "NOME": "Sandy Aquino dos Santos"}]


class TestAtribuirAnalise:
    def test_atribui_responsavel_e_prazo_sem_mudar_status(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("ANALISADO",))  # SELECT STATUS_ENTRADA
        cursor.queue(None)            # UPDATE (sem fetch)

        response = client.patch(
            "/api/novos-entrantes/entrada/1/atribuir",
            json={"responsavel": "CLB349328", "prazo": "2026-08-20"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["responsavel_analise"] == "CLB349328"
        assert body["prazo_analise"] == "2026-08-20"

        sql_update = next(sql for sql, _ in cursor.executed if "UPDATE" in sql.upper())
        assert "STATUS_ENTRADA" not in sql_update.upper()

    def test_404_quando_entrante_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)  # SELECT STATUS_ENTRADA -> nao encontrado

        response = client.patch(
            "/api/novos-entrantes/entrada/999/atribuir",
            json={"responsavel": "CLB349328", "prazo": "2026-08-20"},
        )

        assert response.status_code == 404

    def test_remove_responsavel_quando_payload_vazio(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("NOVO",))
        cursor.queue(None)

        response = client.patch(
            "/api/novos-entrantes/entrada/1/atribuir",
            json={"responsavel": None, "prazo": None},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["responsavel_analise"] is None
        assert body["prazo_analise"] is None


class TestSlaAnalise:
    def test_calcula_taxa_com_itens_dentro_e_fora_do_prazo(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue([
            ("2026-08-20", "2026-08-18T10:00:00"),  # dentro do prazo
            ("2026-08-20", "2026-08-25T10:00:00"),  # fora do prazo
        ])

        response = client.get("/api/novos-entrantes/sla-analise")

        assert response.status_code == 200
        body = response.json()
        assert body == {
            "total_avaliados": 2,
            "dentro_prazo": 1,
            "fora_prazo": 1,
            "taxa_cumprimento_sla": 50.0,
        }

    def test_taxa_zero_quando_nao_ha_itens_avaliaveis(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue([])

        response = client.get("/api/novos-entrantes/sla-analise")

        assert response.status_code == 200
        assert response.json() == {
            "total_avaliados": 0,
            "dentro_prazo": 0,
            "fora_prazo": 0,
            "taxa_cumprimento_sla": 0,
        }
