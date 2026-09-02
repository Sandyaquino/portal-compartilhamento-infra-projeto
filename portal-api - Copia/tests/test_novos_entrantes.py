# -*- coding: utf-8 -*-
"""
Testes de app/comercial/novosentrantes (endpoints de entrada):
- criar_provedor: exige status ANALISADO, valida CNPJ duplicado.
- descartar_entrada: grava motivo + usuario + id (regressao do bug de
  parametro faltando corrigido nesta sessao).
"""


def entrada_row(status="ANALISADO", cnpj="12345678000190"):
    # RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, NOME_RESPONSAVEL, EMAIL_CONTATO,
    # TELEFONE_CONTATO, STATUS_ENTRADA
    return ("Empresa Teste LTDA", "Empresa Teste", cnpj, "Fulano", "fulano@teste.com", "71999999999", status)


class TestCriarProvedor:
    def test_sucesso_quando_analisado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            entrada_row(status="ANALISADO"),  # SELECT entrada
            None,  # SELECT dedup CNPJ -> nao existe
            (42,),  # SELECT MAX(ID_PROVEDOR)
        )

        response = client.post("/api/novos-entrantes/entrada/1/criar-provedor")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["id_provedor"] == 42

    def test_404_quando_entrante_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post("/api/novos-entrantes/entrada/999/criar-provedor")

        assert response.status_code == 404

    def test_409_quando_ainda_nao_analisado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(entrada_row(status="NOVO"))

        response = client.post("/api/novos-entrantes/entrada/1/criar-provedor")

        assert response.status_code == 409
        assert "Analise" in response.json()["detail"]

    def test_409_quando_provedor_ja_criado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(entrada_row(status="PROVEDOR_CRIADO"))

        response = client.post("/api/novos-entrantes/entrada/1/criar-provedor")

        assert response.status_code == 409
        assert "já possui provedor" in response.json()["detail"]

    def test_409_quando_entrante_descartado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(entrada_row(status="DESCARTADO"))

        response = client.post("/api/novos-entrantes/entrada/1/criar-provedor")

        assert response.status_code == 409
        assert "descartado" in response.json()["detail"]

    def test_409_quando_cnpj_duplicado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            entrada_row(status="ANALISADO"),
            (1,),  # SELECT dedup CNPJ -> ja existe
        )

        response = client.post("/api/novos-entrantes/entrada/1/criar-provedor")

        assert response.status_code == 409
        assert "CNPJ" in response.json()["detail"]


class TestDescartarEntrada:
    def test_grava_motivo_usuario_e_id_corretamente(self, client, fake_db):
        """Regressão: SQL do UPDATE tem 3 placeholders (MOTIVO_DESCARTE,
        DELETED_BY, WHERE ID_ENTRADA); o bug original só passava 2 parâmetros."""
        _, cursor = fake_db
        cursor.queue(("PROVEDOR_CRIADO",))  # SELECT status atual, para o histórico

        response = client.patch(
            "/api/novos-entrantes/entrada/7/descartar",
            json={"motivo": "Duplicado no sistema"},
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

        assert len(cursor.executed) == 3  # SELECT status, UPDATE, INSERT histórico

        _, update_params = cursor.executed[1]
        assert update_params == ["Duplicado no sistema", "CLB349328", 7]

        historico_sql, historico_params = cursor.executed[2]
        assert "HISTORICO_ENTRADA" in historico_sql
        assert historico_params == [7, "PROVEDOR_CRIADO", "DESCARTADO", "CLB349328", "Duplicado no sistema"]

    def test_400_quando_motivo_ausente(self, client, fake_db):
        response = client.patch(
            "/api/novos-entrantes/entrada/7/descartar",
            json={},
        )

        assert response.status_code == 400


class TestCriarProcesso:
    def test_cria_processo_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            (1, "PROVEDOR_CRIADO", "12345678000190", None),  # SELECT entrada
            (42,),  # SELECT provedor por CNPJ
            (100,),  # SELECT CURRENT_IDENTITY_VALUE()
        )

        response = client.post("/api/novos-entrantes/entrada/1/criar-processo")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["id_provedor"] == 42
        assert body["id_processo"] == 100
        assert "-000100" in body["numeroProtocolo"]

    def test_409_quando_ja_tem_processo(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1, "PROVEDOR_CRIADO", "12345678000190", 55))  # ja tem ID_PROCESSO

        response = client.post("/api/novos-entrantes/entrada/1/criar-processo")

        assert response.status_code == 409

    def test_400_quando_provedor_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            (1, "PROVEDOR_CRIADO", "12345678000190", None),
            None,  # SELECT provedor por CNPJ - nao encontrado
        )

        response = client.post("/api/novos-entrantes/entrada/1/criar-processo")

        assert response.status_code == 400
