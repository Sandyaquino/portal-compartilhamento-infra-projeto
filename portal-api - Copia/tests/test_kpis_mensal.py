# -*- coding: utf-8 -*-
"""
Testes de /api/kpis-mensal (kpis, lancamentos, visao-geral).
"""
from routers.kpis_mensal import calcular_status

COLUNAS_KPI = ["ID", "BLOCO", "KPI", "UNIDADE", "TIPO", "CREATED_AT", "CREATED_BY", "UPDATED_AT", "UPDATED_BY"]
COLUNAS_LANCAMENTO = [
    "ID", "KPI_ID", "MES", "META", "REALIZADO", "OBSERVACAO",
    "CREATED_AT", "CREATED_BY", "UPDATED_AT", "UPDATED_BY",
]


def kpi_row(id_=1, bloco="Operação de Campo", kpi="Postes Remoção Executados (Total)", unidade="%", tipo="Maior melhor"):
    return (id_, bloco, kpi, unidade, tipo, "2026-08-01T10:00:00", "CLB349328", None, None)


def lancamento_row(id_=1, kpi_id=1, mes="Jan", meta=100, realizado=None, observacao=None):
    return (id_, kpi_id, mes, meta, realizado, observacao, "2026-08-01T10:00:00", "CLB349328", None, None)


class TestCalcularStatus:
    def test_sem_realizado_retorna_sem_status(self):
        assert calcular_status("Maior melhor", 100, None) == (None, None, None)

    def test_maior_melhor_verde_quando_bate_meta(self):
        desvio, percentual, status = calcular_status("Maior melhor", 100, 100)
        assert status == "verde"
        assert desvio == 0

    def test_maior_melhor_amarelo_dentro_tolerancia(self):
        _, _, status = calcular_status("Maior melhor", 100, 96)
        assert status == "amarelo"

    def test_maior_melhor_vermelho_fora_tolerancia(self):
        _, _, status = calcular_status("Maior melhor", 100, 80)
        assert status == "vermelho"

    def test_menor_melhor_verde_quando_bate_meta(self):
        _, _, status = calcular_status("Menor melhor", 10, 8)
        assert status == "verde"

    def test_menor_melhor_amarelo_dentro_tolerancia(self):
        _, _, status = calcular_status("Menor melhor", 10, 10.4)
        assert status == "amarelo"

    def test_menor_melhor_vermelho_fora_tolerancia(self):
        _, _, status = calcular_status("Menor melhor", 10, 15)
        assert status == "vermelho"

    def test_meta_zero_nao_divide_por_zero(self):
        desvio, percentual, status = calcular_status("Maior melhor", 0, 5)
        assert desvio == 5
        assert percentual is None
        assert status == "verde"


class TestListarKpis:
    def test_lista_itens(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_KPI, [kpi_row()])

        response = client.get("/api/kpis-mensal/kpis")

        assert response.status_code == 200
        assert response.json()[0]["KPI"] == "Postes Remoção Executados (Total)"


class TestCriarKpi:
    payload_valido = {
        "bloco": "Operação de Campo",
        "kpi": "Postes Remoção Executados (Total)",
        "unidade": "%",
        "tipo": "Maior melhor",
    }

    def test_cria_com_sucesso_e_gera_12_lancamentos(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # CURRENT_IDENTITY_VALUE
        cursor.queue_described(COLUNAS_KPI, [kpi_row()])

        response = client.post("/api/kpis-mensal/kpis", json=self.payload_valido)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["item"]["KPI"] == "Postes Remoção Executados (Total)"

        inserts_lancamento = [
            sql for sql, _params in cursor.executed if "KPI_LANCAMENTO" in sql and "INSERT" in sql
        ]
        assert len(inserts_lancamento) == 12

    def test_rejeita_sem_campo_obrigatorio(self, client, fake_db):
        payload = {**self.payload_valido, "kpi": ""}

        response = client.post("/api/kpis-mensal/kpis", json=payload)

        assert response.status_code == 400

    def test_rejeita_tipo_invalido(self, client, fake_db):
        payload = {**self.payload_valido, "tipo": "Igual melhor"}

        response = client.post("/api/kpis-mensal/kpis", json=payload)

        assert response.status_code == 400


class TestListarLancamentos:
    def test_calcula_status_e_ordena_jan_a_dez(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("Maior melhor",))
        cursor.queue_described(
            COLUNAS_LANCAMENTO,
            [
                lancamento_row(id_=2, mes="Fev", meta=100, realizado=100),
                lancamento_row(id_=1, mes="Jan", meta=100, realizado=80),
            ],
        )

        response = client.get("/api/kpis-mensal/lancamentos", params={"kpi_id": 1})

        assert response.status_code == 200
        body = response.json()
        assert [item["MES"] for item in body] == ["Jan", "Fev"]
        assert body[0]["STATUS"] == "vermelho"
        assert body[1]["STATUS"] == "verde"

    def test_realizado_nulo_fica_sem_status(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("Maior melhor",))
        cursor.queue_described(COLUNAS_LANCAMENTO, [lancamento_row(mes="Jan", meta=100, realizado=None)])

        response = client.get("/api/kpis-mensal/lancamentos", params={"kpi_id": 1})

        assert response.status_code == 200
        assert response.json()[0]["STATUS"] is None

    def test_404_quando_kpi_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.get("/api/kpis-mensal/lancamentos", params={"kpi_id": 999})

        assert response.status_code == 404


class TestAtualizarLancamento:
    payload_valido = {"kpi_id": 1, "mes": "Jan", "meta": 100, "realizado": 97, "observacao": "Ajustado"}

    def test_atualiza_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("Maior melhor",))  # tipo do KPI
        cursor.queue((5,))  # ID do lancamento

        response = client.put("/api/kpis-mensal/lancamentos", json=self.payload_valido)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["item"]["STATUS"] == "amarelo"

    def test_rejeita_mes_invalido(self, client, fake_db):
        payload = {**self.payload_valido, "mes": "Janeiro"}

        response = client.put("/api/kpis-mensal/lancamentos", json=payload)

        assert response.status_code == 400

    def test_404_quando_kpi_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.put("/api/kpis-mensal/lancamentos", json=self.payload_valido)

        assert response.status_code == 404

    def test_404_quando_lancamento_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(("Maior melhor",))
        cursor.queue(None)

        response = client.put("/api/kpis-mensal/lancamentos", json=self.payload_valido)

        assert response.status_code == 404


class TestVisaoGeral:
    def test_agrega_kpis_com_status_por_mes(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS_KPI, [kpi_row(id_=1, tipo="Maior melhor")])
        cursor.queue_described(
            COLUNAS_LANCAMENTO,
            [
                lancamento_row(id_=1, kpi_id=1, mes="Jan", meta=100, realizado=100),
                lancamento_row(id_=2, kpi_id=1, mes="Fev", meta=100, realizado=None),
            ],
        )

        response = client.get("/api/kpis-mensal/visao-geral")

        assert response.status_code == 200
        body = response.json()
        assert body[0]["ID"] == 1
        meses = {item["MES"]: item["STATUS"] for item in body[0]["MESES"]}
        assert meses["Jan"] == "verde"
        assert meses["Fev"] is None
