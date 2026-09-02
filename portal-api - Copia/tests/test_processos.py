# -*- coding: utf-8 -*-
"""Testes de avancar_etapa_processo (POST /api/processos/{id}/avancar-etapa)."""
import routers.processos as processos_module


def processo_row(status="EM_ANDAMENTO", etapa_atual=10, id_processo=1):
    return (id_processo, etapa_atual, status)


def etapa_row(id_etapa=10, nome="ANALISE_CADASTRAL", ordem=1, sla=5):
    return (id_etapa, nome, ordem, sla)


def analise_cadastral_row(completo=True):
    flag = "S" if completo else "N"
    return (flag, flag, flag, flag)


class TestAvancarEtapa:
    def test_avanca_para_proxima_etapa(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(),
            (100,),  # jornada em andamento
            analise_cadastral_row(),  # gate: analise cadastral completa
            etapa_row(id_etapa=20, nome="DOCUMENTACAO", ordem=2, sla=10),  # proxima etapa
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 200
        body = response.json()
        assert body["statusProcesso"] == "EM_ANDAMENTO"
        assert body["novaEtapa"] == "DOCUMENTACAO"

    def test_conclui_processo_na_ultima_etapa(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(),
            (100,),
            analise_cadastral_row(),
            None,  # não há próxima etapa
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 200
        body = response.json()
        assert body["statusProcesso"] == "CONCLUIDO"
        assert body["novaEtapa"] is None

    def test_404_quando_processo_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post("/api/processos/999/avancar-etapa")

        assert response.status_code == 404

    def test_409_quando_processo_ja_concluido(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(processo_row(status="CONCLUIDO"))

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 409

    def test_400_documentacao_sem_documento_registrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(nome="Documentação"),  # com acento, testa normalização
            (100,),
            (0,),  # COUNT(*) de documentos = 0
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 400
        assert "documento" in response.json()["detail"].lower()

    def test_409_quando_processo_cancelado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(processo_row(status="CANCELADO"))

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 409

    def test_400_analise_cadastral_nao_preenchida(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(),  # ANALISE_CADASTRAL
            (100,),
            None,  # nenhum registro de analise cadastral
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 400
        assert "análise cadastral" in response.json()["detail"].lower()

    def test_400_analise_cadastral_checklist_incompleto(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(),
            (100,),
            analise_cadastral_row(completo=False),
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 400
        assert "checklist" in response.json()["detail"].lower()

    def test_400_aprovacao_sem_parecer_registrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(nome="APROVACAO"),
            (100,),
            None,  # nenhum parecer
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 400
        assert "parecer" in response.json()["detail"].lower()

    def test_409_aprovacao_com_parecer_reprovado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(nome="APROVACAO"),
            (100,),
            ("REPROVADO",),
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 409
        assert "reprovado" in response.json()["detail"].lower()

    def test_avanca_quando_parecer_aprovado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(nome="APROVACAO"),
            (100,),
            ("APROVADO",),
            etapa_row(id_etapa=30, nome="CONTRATACAO", ordem=4, sla=5),
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 200
        assert response.json()["novaEtapa"] == "CONTRATACAO"

    def test_400_contratacao_sem_dados_registrados(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(),
            etapa_row(nome="CONTRATACAO"),
            (100,),
            None,  # nenhuma contratação registrada
        )

        response = client.post("/api/processos/1/avancar-etapa")

        assert response.status_code == 400
        assert "contratação" in response.json()["detail"].lower()


class TestRetornarEtapa:
    def test_retorna_para_etapa_anterior(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(etapa_atual=20),
            (20, "DOCUMENTACAO", 2),  # etapa atual: ID_ETAPA, NOME_ETAPA, ORDEM_FLUXO
            (100,),  # jornada em andamento
            (10, "ANALISE_CADASTRAL", 5),  # etapa anterior: ID_ETAPA, NOME_ETAPA, SLA_DIAS
        )

        response = client.post("/api/processos/1/retornar-etapa", json={"motivo": "Faltou documento obrigatório"})

        assert response.status_code == 200
        body = response.json()
        assert body["statusProcesso"] == "EM_ANDAMENTO"
        assert body["novaEtapa"] == "ANALISE_CADASTRAL"

    def test_400_sem_etapa_anterior(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(etapa_atual=10),
            (10, "ANALISE_CADASTRAL", 1),
            (100,),
            None,  # nenhuma etapa com ordem menor
        )

        response = client.post("/api/processos/1/retornar-etapa", json={"motivo": "Teste"})

        assert response.status_code == 400
        assert "etapa anterior" in response.json()["detail"].lower()

    def test_422_sem_motivo(self, client, fake_db):
        response = client.post("/api/processos/1/retornar-etapa", json={"motivo": ""})

        assert response.status_code == 422

    def test_409_quando_processo_ja_encerrado(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(processo_row(status="CANCELADO"))

        response = client.post("/api/processos/1/retornar-etapa", json={"motivo": "Teste"})

        assert response.status_code == 409


class TestCancelarProcesso:
    def test_cancela_processo_com_jornada_em_andamento(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(
            processo_row(etapa_atual=10),
            (100,),  # jornada em andamento encontrada
        )

        response = client.post("/api/processos/1/cancelar", json={"motivo": "Provedor desistiu"})

        assert response.status_code == 200
        assert response.json()["statusProcesso"] == "CANCELADO"

    def test_404_quando_processo_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post("/api/processos/999/cancelar", json={"motivo": "Teste"})

        assert response.status_code == 404

    def test_409_quando_ja_concluido(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(processo_row(status="CONCLUIDO"))

        response = client.post("/api/processos/1/cancelar", json={"motivo": "Teste"})

        assert response.status_code == 409

    def test_422_sem_motivo(self, client, fake_db):
        response = client.post("/api/processos/1/cancelar", json={"motivo": ""})

        assert response.status_code == 422


CONTATO_COLUNAS = [
    "ID_CONTATO", "ID_PROCESSO", "DATA_CONTATO", "MEIO_CONTATO",
    "PESSOA_CONTATO", "OBSERVACAO", "USUARIO_REGISTRO", "DATA_REGISTRO",
]


class TestContatosProcesso:
    def test_registra_contato_com_sucesso(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((1,))  # _validar_processo_existe

        response = client.post(
            "/api/processos/1/contatos",
            json={
                "data_contato": "2026-08-09T10:00:00",
                "meio_contato": "TELEFONE",
                "pessoa_contato": "Fulano de Tal",
                "observacao": "Cobrado envio de documentação pendente.",
            },
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_404_quando_processo_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post(
            "/api/processos/999/contatos",
            json={"data_contato": "2026-08-09T10:00:00", "observacao": "Teste"},
        )

        assert response.status_code == 404

    def test_422_sem_observacao(self, client, fake_db):
        response = client.post(
            "/api/processos/1/contatos",
            json={"data_contato": "2026-08-09T10:00:00", "observacao": ""},
        )

        assert response.status_code == 422

    def test_lista_contatos_mais_recente_primeiro(self, client, fake_db):
        _, cursor = fake_db
        linha_recente = (2, 1, "2026-08-09T10:00:00", "EMAIL", "Ciclana", "Follow-up", "CLB349328", "2026-08-09T10:05:00")
        linha_antiga = (1, 1, "2026-08-01T09:00:00", "TELEFONE", "Fulano", "Primeiro contato", "CLB349328", "2026-08-01T09:05:00")
        cursor.queue((1,))  # _validar_processo_existe
        cursor.queue_described(CONTATO_COLUNAS, [linha_recente, linha_antiga])

        response = client.get("/api/processos/1/contatos")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["ID_CONTATO"] == 2
        assert body[0]["PESSOA_CONTATO"] == "Ciclana"

    def test_404_ao_listar_processo_inexistente(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.get("/api/processos/999/contatos")

        assert response.status_code == 404


class TestEnviarEmailProvedor:
    def test_envia_com_sucesso_sem_documentos(self, client, fake_db, monkeypatch):
        _, cursor = fake_db
        chamadas = []
        monkeypatch.setattr(
            processos_module, "_enviar_email_smtp",
            lambda destinatario, assunto, texto, html: chamadas.append((destinatario, assunto, texto, html)),
        )
        cursor.queue(("provedor@teste.com",))  # SELECT PR.EMAIL
        cursor.queue([])  # SELECT documentos - nenhum

        response = client.post(
            "/api/processos/1/contatos/enviar-email",
            json={"assunto": "Follow-up contratação", "corpo": "Segue retorno sobre o contrato."},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["destinatario"] == "provedor@teste.com"
        assert len(chamadas) == 1
        assert chamadas[0][0] == "provedor@teste.com"

    def test_inclui_links_de_documentos_no_corpo(self, client, fake_db, monkeypatch):
        _, cursor = fake_db
        chamadas = []
        monkeypatch.setattr(
            processos_module, "_enviar_email_smtp",
            lambda destinatario, assunto, texto, html: chamadas.append((destinatario, assunto, texto, html)),
        )
        cursor.queue(("provedor@teste.com",))
        cursor.queue([("Contrato.pdf", "https://sharepoint.com/contrato.pdf")])

        response = client.post(
            "/api/processos/1/contatos/enviar-email",
            json={"assunto": "Documentos", "corpo": "Segue documentação."},
        )

        assert response.status_code == 200
        _, _, texto, html = chamadas[0]
        assert "https://sharepoint.com/contrato.pdf" in texto
        assert "https://sharepoint.com/contrato.pdf" in html

    def test_usa_destinatario_informado_quando_fornecido(self, client, fake_db, monkeypatch):
        _, cursor = fake_db
        chamadas = []
        monkeypatch.setattr(
            processos_module, "_enviar_email_smtp",
            lambda destinatario, assunto, texto, html: chamadas.append(destinatario),
        )
        cursor.queue(("provedor@teste.com",))
        cursor.queue([])

        response = client.post(
            "/api/processos/1/contatos/enviar-email",
            json={"para": "outro@teste.com", "assunto": "Teste", "corpo": "Corpo"},
        )

        assert response.status_code == 200
        assert chamadas[0] == "outro@teste.com"

    def test_404_quando_processo_nao_existe(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue(None)

        response = client.post(
            "/api/processos/999/contatos/enviar-email",
            json={"assunto": "Teste", "corpo": "Corpo"},
        )

        assert response.status_code == 404

    def test_400_quando_sem_email_disponivel(self, client, fake_db):
        _, cursor = fake_db
        cursor.queue((None,))  # provedor sem e-mail cadastrado

        response = client.post(
            "/api/processos/1/contatos/enviar-email",
            json={"assunto": "Teste", "corpo": "Corpo"},
        )

        assert response.status_code == 400

    def test_500_quando_envio_smtp_falha(self, client, fake_db, monkeypatch):
        _, cursor = fake_db

        def falha(*args, **kwargs):
            raise Exception("Conexão SMTP recusada")

        monkeypatch.setattr(processos_module, "_enviar_email_smtp", falha)
        cursor.queue(("provedor@teste.com",))
        cursor.queue([])

        response = client.post(
            "/api/processos/1/contatos/enviar-email",
            json={"assunto": "Teste", "corpo": "Corpo"},
        )

        assert response.status_code == 500

    def test_422_sem_assunto(self, client, fake_db):
        response = client.post(
            "/api/processos/1/contatos/enviar-email",
            json={"assunto": "", "corpo": "Corpo"},
        )

        assert response.status_code == 422
