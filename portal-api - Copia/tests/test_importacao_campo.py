# -*- coding: utf-8 -*-
"""Testes de POST /api/tecnico/importar e /api/turma-campo/importar:
- rejeita NUMERO_OS vazio/'0' (regressao do fix de dados 'sujos' na origem).
- ainda importa normalmente um registro valido (regressao do fluxo feliz).
"""
import io


def csv_tecnico(numero_os: str) -> bytes:
    linhas = [
        "EMPRESA,TIPO DE OS,TECNICO DE EQUIPE,MUNICIPIO,BAIRRO,OS DE EXECUCAO,DATA DE EXECUCAO,QUANTIDADE DE POSTES EXECUTADOS,OBSERVACOES,APOIO",
        f"Empresa Teste,Fiscalizacao,Joao Silva,Salvador,Centro,{numero_os},2026-08-01,5,obs,N",
    ]
    return "\n".join(linhas).encode("utf-8-sig")


def csv_turma_campo(numero_os: str) -> bytes:
    linhas = [
        "ID,Title,DATA_EXECUCAO,DATA_ENVIO,EQUIPE,RESPONSAVEL,EPS,TIPO_OS,NUMERO_OS,MUNICIPIO,BAIRRO,POSTES_EXECUTADOS,CABOS_REMOVIDOS,CAIXAS_REMOVIDAS,POSTE_FORA_OS,OBSERVACAO,STATUS_APRESENTACAO",
        f"1,Title1,2026-08-01,2026-08-01,Equipe1,Responsavel,EPS1,Tipo,{numero_os},Salvador,Centro,5,1,1,0,obs,APRESENTADO",
    ]
    return "\n".join(linhas).encode("utf-8-sig")


class TestImportarTecnico:
    def test_rejeita_numero_os_zero(self, client, fake_db):
        _, cursor = fake_db

        response = client.post(
            "/api/tecnico/importar",
            files={"file": ("dados.csv", io.BytesIO(csv_tecnico("0")), "text/csv")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["registros_rejeitados"] == 1
        assert body["registros_inseridos"] == 0

    def test_rejeita_numero_os_vazio(self, client, fake_db):
        _, cursor = fake_db

        response = client.post(
            "/api/tecnico/importar",
            files={"file": ("dados.csv", io.BytesIO(csv_tecnico("")), "text/csv")},
        )

        assert response.status_code == 200
        assert response.json()["registros_rejeitados"] == 1

    def test_importa_registro_valido(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)  # SELECT ID por CHAVE_NEGOCIO -> nao existe ainda

        response = client.post(
            "/api/tecnico/importar",
            files={"file": ("dados.csv", io.BytesIO(csv_tecnico("OS123")), "text/csv")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["registros_inseridos"] == 1
        assert body["registros_rejeitados"] == 0


class TestImportarTurmaCampo:
    def test_rejeita_numero_os_zero(self, client, fake_db):
        _, cursor = fake_db

        response = client.post(
            "/api/turma-campo/importar",
            files={"file": ("dados.csv", io.BytesIO(csv_turma_campo("0")), "text/csv")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["registros_rejeitados"] == 1
        assert body["registros_inseridos"] == 0

    def test_importa_registro_valido(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)  # SELECT ID por CHAVE_NEGOCIO -> nao existe ainda

        response = client.post(
            "/api/turma-campo/importar",
            files={"file": ("dados.csv", io.BytesIO(csv_turma_campo("OS456")), "text/csv")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["registros_inseridos"] == 1
        assert body["registros_rejeitados"] == 0
