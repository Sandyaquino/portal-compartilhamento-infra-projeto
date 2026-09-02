# -*- coding: utf-8 -*-
"""
Testes de /api/plano-medidas (GET/POST/PUT/DELETE).
"""

COLUNAS = [
    "ID", "BLOCO", "KPI", "MES", "DESVIO_IDENTIFICADO", "CAUSA_RAIZ", "MEDIDA_ACAO",
    "RESPONSAVEL", "PRAZO", "STATUS", "RISCO", "EVIDENCIA_LINK", "COMENTARIO_EXECUTIVO",
    "CREATED_AT", "CREATED_BY", "UPDATED_AT", "UPDATED_BY",
]


def item_row(id_=1, status="Não iniciado", risco="Médio"):
    return (
        id_, "Operação de Campo", "Postes Remoção Executados (Total)", "Jul", -0.16,
        "Atraso na equipe terceirizada", "Reforçar equipe com 2 técnicos adicionais",
        "Fulano de Tal", "2026-08-20", status, risco, None, None,
        "2026-08-01T10:00:00", "CLB349328", None, None,
    )


class TestListarPlanoMedidas:
    def test_lista_itens(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue_described(COLUNAS, [item_row()])

        response = client.get("/api/plano-medidas")

        assert response.status_code == 200
        assert response.json()[0]["KPI"] == "Postes Remoção Executados (Total)"


class TestCriarPlanoMedida:
    payload_valido = {
        "bloco": "Operação de Campo",
        "kpi": "Postes Remoção Executados (Total)",
        "mes": "Jul",
        "desvio_identificado": -0.16,
        "causa_raiz": "Atraso na equipe terceirizada",
        "medida_acao": "Reforçar equipe com 2 técnicos adicionais",
        "responsavel": "Fulano de Tal",
        "prazo": "2026-08-20",
        "status": "Não iniciado",
        "risco": "Médio",
    }

    def test_cria_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # CURRENT_IDENTITY_VALUE
        cursor.queue_described(COLUNAS, item_row())

        response = client.post("/api/plano-medidas", json=self.payload_valido)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["item"]["KPI"] == "Postes Remoção Executados (Total)"

    def test_rejeita_sem_campo_obrigatorio(self, client, fake_db):
        payload = {**self.payload_valido, "medida_acao": ""}

        response = client.post("/api/plano-medidas", json=payload)

        assert response.status_code == 400

    def test_rejeita_status_invalido(self, client, fake_db):
        payload = {**self.payload_valido, "status": "Cancelado"}

        response = client.post("/api/plano-medidas", json=payload)

        assert response.status_code == 400

    def test_rejeita_risco_invalido(self, client, fake_db):
        payload = {**self.payload_valido, "risco": "Altíssimo"}

        response = client.post("/api/plano-medidas", json=payload)

        assert response.status_code == 400


class TestEditarPlanoMedida:
    def test_edita_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # existe
        cursor.queue_described(COLUNAS, item_row(status="Concluído"))

        response = client.put("/api/plano-medidas/1", json={"status": "Concluído"})

        assert response.status_code == 200
        assert response.json()["item"]["STATUS"] == "Concluído"

    def test_404_quando_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.put("/api/plano-medidas/999", json={"status": "Concluído"})

        assert response.status_code == 404

    def test_rejeita_status_invalido(self, client, fake_db):
        response = client.put("/api/plano-medidas/1", json={"status": "Cancelado"})

        assert response.status_code == 400

    def test_nada_a_atualizar(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # existe

        response = client.put("/api/plano-medidas/1", json={})

        assert response.status_code == 200
        assert response.json()["mensagem"] == "Nada para atualizar"


class TestExcluirPlanoMedida:
    def test_exclui_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # existe

        response = client.delete("/api/plano-medidas/1")

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_404_quando_nao_encontrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.delete("/api/plano-medidas/999")

        assert response.status_code == 404
