# -*- coding: utf-8 -*-
"""
Testes da Carteira de Análise expandida pras fases do Processo e Contato:
- GET /api/processos/carteira (por etapa)
- PATCH /api/processos/{id}/jornada/atribuir
- GET /api/processos/carteira-contato
- PATCH /api/processos/{id}/atribuir-contato
- POST/GET /api/processos/{id}/contatos com RESULTADO
- PATCH /api/processos/{id}/contatos/{id_contato}
- GET /api/processos/metricas-contato
- GET /api/processos/sla-etapa
- GET /api/processos/sla-contato
"""


class TestListarCarteiraProcessos:
    COLUNAS = [
        "ID_PROCESSO", "NUMERO_PROTOCOLO", "ETAPA_ATUAL", "NOME_ETAPA_ATUAL",
        "MUNICIPIO", "CNPJ", "RAZAO_SOCIAL", "NOME_FANTASIA",
        "RESPONSAVEL_ETAPA", "PRAZO_ETAPA", "DATA_ATRIBUICAO_ETAPA", "DATA_ENTRADA_ETAPA",
    ]

    def test_lista_processos_ativos(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(self.COLUNAS, [
            (1, "2026-000001", 1, "ANALISE CADASTRAL", "Salvador", "11111111000101",
             "Empresa A", "A", None, None, None, "2026-08-01T10:00:00"),
        ])

        response = client.get("/api/processos/carteira")

        assert response.status_code == 200
        assert response.json()[0]["ID_PROCESSO"] == 1

    def test_filtra_por_etapa(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(self.COLUNAS, [])

        response = client.get("/api/processos/carteira?etapa_id=2")

        assert response.status_code == 200
        sql_executado = cursor.executed[0][0]
        assert "P.ETAPA_ATUAL = ?" in sql_executado


class TestAtribuirEtapa:
    def test_atribui_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))     # _validar_processo_existe
        cursor.queue((100,))   # jornada em andamento
        cursor.queue(None)     # UPDATE

        response = client.patch(
            "/api/processos/1/jornada/atribuir",
            json={"responsavel": "CLB349328", "prazo": "2026-09-01"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["responsavel_etapa"] == "CLB349328"
        assert body["prazo_etapa"] == "2026-09-01"

    def test_404_processo_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.patch(
            "/api/processos/999/jornada/atribuir",
            json={"responsavel": "CLB349328", "prazo": "2026-09-01"},
        )

        assert response.status_code == 404

    def test_404_sem_etapa_em_andamento(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))
        cursor.queue(None)

        response = client.patch(
            "/api/processos/1/jornada/atribuir",
            json={"responsavel": "CLB349328", "prazo": "2026-09-01"},
        )

        assert response.status_code == 404


class TestCarteiraContato:
    COLUNAS = [
        "ID_PROCESSO", "NUMERO_PROTOCOLO", "MUNICIPIO", "CNPJ", "RAZAO_SOCIAL",
        "NOME_FANTASIA", "RESPONSAVEL_CONTATO", "PRAZO_CONTATO",
        "DATA_ATRIBUICAO_CONTATO", "ULTIMO_CONTATO_EM",
    ]

    def test_lista_processos_para_contato(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(self.COLUNAS, [
            (1, "2026-000001", "Salvador", "11111111000101", "Empresa A", "A",
             None, None, None, None),
        ])

        response = client.get("/api/processos/carteira-contato")

        assert response.status_code == 200
        assert response.json()[0]["ID_PROCESSO"] == 1


class TestAtribuirContato:
    def test_atribui_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue(None)  # UPDATE

        response = client.patch(
            "/api/processos/1/atribuir-contato",
            json={"responsavel": "CLB349328", "prazo": "2026-09-10"},
        )

        assert response.status_code == 200
        assert response.json()["responsavel_contato"] == "CLB349328"

    def test_404_processo_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.patch(
            "/api/processos/999/atribuir-contato",
            json={"responsavel": "CLB349328", "prazo": "2026-09-10"},
        )

        assert response.status_code == 404


class TestResultadoContato:
    def test_registrar_contato_com_resultado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue(None)  # INSERT

        response = client.post(
            "/api/processos/1/contatos",
            json={
                "data_contato": "2026-08-09",
                "meio_contato": "TELEFONE",
                "pessoa_contato": "Fulano",
                "observacao": "Tentativa de contato",
                "resultado": "AGUARDANDO",
            },
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

        sql_insert = cursor.executed[-1][0]
        assert "NULL" in sql_insert  # AGUARDANDO nao e resultado final -> sem DATA_RESULTADO

    def test_registrar_contato_com_resultado_final_grava_data_resultado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue(None)  # INSERT

        response = client.post(
            "/api/processos/1/contatos",
            json={
                "data_contato": "2026-08-09",
                "meio_contato": "TELEFONE",
                "pessoa_contato": "Fulano",
                "observacao": "Tentativa de contato",
                "resultado": "RESPONDIDO",
            },
        )

        assert response.status_code == 200
        sql_insert = cursor.executed[-1][0]
        assert "CURRENT_TIMESTAMP" in sql_insert.split("VALUES")[1]  # DATA_RESULTADO gravada

    def test_listar_contatos_traz_resultado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue_described(
            ["ID_CONTATO", "ID_PROCESSO", "DATA_CONTATO", "MEIO_CONTATO",
             "PESSOA_CONTATO", "OBSERVACAO", "RESULTADO", "USUARIO_REGISTRO", "DATA_REGISTRO"],
            [(1, 1, "2026-08-09T10:00:00", "TELEFONE", "Fulano", "obs", "RESPONDIDO", "CLB349328", "2026-08-09T10:05:00")],
        )

        response = client.get("/api/processos/1/contatos")

        assert response.status_code == 200
        assert response.json()[0]["RESULTADO"] == "RESPONDIDO"

    def test_atualizar_resultado_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue((5,))  # contato existe
        cursor.queue(None)  # UPDATE

        response = client.patch(
            "/api/processos/1/contatos/5",
            json={"resultado": "RESPONDIDO"},
        )

        assert response.status_code == 200
        assert response.json()["resultado"] == "RESPONDIDO"

        sql_update = cursor.executed[-1][0]
        assert "DATA_RESULTADO = CURRENT_TIMESTAMP" in sql_update

    def test_atualizar_resultado_para_aguardando_nao_grava_data(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue((5,))  # contato existe
        cursor.queue(None)  # UPDATE

        response = client.patch(
            "/api/processos/1/contatos/5",
            json={"resultado": "AGUARDANDO"},
        )

        assert response.status_code == 200
        sql_update = cursor.executed[-1][0]
        assert "DATA_RESULTADO = NULL" in sql_update

    def test_404_contato_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))
        cursor.queue(None)

        response = client.patch(
            "/api/processos/1/contatos/999",
            json={"resultado": "RESPONDIDO"},
        )

        assert response.status_code == 404


class TestMetricasContato:
    def test_calcula_taxa_de_contato(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((10, 6, 2, 2))  # total, respondidos, sem_resposta, aguardando

        response = client.get("/api/processos/metricas-contato")

        assert response.status_code == 200
        body = response.json()
        assert body["taxa_contato"] == 75.0  # 6 / (6+2)

    def test_taxa_zero_sem_contatos_resolvidos(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((3, 0, 0, 3))  # so tem contatos aguardando

        response = client.get("/api/processos/metricas-contato")

        assert response.status_code == 200
        assert response.json()["taxa_contato"] == 0


class TestSlaEtapa:
    def test_calcula_taxa_com_itens_dentro_e_fora_do_prazo(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue([
            ("2026-08-20", "2026-08-18T10:00:00"),  # dentro do prazo
            ("2026-08-20", "2026-08-25T10:00:00"),  # fora do prazo
            ("2026-08-20", "2026-08-20T23:59:00"),  # dentro do prazo (mesmo dia)
        ])

        response = client.get("/api/processos/sla-etapa")

        assert response.status_code == 200
        body = response.json()
        assert body == {
            "total_avaliados": 3,
            "dentro_prazo": 2,
            "fora_prazo": 1,
            "taxa_cumprimento_sla": 66.7,
        }

    def test_filtra_por_etapa_id(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue([])

        response = client.get("/api/processos/sla-etapa?etapa_id=2")

        assert response.status_code == 200
        sql_executado = cursor.executed[0][0]
        assert "ID_ETAPA = ?" in sql_executado

    def test_taxa_zero_quando_nao_ha_itens_avaliaveis(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue([])

        response = client.get("/api/processos/sla-etapa")

        assert response.status_code == 200
        assert response.json() == {
            "total_avaliados": 0,
            "dentro_prazo": 0,
            "fora_prazo": 0,
            "taxa_cumprimento_sla": 0,
        }


class TestSlaContato:
    def test_calcula_taxa_com_itens_dentro_e_fora_do_prazo(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue([
            ("2026-08-20", "2026-08-18T10:00:00"),  # dentro do prazo
            ("2026-08-20", "2026-08-25T10:00:00"),  # fora do prazo
        ])

        response = client.get("/api/processos/sla-contato")

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

        response = client.get("/api/processos/sla-contato")

        assert response.status_code == 200
        assert response.json() == {
            "total_avaliados": 0,
            "dentro_prazo": 0,
            "fora_prazo": 0,
            "taxa_cumprimento_sla": 0,
        }
