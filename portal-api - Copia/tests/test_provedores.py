# -*- coding: utf-8 -*-
"""Testes de routers/provedores.py: perfil do provedor, timeline unificada
e criação de novo processo/PN para um provedor já existente."""

PROVEDOR_COLUNAS = ["ID_PROVEDOR", "CNPJ", "RAZAO_SOCIAL", "NOME_FANTASIA", "RESPONSAVEL", "EMAIL", "TELEFONE", "STATUS_CADASTRO"]
ENTRADA_RESUMO_COLUNAS = ["ID_ENTRADA", "DATA_RECEBIMENTO", "STATUS_ENTRADA", "MUNICIPIO"]
PROCESSO_RESUMO_COLUNAS = [
    "ID_PROCESSO", "NUMERO_PROTOCOLO", "TIPO_PROCESSO", "STATUS_ATUAL",
    "ETAPA_ATUAL", "NOME_ETAPA_ATUAL", "DT_ABERTURA", "DT_PREVISAO_CONCLUSAO", "DT_CONCLUSAO",
]


def provedor_row(id_provedor=1, cnpj="12345678000190"):
    return (id_provedor, cnpj, "Empresa Teste LTDA", "Empresa Teste", "Fulano", "fulano@teste.com", "71999999999", "ATIVO")


class TestObterProvedor:
    def test_perfil_completo_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(PROVEDOR_COLUNAS, provedor_row())
        cursor.queue_described(ENTRADA_RESUMO_COLUNAS, (10, "2026-07-01T10:00:00", "PROCESSO_CRIADO", "Salvador"))
        cursor.queue_described(
            PROCESSO_RESUMO_COLUNAS,
            [(100, "2026-000100", "REGULARIZACAO_CADASTRAL", "EM_ANDAMENTO", 1, "ANALISE CADASTRAL", "2026-07-02T10:00:00", None, None)],
        )

        response = client.get("/api/provedores/1")

        assert response.status_code == 200
        body = response.json()
        assert body["provedor"]["CNPJ"] == "12345678000190"
        assert body["entrada"]["ID_ENTRADA"] == 10
        assert len(body["processos"]) == 1
        assert body["processos"][0]["NUMERO_PROTOCOLO"] == "2026-000100"

    def test_404_quando_provedor_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.get("/api/provedores/999")

        assert response.status_code == 404

    def test_entrada_null_quando_nao_encontrada(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(PROVEDOR_COLUNAS, provedor_row())
        cursor.queue(None)  # nenhuma entrada com esse CNPJ
        cursor.queue_described(PROCESSO_RESUMO_COLUNAS, [])

        response = client.get("/api/provedores/1")

        assert response.status_code == 200
        assert response.json()["entrada"] is None


class TestTimelineProvedor:
    def test_timeline_ordenada_por_data(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("12345678000190",))  # SELECT CNPJ
        cursor.queue((10,))  # SELECT ID_ENTRADA
        cursor.queue([
            (None, "NOVO", "CLB349328", None, "2026-07-01T09:00:00"),
            ("NOVO", "ANALISADO", "CLB349328", "ok", "2026-07-02T09:00:00"),
        ])  # historico entrada
        cursor.queue([(100, "2026-000100")])  # processos do provedor
        cursor.queue([
            ("ANALISE CADASTRAL", "EM_ANDAMENTO", "CLB349328", None, None, "2026-07-03T09:00:00"),
        ])  # jornada do processo 100
        cursor.queue([
            ("2026-07-04T09:00:00", "TELEFONE", "Fulano", "Primeiro contato", "CLB349328"),
        ])  # contatos do processo 100

        response = client.get("/api/provedores/1/timeline")

        assert response.status_code == 200
        eventos = response.json()
        assert len(eventos) == 4
        # ordenado do mais antigo pro mais recente
        datas = [e["data"] for e in eventos]
        assert datas == sorted(datas)
        assert eventos[0]["tipo"] == "ENTRADA"
        assert eventos[-1]["tipo"] == "CONTATO"

    def test_404_quando_provedor_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.get("/api/provedores/999/timeline")

        assert response.status_code == 404

    def test_timeline_sem_entrada_nem_processos(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("12345678000190",))
        cursor.queue(None)  # sem entrada
        cursor.queue([])  # sem processos

        response = client.get("/api/provedores/1/timeline")

        assert response.status_code == 200
        assert response.json() == []


class TestCriarProcessoParaProvedor:
    def test_cria_novo_processo_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            (1,),  # SELECT ID_PROVEDOR existe
            (200,),  # SELECT CURRENT_IDENTITY_VALUE()
        )

        response = client.post("/api/provedores/1/processos")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["id_processo"] == 200
        assert "-000200" in body["numeroProtocolo"]

    def test_404_quando_provedor_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post("/api/provedores/999/processos")

        assert response.status_code == 404
