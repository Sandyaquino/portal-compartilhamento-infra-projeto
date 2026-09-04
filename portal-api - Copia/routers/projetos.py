# -*- coding: utf-8 -*-
"""
Projetos de Compartilhamento de Infraestrutura.

Cobre, por enquanto, a criação manual de projeto associando a um
provedor/processo existente. O DDL canônico das tabelas está em
sql/PORTAL_COMPARTILHAMENTO_PROJETO.sql; aqui há um self-create de
segurança no mesmo espírito de outras partes do portal.

Endpoints consumidos por app/(app)/projetos/page.tsx +
components/projetos/novo-projeto-modal.tsx.
"""
from typing import Any, Optional, List
from datetime import datetime, date, timedelta
import re

from fastapi import APIRouter, HTTPException, Path, Body
from decimal import Decimal

import main

router = APIRouter()

SCHEMA = "CLB349328"
TB_PROJETO = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO"
TB_TIPO_DOC = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_TIPO_DOCUMENTO"
TB_DOC = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_DOCUMENTO"
TB_HIST = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_HISTORICO"
TB_POSTE = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_POSTE"
TB_ANALISE = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_ANALISE"
TB_SUBMISSAO = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_SUBMISSAO"
TB_USUARIO = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_USUARIO"'

STATUS_PROJETO_VALIDOS = {
    "RECEBIDO", "EM_ANALISE", "PENDENTE_DOC", "ANALISE_TECNICA",
    "PARECER_EMITIDO", "VINCULADO", "CONCLUIDO", "DEVOLVIDO", "CANCELADO",
}
STATUS_ENCERRADO = {"CONCLUIDO", "VINCULADO", "CANCELADO"}
STATUS_DOC_VALIDOS = {"PENDENTE", "RECEBIDO", "VALIDADO", "REJEITADO"}
STATUS_ANALISE_POSTE = {"PENDENTE", "APROVADO", "REPROVADO", "REVISAR"}

# SLA por prioridade: dias corridos a partir da atribuicao.
SLA_DIAS = {"URGENTE": 1, "ALTA": 3, "MEDIA": 7, "BAIXA": 15}


def _prazo_padrao(prioridade: Any, base: Optional[date] = None) -> str:
    d = (base or date.today()) + timedelta(days=SLA_DIAS.get(str(prioridade or "MEDIA").upper(), SLA_DIAS["MEDIA"]))
    return d.isoformat()


def _dias_para_prazo(prazo: Any) -> Optional[int]:
    if not prazo:
        return None
    try:
        alvo = datetime.strptime(str(prazo)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
    return (alvo - date.today()).days


def _situacao_prazo(prazo: Any) -> str:
    d = _dias_para_prazo(prazo)
    if d is None:
        return "SEM_PRAZO"
    if d < 0:
        return "ATRASADO"
    if d <= 2:
        return "VENCENDO"
    return "EM_DIA"


def _recalcular_contadores(cursor, id_projeto: int) -> None:
    cursor.execute(
        f"""
        SELECT
            SUM(CASE WHEN OBRIGATORIO = 'S' THEN 1 ELSE 0 END),
            SUM(CASE WHEN OBRIGATORIO = 'S' AND STATUS_DOCUMENTO <> 'PENDENTE' THEN 1 ELSE 0 END),
            SUM(CASE WHEN OBRIGATORIO = 'S' AND STATUS_DOCUMENTO = 'VALIDADO' THEN 1 ELSE 0 END)
        FROM {TB_DOC} WHERE ID_PROJETO = ? AND ATIVO = 'S'
        """,
        [id_projeto],
    )
    obr, rec, val = (cursor.fetchone() or (0, 0, 0))
    obr, rec, val = int(obr or 0), int(rec or 0), int(val or 0)
    cursor.execute(
        f"SELECT COUNT(*), SUM(CASE WHEN STATUS_ANALISE = 'APROVADO' THEN 1 ELSE 0 END) FROM {TB_POSTE} WHERE ID_PROJETO = ?",
        [id_projeto],
    )
    tp = cursor.fetchone() or (0, 0)
    cursor.execute(
        f"""
        UPDATE {TB_PROJETO}
           SET DOCS_OBRIGATORIOS = ?, DOCS_RECEBIDOS = ?, DOCS_VALIDADOS = ?,
               DOCUMENTACAO_OK = ?, QTD_POSTES_RECEBIDA = ?, QTD_POSTES_VALIDADA = ?,
               UPDATED_AT = CURRENT_UTCTIMESTAMP
         WHERE ID_PROJETO = ?
        """,
        [obr, rec, val, ("S" if obr > 0 and val == obr else "N"), int(tp[0] or 0), int(tp[1] or 0), id_projeto],
    )


def _add_historico(cursor, id_projeto: int, tipo_evento: str, status_ant, status_novo, descricao, usuario) -> None:
    cursor.execute(
        f"""
        INSERT INTO {TB_HIST}
        (ID_PROJETO, TIPO_EVENTO, STATUS_ANTERIOR, STATUS_NOVO, DESCRICAO, USUARIO, DATA_EVENTO)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_UTCTIMESTAMP)
        """,
        [id_projeto, tipo_evento, status_ant, status_novo, descricao, str(usuario or "CLB349328")],
    )
TB_PROJ_TIPO = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_TIPO"
TB_PROJ_MODALIDADE = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_MODALIDADE"
TB_PROJ_TIPO_DOC = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_TIPO_DOC"
TB_PROVEDOR = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROVEDOR"
TB_PROCESSO = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_PROCESSO"
TB_ENTRADA = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_ENTRADA"

PRIORIDADES = {"BAIXA", "MEDIA", "ALTA", "URGENTE"}

# Colunas acrescentadas a PROJETO (tipo/modalidade/sem contrato + integração).
# DDL de referência: sql/ALTER_PORTAL_COMPARTILHAMENTO_PROJETO_TIPO.sql
_COLUNAS_NOVAS_PROJETO = """
    TIPO_PROJETO NVARCHAR(30),
    MODALIDADE NVARCHAR(24) DEFAULT 'COMPLETO',
    SEM_CONTRATO NVARCHAR(1) DEFAULT 'N',
    DIAS_OPERACAO_REVELIA INTEGER,
    PROTOCOLO_SAP_CRM NVARCHAR(40),
    NOTA_SAP_CCS NVARCHAR(40),
    PASTA_SHAREPOINT NVARCHAR(1000),
    ETAPA_PROTOCOLO_CRM NVARCHAR(1) DEFAULT 'N',
    ETAPA_NOTA_CCS NVARCHAR(1) DEFAULT 'N',
    ETAPA_PASTA_SHAREPOINT NVARCHAR(1) DEFAULT 'N',
    ETAPA_ESTEIRA_ANALISE NVARCHAR(1) DEFAULT 'N'
"""

# Tipos de projeto (o procedimento muda conforme o tipo).
TIPOS_PROJETO = [
    {
        "CODIGO": "NOVO_COMPARTILHAMENTO",
        "NOME": "Serviço de Novo Compartilhamento",
        "DESCRICAO": "Rede nova a ser instalada na infraestrutura da distribuidora. Exige a documentação técnica e ambiental completa.",
        "ORDEM": 10,
    },
    {
        "CODIGO": "PONTOS_REVELIA",
        "NOME": "Pontos à Revelia",
        "DESCRICAO": "Regularização de ocupação já existente, instalada sem cadastro prévio. Não exige planta detalhada nem carta ambiental.",
        "ORDEM": 20,
    },
    {
        "CODIGO": "REMOCAO_PONTOS",
        "NOME": "Remoção de Pontos",
        "DESCRICAO": "Desmobilização de ocupação existente. Exige cronograma de desmobilização no lugar da carta ambiental.",
        "ORDEM": 30,
    },
]
CODIGOS_TIPO = {t["CODIGO"] for t in TIPOS_PROJETO}

MODALIDADES = [
    {"CODIGO": "COMPLETO", "NOME": "Documentação completa", "DESCRICAO": "Fluxo padrão: toda a lista de documentos obrigatórios do tipo.", "REGRA_ELEGIBILIDADE": None},
    {
        "CODIGO": "CHECKLIST_SIMPLIFICADO",
        "NOME": "Checklist Simplificado",
        "DESCRICAO": "Lista reduzida de documentos. Segue o fluxo normal dentro do Portal.",
        "REGRA_ELEGIBILIDADE": "Válido apenas se: (I) ocupação a partir de 300 pontos novos; OU (II) regularização de ocupação à revelia operando há no mínimo 180 dias.",
    },
]

# Catálogo de tipos de documento (norma vigente). (codigo, nome, obrig, ext, ordem)
CATALOGO_DOC = [
    ("SOLICITACAO_ANALISE", "Solicitação de análise", "S", "pdf", 10),
    ("KMZ", "Arquivo KMZ", "S", "kmz,kml", 20),
    ("ART_RRT_TRT", "ART, RRT ou TRT", "S", "pdf", 30),
    ("PLANILHA_POSTES", "Planilha de Postes", "S", "xlsx,csv", 40),
    ("PLANTA_DETALHADA", "Planta detalhada", "S", "pdf,dwg", 50),
    ("MEMORIAL_TECNICO", "Memorial Técnico descritivo e de cálculo", "S", "pdf", 60),
    ("CARTA_REDE_INSTALADA", "Carta de Rede Instalada", "S", "pdf", 70),
    ("CARTA_AMBIENTAL", "Carta de Conformidade Ambiental", "S", "pdf", 80),
    ("CRONOGRAMA_DESMOBILIZACAO", "Cronograma de desmobilização", "S", "pdf,xlsx", 90),
    ("CHECKLIST_SIMPLIFICADO", "Checklist Simplificado", "S", "pdf,xlsx", 100),
    ("CONTRATO_SOCIAL", "Contrato Social da Empresa e Alterações", "S", "pdf", 110),
    ("CARTAO_CNPJ", "Cartão CNPJ", "S", "pdf", 120),
    ("OUTORGA_ANATEL", "Termo de Outorga ou Dispensa da Anatel", "S", "pdf", 130),
    ("DOC_REP_LEGAL", "CNH ou documento oficial com foto do representante legal", "S", "pdf,jpg,png", 140),
    ("FORMULARIO_CADASTRAL", "Formulário de dados Cadastrais", "S", "pdf,docx", 150),
]
DOC_POR_CODIGO = {c[0]: c for c in CATALOGO_DOC}

# Matriz CHAVE -> documentos. CHAVE = TIPO_PROJETO | CHECKLIST_SIMPLIFICADO | SEM_CONTRATO.
MATRIZ_TIPO_DOC = {
    "NOVO_COMPARTILHAMENTO": [
        "SOLICITACAO_ANALISE", "KMZ", "ART_RRT_TRT", "PLANILHA_POSTES", "PLANTA_DETALHADA",
        "MEMORIAL_TECNICO", "CARTA_REDE_INSTALADA", "CARTA_AMBIENTAL",
    ],
    "PONTOS_REVELIA": [
        "SOLICITACAO_ANALISE", "KMZ", "ART_RRT_TRT", "PLANILHA_POSTES", "MEMORIAL_TECNICO", "CARTA_REDE_INSTALADA",
    ],
    "REMOCAO_PONTOS": [
        "SOLICITACAO_ANALISE", "KMZ", "ART_RRT_TRT", "PLANILHA_POSTES", "MEMORIAL_TECNICO", "CRONOGRAMA_DESMOBILIZACAO",
    ],
    "CHECKLIST_SIMPLIFICADO": ["CHECKLIST_SIMPLIFICADO", "ART_RRT_TRT", "KMZ", "CARTA_REDE_INSTALADA"],
    "SEM_CONTRATO": ["CONTRATO_SOCIAL", "CARTAO_CNPJ", "OUTORGA_ANATEL", "DOC_REP_LEGAL", "FORMULARIO_CADASTRAL"],
}


def _resolver_checklist(tipo: str, modalidade: str, sem_contrato: Any) -> List[dict]:
    chave = "CHECKLIST_SIMPLIFICADO" if modalidade == "CHECKLIST_SIMPLIFICADO" else tipo
    codigos = list(MATRIZ_TIPO_DOC.get(chave, []))
    if sem_contrato in ("S", True):
        for c in MATRIZ_TIPO_DOC["SEM_CONTRATO"]:
            if c not in codigos:
                codigos.append(c)
    out = []
    for i, cod in enumerate(codigos):
        d = DOC_POR_CODIGO.get(cod)
        if d:
            out.append({"CODIGO": cod, "NOME": d[1], "OBRIGATORIO": "S", "EXTENSOES_ACEITAS": d[3], "ORDEM": (i + 1) * 10})
    return out


def _checar_simplificado(tipo: str, qtd_postes: Any, dias_revelia: Any) -> dict:
    por_pontos = int(qtd_postes or 0) >= 300
    por_revelia = tipo == "PONTOS_REVELIA" and int(dias_revelia or 0) >= 180
    return {
        "elegivel": bool(por_pontos or por_revelia),
        "motivo": (
            "Projeto com 300+ pontos novos."
            if por_pontos
            else "Regularização à revelia operando há 180+ dias."
            if por_revelia
            else "Não atende: precisa de 300+ pontos novos OU ocupação à revelia há 180+ dias."
        ),
    }


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _linhas(cursor) -> List[dict]:
    colunas = [c[0] for c in cursor.description]
    return [
        {colunas[i]: _json_value(v) for i, v in enumerate(row)}
        for row in cursor.fetchall()
    ]


def _so_digitos(valor: Any) -> str:
    return re.sub(r"\D", "", str(valor or ""))


def _garantir_catalogos_tipo(cursor) -> None:
    """Cria e semeia os catalogos de TIPO_PROJETO / MODALIDADE / MATRIZ de
    documentos. DDL de referencia: sql/ALTER_PORTAL_COMPARTILHAMENTO_PROJETO_TIPO.sql."""
    # TIPO
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_PROJ_TIPO}")
        n = cursor.fetchone()[0] or 0
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_PROJ_TIPO} (
                CODIGO NVARCHAR(30) NOT NULL,
                NOME NVARCHAR(120) NOT NULL,
                DESCRICAO NVARCHAR(600),
                ORDEM INTEGER DEFAULT 0,
                ATIVO NVARCHAR(1) DEFAULT 'S',
                PRIMARY KEY (CODIGO)
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
        n = 0
    if n == 0:
        for t in TIPOS_PROJETO:
            cursor.execute(
                f"INSERT INTO {TB_PROJ_TIPO} (CODIGO, NOME, DESCRICAO, ORDEM, ATIVO) VALUES (?, ?, ?, ?, 'S')",
                [t["CODIGO"], t["NOME"], t["DESCRICAO"], t["ORDEM"]],
            )

    # MODALIDADE
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_PROJ_MODALIDADE}")
        n = cursor.fetchone()[0] or 0
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_PROJ_MODALIDADE} (
                CODIGO NVARCHAR(24) NOT NULL,
                NOME NVARCHAR(120) NOT NULL,
                DESCRICAO NVARCHAR(600),
                REGRA_ELEGIBILIDADE NVARCHAR(600),
                ORDEM INTEGER DEFAULT 0,
                ATIVO NVARCHAR(1) DEFAULT 'S',
                PRIMARY KEY (CODIGO)
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
        n = 0
    if n == 0:
        for i, m in enumerate(MODALIDADES):
            cursor.execute(
                f"INSERT INTO {TB_PROJ_MODALIDADE} (CODIGO, NOME, DESCRICAO, REGRA_ELEGIBILIDADE, ORDEM, ATIVO) VALUES (?, ?, ?, ?, ?, 'S')",
                [m["CODIGO"], m["NOME"], m["DESCRICAO"], m["REGRA_ELEGIBILIDADE"], (i + 1) * 10],
            )

    # MATRIZ CHAVE -> documento
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_PROJ_TIPO_DOC}")
        n = cursor.fetchone()[0] or 0
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_PROJ_TIPO_DOC} (
                ID INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                CHAVE NVARCHAR(30) NOT NULL,
                CODIGO_DOC NVARCHAR(40) NOT NULL,
                OBRIGATORIO NVARCHAR(1) DEFAULT 'S',
                ORDEM INTEGER DEFAULT 0,
                ATIVO NVARCHAR(1) DEFAULT 'S',
                PRIMARY KEY (ID)
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
        n = 0
    if n == 0:
        for chave, codigos in MATRIZ_TIPO_DOC.items():
            for i, cod in enumerate(codigos):
                cursor.execute(
                    f"INSERT INTO {TB_PROJ_TIPO_DOC} (CHAVE, CODIGO_DOC, OBRIGATORIO, ORDEM, ATIVO) VALUES (?, ?, 'S', ?, 'S')",
                    [chave, cod, (i + 1) * 10],
                )


def _garantir_tabelas_projeto(cursor) -> None:
    """Cria as tabelas de Projetos na primeira vez (mesmo padrão self-create
    usado no resto do portal). O DDL de referência, com índices e a view de
    jornada, está em sql/PORTAL_COMPARTILHAMENTO_PROJETO.sql."""
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_PROJETO}")
        cursor.fetchone()
        precisa_criar = False
    except Exception:
        precisa_criar = True

    if precisa_criar:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_PROJETO}
            (
                ID_PROJETO INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                NUMERO_PROJETO NVARCHAR(40) NOT NULL,
                TITULO NVARCHAR(200),
                CHAVE_CONEXAO NVARCHAR(14) NOT NULL,
                ID_PROVEDOR INTEGER,
                ID_PROCESSO INTEGER,
                NUMERO_PROTOCOLO NVARCHAR(30),
                CNPJ NVARCHAR(20) NOT NULL,
                RAZAO_SOCIAL NVARCHAR(200) NOT NULL,
                NOME_FANTASIA NVARCHAR(200),
                MUNICIPIO NVARCHAR(120),
                UF NVARCHAR(2),
                REGIONAL NVARCHAR(60),
                QTD_POSTES_INFORMADA INTEGER DEFAULT 0,
                QTD_POSTES_RECEBIDA INTEGER DEFAULT 0,
                QTD_POSTES_VALIDADA INTEGER DEFAULT 0,
                STATUS_PROJETO NVARCHAR(20) DEFAULT 'RECEBIDO',
                PRIORIDADE NVARCHAR(10) DEFAULT 'MEDIA',
                RESPONSAVEL_ANALISE NVARCHAR(100),
                PRAZO_ANALISE DATE,
                DATA_CONCLUSAO LONGDATE CS_LONGDATE,
                CANAL_ORIGEM NVARCHAR(20) DEFAULT 'EMAIL',
                SUBMETIDO_POR NVARCHAR(100),
                EMAIL_REMETENTE NVARCHAR(200),
                DATA_RECEBIMENTO LONGDATE CS_LONGDATE,
                DOCS_OBRIGATORIOS INTEGER DEFAULT 0,
                DOCS_RECEBIDOS INTEGER DEFAULT 0,
                DOCS_VALIDADOS INTEGER DEFAULT 0,
                DOCUMENTACAO_OK NVARCHAR(1) DEFAULT 'N',
                OBSERVACOES NVARCHAR(4000),
                CREATED_AT LONGDATE CS_LONGDATE,
                CREATED_BY NVARCHAR(100),
                UPDATED_AT LONGDATE CS_LONGDATE,
                UPDATED_BY NVARCHAR(100),
                ATIVO NVARCHAR(1) DEFAULT 'S',
                {_COLUNAS_NOVAS_PROJETO},
                PRIMARY KEY (ID_PROJETO)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    # Tabela PROJETO ja existia sem as colunas novas -> ALTER guardado.
    try:
        cursor.execute(f"SELECT TIPO_PROJETO FROM {TB_PROJETO} WHERE 1 = 0")
        cursor.fetchone()
    except Exception:
        try:
            cursor.execute(f"ALTER TABLE {TB_PROJETO} ADD ({_COLUNAS_NOVAS_PROJETO})")
        except Exception:
            pass

    _garantir_catalogos_tipo(cursor)

    tem_catalogo_novo = False
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_TIPO_DOC} WHERE CODIGO = 'SOLICITACAO_ANALISE'")
        tem_catalogo_novo = (cursor.fetchone()[0] or 0) > 0
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_TIPO_DOC}
            (
                ID_TIPO_DOCUMENTO INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                CODIGO NVARCHAR(40) NOT NULL,
                NOME NVARCHAR(150) NOT NULL,
                DESCRICAO NVARCHAR(500),
                OBRIGATORIO NVARCHAR(1) DEFAULT 'S',
                EXTENSOES_ACEITAS NVARCHAR(120),
                ORDEM INTEGER DEFAULT 0,
                ATIVO NVARCHAR(1) DEFAULT 'S',
                CREATED_AT LONGDATE CS_LONGDATE,
                UPDATED_AT LONGDATE CS_LONGDATE,
                PRIMARY KEY (ID_TIPO_DOCUMENTO)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    if not tem_catalogo_novo:
        # Reseed com o catalogo da norma vigente (substitui o seed antigo).
        try:
            cursor.execute(f"DELETE FROM {TB_TIPO_DOC}")
        except Exception:
            pass
        for codigo, nome, obrig, ext, ordem in CATALOGO_DOC:
            cursor.execute(
                f"""
                INSERT INTO {TB_TIPO_DOC}
                (CODIGO, NOME, OBRIGATORIO, EXTENSOES_ACEITAS, ORDEM, ATIVO, CREATED_AT)
                VALUES (?, ?, ?, ?, ?, 'S', CURRENT_UTCTIMESTAMP)
                """,
                [codigo, nome, obrig, ext, ordem],
            )

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_DOC}")
        cursor.fetchone()
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_DOC}
            (
                ID_PROJETO_DOCUMENTO INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                ID_PROJETO INTEGER NOT NULL,
                ID_SUBMISSAO INTEGER,
                CODIGO_TIPO NVARCHAR(40),
                TIPO_DOCUMENTO NVARCHAR(150),
                OBRIGATORIO NVARCHAR(1) DEFAULT 'N',
                NOME_ARQUIVO NVARCHAR(255),
                TIPO_ARQUIVO NVARCHAR(120),
                CAMINHO_ARQUIVO NVARCHAR(1000),
                TAMANHO_BYTES BIGINT,
                HASH_ARQUIVO NVARCHAR(64),
                STATUS_DOCUMENTO NVARCHAR(20) DEFAULT 'PENDENTE',
                MOTIVO_REJEICAO NVARCHAR(500),
                RECEBIDO_VIA NVARCHAR(20) DEFAULT 'EMAIL',
                EMAIL_REMETENTE NVARCHAR(200),
                DATA_RECEBIMENTO LONGDATE CS_LONGDATE,
                VALIDADO_POR NVARCHAR(100),
                DATA_VALIDACAO LONGDATE CS_LONGDATE,
                OBSERVACAO NVARCHAR(1000),
                CREATED_AT LONGDATE CS_LONGDATE,
                ATIVO NVARCHAR(1) DEFAULT 'S',
                PRIMARY KEY (ID_PROJETO_DOCUMENTO)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_HIST}")
        cursor.fetchone()
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_HIST}
            (
                ID_HISTORICO INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                ID_PROJETO INTEGER NOT NULL,
                TIPO_EVENTO NVARCHAR(30),
                STATUS_ANTERIOR NVARCHAR(20),
                STATUS_NOVO NVARCHAR(20),
                DESCRICAO NVARCHAR(1000),
                USUARIO NVARCHAR(100),
                DATA_EVENTO LONGDATE CS_LONGDATE,
                PRIMARY KEY (ID_HISTORICO)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_POSTE}")
        cursor.fetchone()
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_POSTE}
            (
                ID_PROJETO_POSTE INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                ID_PROJETO INTEGER NOT NULL,
                IDENTIFICADOR_POSTE NVARCHAR(60),
                BARRAMENTO NVARCHAR(50),
                ID_POSTE_PORTAL INTEGER,
                LATITUDE DECIMAL(18,10),
                LONGITUDE DECIMAL(18,10),
                MUNICIPIO NVARCHAR(120),
                UF NVARCHAR(2),
                LOGRADOURO NVARCHAR(200),
                BAIRRO NVARCHAR(120),
                CEP NVARCHAR(10),
                TIPO_OCUPACAO NVARCHAR(40),
                QTD_PONTOS_FIXACAO INTEGER DEFAULT 1,
                STATUS_ANALISE NVARCHAR(20) DEFAULT 'PENDENTE',
                MOTIVO_REPROVACAO NVARCHAR(300),
                GEO_VALIDADA NVARCHAR(1) DEFAULT 'N',
                POSTE_LOCALIZADO NVARCHAR(1) DEFAULT 'N',
                OBSERVACAO NVARCHAR(1000),
                CREATED_AT LONGDATE CS_LONGDATE,
                UPDATED_AT LONGDATE CS_LONGDATE,
                PRIMARY KEY (ID_PROJETO_POSTE)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_ANALISE}")
        cursor.fetchone()
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_ANALISE}
            (
                ID_ANALISE INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                ID_PROJETO INTEGER NOT NULL,
                DOC_CONFERIDA NVARCHAR(1) DEFAULT 'N',
                CNPJ_REGULAR NVARCHAR(1) DEFAULT 'N',
                LICENCA_ANATEL_OK NVARCHAR(1) DEFAULT 'N',
                POSTES_LOCALIZADOS NVARCHAR(1) DEFAULT 'N',
                GEO_DENTRO_CONCESSAO NVARCHAR(1) DEFAULT 'N',
                CAPACIDADE_SUFICIENTE NVARCHAR(1) DEFAULT 'N',
                RESULTADO NVARCHAR(20),
                PARECER NVARCHAR(4000),
                QTD_POSTES_APROVADOS INTEGER DEFAULT 0,
                QTD_POSTES_REPROVADOS INTEGER DEFAULT 0,
                USUARIO_ANALISE NVARCHAR(100),
                DATA_ANALISE LONGDATE CS_LONGDATE,
                CREATED_AT LONGDATE CS_LONGDATE,
                PRIMARY KEY (ID_ANALISE)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_SUBMISSAO}")
        cursor.fetchone()
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_SUBMISSAO}
            (
                ID_SUBMISSAO INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                ID_PROJETO INTEGER,
                CHAVE_CONEXAO NVARCHAR(14),
                MESSAGE_ID NVARCHAR(255),
                EMAIL_REMETENTE NVARCHAR(200),
                EMAIL_PARA NVARCHAR(200),
                ASSUNTO NVARCHAR(500),
                CORPO_RESUMO NVARCHAR(4000),
                DATA_EMAIL LONGDATE CS_LONGDATE,
                QTD_ANEXOS INTEGER DEFAULT 0,
                STATUS_SUBMISSAO NVARCHAR(20) DEFAULT 'NOVO',
                MOTIVO_DESCARTE NVARCHAR(500),
                SUBMETIDO_POR NVARCHAR(100),
                DATA_SUBMISSAO LONGDATE CS_LONGDATE,
                PROCESSADO_EM LONGDATE CS_LONGDATE,
                CREATED_AT LONGDATE CS_LONGDATE,
                PRIMARY KEY (ID_SUBMISSAO)
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )


# ------------------------------------------------------------------
# Leitura: lista, resumo e detalhe
# ------------------------------------------------------------------
_COLS_LISTA = """
    ID_PROJETO, NUMERO_PROJETO, TITULO, CNPJ, RAZAO_SOCIAL, NOME_FANTASIA,
    TIPO_PROJETO, MODALIDADE, SEM_CONTRATO, MUNICIPIO, UF, STATUS_PROJETO,
    PRIORIDADE, RESPONSAVEL_ANALISE, PRAZO_ANALISE, QTD_POSTES_INFORMADA,
    QTD_POSTES_RECEBIDA, QTD_POSTES_VALIDADA, DOCS_OBRIGATORIOS, DOCS_VALIDADOS,
    DOCUMENTACAO_OK, ID_PROVEDOR, ID_PROCESSO, NUMERO_PROTOCOLO, CHAVE_CONEXAO,
    DATA_RECEBIMENTO
"""

def _vinculo_do_projeto(cursor, projeto: dict) -> dict:
    chave = projeto.get("CHAVE_CONEXAO") or ""
    provedor = None
    cursor.execute(
        f"""
        SELECT ID_PROVEDOR, RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, STATUS_CADASTRO
        FROM {TB_PROVEDOR}
        WHERE REPLACE(REPLACE(REPLACE(CNPJ,'.',''),'/',''),'-','') = ?
        """,
        [chave],
    )
    row = cursor.fetchone()
    if row:
        provedor = {
            "ID_PROVEDOR": row[0],
            "RAZAO_SOCIAL": row[1],
            "NOME_FANTASIA": row[2],
            "CNPJ": row[3],
            "STATUS_CADASTRO": row[4],
        }
    processo = None
    if projeto.get("ID_PROCESSO"):
        cursor.execute(
            f"SELECT ID_PROCESSO, NUMERO_PROTOCOLO, STATUS_ATUAL, ETAPA_ATUAL FROM {TB_PROCESSO} WHERE ID_PROCESSO = ?",
            [projeto["ID_PROCESSO"]],
        )
        r = cursor.fetchone()
        if r:
            processo = {"ID_PROCESSO": r[0], "NUMERO_PROTOCOLO": r[1], "STATUS_ATUAL": r[2], "ETAPA_ATUAL": r[3]}
    return {
        "CHAVE_CONEXAO": chave,
        "RESOLVIDO": bool(projeto.get("ID_PROVEDOR")),
        "provedor": provedor,
        "processo": processo,
    }


@router.get("/api/projetos", response_model=List[dict])
def listar_projetos(status: Optional[str] = None, municipio: Optional[str] = None, busca: Optional[str] = None):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()

        where = " WHERE ATIVO = 'S'"
        params: List[Any] = []
        if status:
            where += " AND STATUS_PROJETO = ?"
            params.append(status)
        if municipio:
            where += " AND LOWER(MUNICIPIO) LIKE ?"
            params.append(f"%{municipio.lower()}%")
        if busca:
            where += (
                " AND (LOWER(NUMERO_PROJETO) LIKE ? OR LOWER(RAZAO_SOCIAL) LIKE ?"
                " OR LOWER(COALESCE(NOME_FANTASIA,'')) LIKE ? OR LOWER(CNPJ) LIKE ?"
                " OR LOWER(COALESCE(NUMERO_PROTOCOLO,'')) LIKE ?)"
            )
            alvo = f"%{busca.lower()}%"
            params += [alvo, alvo, alvo, alvo, alvo]
        cursor.execute(
            f"SELECT {_COLS_LISTA} FROM {TB_PROJETO}{where} ORDER BY DATA_RECEBIMENTO DESC, ID_PROJETO DESC",
            params,
        )
        return _linhas(cursor)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Erro ao listar projetos: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/tipos-documento", response_model=List[dict])
def listar_tipos_documento():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()
        cursor.execute(
            f"SELECT ID_TIPO_DOCUMENTO, CODIGO, NOME, OBRIGATORIO, EXTENSOES_ACEITAS, ORDEM, ATIVO "
            f"FROM {TB_TIPO_DOC} WHERE ATIVO = 'S' ORDER BY ORDEM, CODIGO"
        )
        return _linhas(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/resumo", response_model=dict)
def resumo_projetos():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()
        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS TOTAL,
                SUM(CASE WHEN STATUS_PROJETO IN ('EM_ANALISE','ANALISE_TECNICA') THEN 1 ELSE 0 END) AS EM_ANALISE,
                SUM(CASE WHEN STATUS_PROJETO = 'PENDENTE_DOC' THEN 1 ELSE 0 END) AS PENDENTE_DOC,
                SUM(CASE WHEN STATUS_PROJETO IN ('VINCULADO','CONCLUIDO') THEN 1 ELSE 0 END) AS VINCULADOS,
                SUM(CASE WHEN PRAZO_ANALISE IS NOT NULL AND PRAZO_ANALISE < CURRENT_DATE
                         AND STATUS_PROJETO NOT IN ('CONCLUIDO','VINCULADO','CANCELADO') THEN 1 ELSE 0 END) AS ATRASADOS
            FROM {TB_PROJETO} WHERE ATIVO = 'S'
            """
        )
        r = cursor.fetchone() or (0, 0, 0, 0, 0)
        cursor.execute(
            f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN STATUS_ANALISE = 'APROVADO' THEN 1 ELSE 0 END)
            FROM {TB_POSTE}
            """
        )
        rp = cursor.fetchone() or (0, 0)
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {TB_SUBMISSAO} WHERE STATUS_SUBMISSAO = 'NOVO'")
            submissoes_novas = int(cursor.fetchone()[0] or 0)
        except Exception:
            submissoes_novas = 0
        return {
            "total": int(r[0] or 0),
            "em_analise": int(r[1] or 0),
            "pendente_doc": int(r[2] or 0),
            "vinculados": int(r[3] or 0),
            "atrasados": int(r[4] or 0),
            "submissoes_novas": submissoes_novas,
            "postes_recebidos": int(rp[0] or 0),
            "postes_aprovados": int(rp[1] or 0),
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/{id_projeto}", response_model=dict)
def obter_projeto(id_projeto: int):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()

        cursor.execute(f"SELECT * FROM {TB_PROJETO} WHERE ID_PROJETO = ?", [id_projeto])
        linhas = _linhas(cursor)
        if not linhas:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        projeto = linhas[0]

        cursor.execute(f"SELECT * FROM {TB_POSTE} WHERE ID_PROJETO = ? ORDER BY ID_PROJETO_POSTE", [id_projeto])
        postes = _linhas(cursor)
        cursor.execute(
            f"SELECT * FROM {TB_DOC} WHERE ID_PROJETO = ? AND ATIVO = 'S' ORDER BY CODIGO_TIPO",
            [id_projeto],
        )
        documentos = _linhas(cursor)
        cursor.execute(f"SELECT * FROM {TB_ANALISE} WHERE ID_PROJETO = ? ORDER BY DATA_ANALISE DESC", [id_projeto])
        analises = _linhas(cursor)
        cursor.execute(f"SELECT * FROM {TB_HIST} WHERE ID_PROJETO = ? ORDER BY DATA_EVENTO", [id_projeto])
        historico = _linhas(cursor)

        return {
            "projeto": projeto,
            "postes": postes,
            "documentos": documentos,
            "analises": analises,
            "historico": historico,
            "vinculo": _vinculo_do_projeto(cursor, projeto),
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Erro ao carregar o projeto: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/opcoes-vinculo", response_model=List[dict])
def opcoes_vinculo_projeto():
    """Provedores existentes + seus processos, para o formulário de novo projeto."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            f"""
            SELECT
                PR.ID_PROVEDOR,
                PR.RAZAO_SOCIAL,
                PR.NOME_FANTASIA,
                PR.CNPJ,
                PR.STATUS_CADASTRO,
                (
                    SELECT MAX(E.MUNICIPIO)
                    FROM {TB_ENTRADA} E
                    WHERE E.CNPJ = PR.CNPJ
                ) AS MUNICIPIO
            FROM {TB_PROVEDOR} PR
            ORDER BY PR.RAZAO_SOCIAL ASC
            """
        )
        provedores = _linhas(cursor)

        cursor.execute(
            f"""
            SELECT ID_PROVEDOR, ID_PROCESSO, NUMERO_PROTOCOLO, STATUS_ATUAL, ETAPA_ATUAL
            FROM {TB_PROCESSO}
            ORDER BY ID_PROCESSO ASC
            """
        )
        processos_por_provedor: dict = {}
        for proc in _linhas(cursor):
            processos_por_provedor.setdefault(proc["ID_PROVEDOR"], []).append(
                {
                    "ID_PROCESSO": proc["ID_PROCESSO"],
                    "NUMERO_PROTOCOLO": proc["NUMERO_PROTOCOLO"],
                    "STATUS_ATUAL": proc["STATUS_ATUAL"],
                    "ETAPA_ATUAL": proc["ETAPA_ATUAL"],
                }
            )

        return [
            {
                "ID_PROVEDOR": p["ID_PROVEDOR"],
                "RAZAO_SOCIAL": p["RAZAO_SOCIAL"],
                "NOME_FANTASIA": p["NOME_FANTASIA"],
                "CNPJ": p["CNPJ"],
                "MUNICIPIO": p.get("MUNICIPIO"),
                "UF": None,
                "STATUS_CADASTRO": p["STATUS_CADASTRO"],
                "processos": processos_por_provedor.get(p["ID_PROVEDOR"], []),
            }
            for p in provedores
        ]
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/tipos", response_model=dict)
def listar_tipos_projeto():
    return {"tipos": TIPOS_PROJETO, "modalidades": MODALIDADES}


@router.get("/api/projetos/checklist", response_model=dict)
def checklist_projeto(
    tipo: str = "NOVO_COMPARTILHAMENTO",
    modalidade: str = "COMPLETO",
    sem_contrato: str = "N",
    qtd_postes: int = 0,
    dias_revelia: int = 0,
):
    if tipo not in CODIGOS_TIPO:
        raise HTTPException(status_code=400, detail="tipo de projeto invalido")
    sc = "S" if sem_contrato == "S" else "N"
    modal = "CHECKLIST_SIMPLIFICADO" if modalidade == "CHECKLIST_SIMPLIFICADO" else "COMPLETO"
    return {
        "tipo": tipo,
        "modalidade": modal,
        "sem_contrato": sc,
        "documentos": _resolver_checklist(tipo, modal, sc),
        "elegibilidade_simplificado": _checar_simplificado(tipo, qtd_postes, dias_revelia),
    }


@router.patch("/api/projetos/{id_projeto}/integracao", response_model=dict)
def atualizar_integracao_projeto(id_projeto: int, payload: dict = Body(...)):
    """Atualiza os dados de integracao (SAP CRM / SAP CCS / SharePoint) e o
    checklist de etapas do recebimento."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)

        cursor.execute(f"SELECT ID_PROJETO FROM {TB_PROJETO} WHERE ID_PROJETO = ?", [id_projeto])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Projeto nao encontrado")

        campos = []
        valores: List[Any] = []
        mapa_texto = {
            "protocolo_sap_crm": "PROTOCOLO_SAP_CRM",
            "nota_sap_ccs": "NOTA_SAP_CCS",
            "pasta_sharepoint": "PASTA_SHAREPOINT",
        }
        mapa_flag = {
            "etapa_protocolo_crm": "ETAPA_PROTOCOLO_CRM",
            "etapa_nota_ccs": "ETAPA_NOTA_CCS",
            "etapa_pasta_sharepoint": "ETAPA_PASTA_SHAREPOINT",
            "etapa_esteira_analise": "ETAPA_ESTEIRA_ANALISE",
        }
        for chave, coluna in mapa_texto.items():
            if chave in payload:
                t = str(payload[chave]).strip() if payload[chave] is not None else ""
                campos.append(f"{coluna} = ?")
                valores.append(t or None)
        for chave, coluna in mapa_flag.items():
            if chave in payload:
                campos.append(f"{coluna} = ?")
                valores.append("S" if payload[chave] in ("S", True) else "N")

        if campos:
            campos.append("UPDATED_AT = CURRENT_UTCTIMESTAMP")
            campos.append("UPDATED_BY = ?")
            valores.append(str(payload.get("usuario") or "CLB349328"))
            valores.append(id_projeto)
            cursor.execute(f"UPDATE {TB_PROJETO} SET {', '.join(campos)} WHERE ID_PROJETO = ?", valores)
            cursor.execute(
                f"""
                INSERT INTO {TB_HIST}
                (ID_PROJETO, TIPO_EVENTO, DESCRICAO, USUARIO, DATA_EVENTO)
                VALUES (?, 'STATUS', 'Dados de integracao atualizados.', ?, CURRENT_UTCTIMESTAMP)
                """,
                [id_projeto, str(payload.get("usuario") or "CLB349328")],
            )
            conn.commit()

        cursor.execute(f"SELECT * FROM {TB_PROJETO} WHERE ID_PROJETO = ?", [id_projeto])
        linhas = _linhas(cursor)
        return {"success": True, "projeto": linhas[0] if linhas else None}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar a integracao: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ------------------------------------------------------------------
# Carteira de analise / SLA
# ------------------------------------------------------------------
@router.get("/api/projetos/analistas", response_model=List[dict])
def listar_analistas():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"SELECT \"LOGIN\", \"NOME\" FROM {TB_USUARIO} WHERE UPPER(COALESCE(\"STATUS\",'ATIVO')) <> 'INATIVO' ORDER BY \"NOME\""
            )
            linhas = [{"LOGIN": r[0], "NOME": r[1] or r[0]} for r in cursor.fetchall() if r[0]]
            if linhas:
                return linhas
        except Exception:
            pass
        _garantir_tabelas_projeto(cursor)
        conn.commit()
        cursor.execute(
            f"SELECT DISTINCT RESPONSAVEL_ANALISE FROM {TB_PROJETO} WHERE RESPONSAVEL_ANALISE IS NOT NULL ORDER BY RESPONSAVEL_ANALISE"
        )
        return [{"LOGIN": r[0], "NOME": r[0]} for r in cursor.fetchall()]
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/sla", response_model=dict)
def sla_projetos():
    return {
        "unidade": "dias corridos a partir da atribuição",
        "dias": SLA_DIAS,
        "exemplo_prazo": {p: _prazo_padrao(p) for p in SLA_DIAS},
    }


@router.get("/api/projetos/carteira", response_model=List[dict])
def carteira_analise(responsavel: Optional[str] = None):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()

        marc_enc = ",".join(["?"] * len(STATUS_ENCERRADO))
        where = f" WHERE ATIVO = 'S' AND STATUS_PROJETO NOT IN ({marc_enc})"
        params: List[Any] = list(STATUS_ENCERRADO)
        if responsavel == "__sem__":
            where += " AND RESPONSAVEL_ANALISE IS NULL"
        elif responsavel:
            where += " AND RESPONSAVEL_ANALISE = ?"
            params.append(responsavel)

        cursor.execute(
            f"""
            SELECT ID_PROJETO, NUMERO_PROJETO, TITULO, RAZAO_SOCIAL, NOME_FANTASIA, CNPJ,
                   MUNICIPIO, UF, STATUS_PROJETO, PRIORIDADE, RESPONSAVEL_ANALISE, PRAZO_ANALISE,
                   DATA_RECEBIMENTO, DOCS_VALIDADOS, DOCS_OBRIGATORIOS
            FROM {TB_PROJETO}{where}
            ORDER BY COALESCE(PRAZO_ANALISE, DATE'9999-12-31'), ID_PROJETO
            """,
            params,
        )
        itens = _linhas(cursor)
        for it in itens:
            it["DIAS_PARA_PRAZO"] = _dias_para_prazo(it.get("PRAZO_ANALISE"))
            it["SITUACAO_PRAZO"] = _situacao_prazo(it.get("PRAZO_ANALISE"))
        return itens
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/projetos/sla-carteira", response_model=dict)
def sla_carteira():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()
        marc_enc = ",".join(["?"] * len(STATUS_ENCERRADO))
        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS TOTAL,
                SUM(CASE WHEN CAST(DATA_CONCLUSAO AS DATE) <= PRAZO_ANALISE THEN 1 ELSE 0 END) AS DENTRO
            FROM {TB_PROJETO}
            WHERE ATIVO = 'S' AND PRAZO_ANALISE IS NOT NULL AND DATA_CONCLUSAO IS NOT NULL
              AND STATUS_PROJETO IN ({marc_enc})
            """,
            list(STATUS_ENCERRADO),
        )
        r = cursor.fetchone() or (0, 0)
        total = int(r[0] or 0)
        dentro = int(r[1] or 0)
        return {
            "total_avaliados": total,
            "dentro_prazo": dentro,
            "fora_prazo": total - dentro,
            "taxa_cumprimento_sla": (round(dentro / total * 1000) / 10) if total else 0,
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ------------------------------------------------------------------
# Mutacoes do projeto
# ------------------------------------------------------------------
@router.patch("/api/projetos/{id_projeto}/status", response_model=dict)
def mudar_status_projeto(id_projeto: int, payload: dict = Body(...)):
    novo = (payload or {}).get("status")
    if novo not in STATUS_PROJETO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"status deve ser um de: {', '.join(sorted(STATUS_PROJETO_VALIDOS))}")
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        cursor.execute(f"SELECT STATUS_PROJETO FROM {TB_PROJETO} WHERE ID_PROJETO = ?", [id_projeto])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        anterior = row[0]
        concluiu = novo in ("CONCLUIDO", "VINCULADO")
        cursor.execute(
            f"""
            UPDATE {TB_PROJETO}
               SET STATUS_PROJETO = ?, UPDATED_AT = CURRENT_UTCTIMESTAMP,
                   DATA_CONCLUSAO = {"CURRENT_UTCTIMESTAMP" if concluiu else "DATA_CONCLUSAO"}
             WHERE ID_PROJETO = ?
            """,
            [novo, id_projeto],
        )
        _add_historico(cursor, id_projeto, "STATUS", anterior, novo, payload.get("observacao"), payload.get("usuario"))
        conn.commit()
        return {"success": True, "status": novo}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao mudar o status: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/projetos/{id_projeto}/atribuir", response_model=dict)
def atribuir_projeto(id_projeto: int, payload: dict = Body(...)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        cursor.execute(f"SELECT PRIORIDADE, STATUS_PROJETO FROM {TB_PROJETO} WHERE ID_PROJETO = ?", [id_projeto])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        prioridade, status_atual = row[0], row[1]

        responsavel = (str(payload.get("responsavel") or "").strip()) or None
        prazo = (str(payload.get("prazo") or "").strip()) or None
        if not prazo and payload.get("usar_sla") is not False:
            prazo = _prazo_padrao(prioridade)

        novo_status = "EM_ANALISE" if (status_atual == "RECEBIDO" and responsavel) else status_atual
        cursor.execute(
            f"""
            UPDATE {TB_PROJETO}
               SET RESPONSAVEL_ANALISE = ?,
                   PRAZO_ANALISE = {"TO_DATE(?, 'YYYY-MM-DD')" if prazo else "NULL"},
                   STATUS_PROJETO = ?, UPDATED_AT = CURRENT_UTCTIMESTAMP
             WHERE ID_PROJETO = ?
            """,
            ([responsavel, prazo, novo_status, id_projeto] if prazo else [responsavel, novo_status, id_projeto]),
        )
        _add_historico(
            cursor, id_projeto, "ATRIBUICAO", None, None,
            (f"Atribuído a {responsavel}, prazo {prazo or 'não definido'} (SLA {prioridade})."
             if responsavel else "Responsável removido da carteira."),
            payload.get("usuario"),
        )
        conn.commit()
        return {"success": True, "responsavel_analise": responsavel, "prazo_analise": prazo, "status_projeto": novo_status}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao atribuir: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/projetos/{id_projeto}/postes/{id_poste}", response_model=dict)
def atualizar_poste_projeto(id_projeto: int, id_poste: int, payload: dict = Body(...)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        cursor.execute(
            f"SELECT ID_PROJETO_POSTE FROM {TB_POSTE} WHERE ID_PROJETO_POSTE = ? AND ID_PROJETO = ?",
            [id_poste, id_projeto],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Poste do projeto não encontrado")

        campos = []
        valores: List[Any] = []
        if payload.get("status_analise") in STATUS_ANALISE_POSTE:
            campos.append("STATUS_ANALISE = ?")
            valores.append(payload["status_analise"])
        if "motivo_reprovacao" in payload:
            campos.append("MOTIVO_REPROVACAO = ?")
            valores.append(payload["motivo_reprovacao"] or None)
        if "observacao" in payload:
            campos.append("OBSERVACAO = ?")
            valores.append(payload["observacao"] or None)
        if campos:
            campos.append("UPDATED_AT = CURRENT_UTCTIMESTAMP")
            valores.append(id_poste)
            cursor.execute(f"UPDATE {TB_POSTE} SET {', '.join(campos)} WHERE ID_PROJETO_POSTE = ?", valores)
        _recalcular_contadores(cursor, id_projeto)
        conn.commit()
        cursor.execute(f"SELECT * FROM {TB_POSTE} WHERE ID_PROJETO_POSTE = ?", [id_poste])
        linhas = _linhas(cursor)
        return {"success": True, "poste": linhas[0] if linhas else None}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar o poste: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/projetos/{id_projeto}/documentos/{id_doc}", response_model=dict)
def atualizar_documento_projeto(id_projeto: int, id_doc: int, payload: dict = Body(...)):
    novo = (payload or {}).get("status")
    if novo is not None and novo not in STATUS_DOC_VALIDOS:
        raise HTTPException(status_code=400, detail=f"status deve ser um de: {', '.join(sorted(STATUS_DOC_VALIDOS))}")
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        cursor.execute(
            f"SELECT TIPO_DOCUMENTO FROM {TB_DOC} WHERE ID_PROJETO_DOCUMENTO = ? AND ID_PROJETO = ?",
            [id_doc, id_projeto],
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Documento não encontrado")
        nome_doc = row[0]
        usuario = str(payload.get("usuario") or "CLB349328")

        if novo:
            sets = ["STATUS_DOCUMENTO = ?"]
            vals: List[Any] = [novo]
            if novo == "VALIDADO":
                sets += ["VALIDADO_POR = ?", "DATA_VALIDACAO = CURRENT_UTCTIMESTAMP"]
                vals.append(usuario)
            if novo == "REJEITADO":
                sets.append("MOTIVO_REJEICAO = ?")
                vals.append(payload.get("motivo") or "Documento rejeitado.")
            vals.append(id_doc)
            cursor.execute(f"UPDATE {TB_DOC} SET {', '.join(sets)} WHERE ID_PROJETO_DOCUMENTO = ?", vals)

        _recalcular_contadores(cursor, id_projeto)
        _add_historico(cursor, id_projeto, "DOCUMENTO", None, None, f"{nome_doc}: {novo or 'atualizado'}.", usuario)
        conn.commit()
        cursor.execute(f"SELECT * FROM {TB_DOC} WHERE ID_PROJETO_DOCUMENTO = ?", [id_doc])
        linhas = _linhas(cursor)
        return {"success": True, "documento": linhas[0] if linhas else None}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar o documento: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/projetos/{id_projeto}/analise", response_model=dict)
def registrar_analise_projeto(id_projeto: int, payload: dict = Body(...)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        cursor.execute(f"SELECT STATUS_PROJETO FROM {TB_PROJETO} WHERE ID_PROJETO = ?", [id_projeto])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        anterior = row[0]

        cursor.execute(
            f"""
            SELECT
                SUM(CASE WHEN STATUS_ANALISE = 'APROVADO' THEN 1 ELSE 0 END),
                SUM(CASE WHEN STATUS_ANALISE = 'REPROVADO' THEN 1 ELSE 0 END)
            FROM {TB_POSTE} WHERE ID_PROJETO = ?
            """,
            [id_projeto],
        )
        ap, rp = (cursor.fetchone() or (0, 0))
        ap, rp = int(ap or 0), int(rp or 0)
        resultado = payload.get("resultado") or "PENDENCIA"
        flag = lambda k: "S" if payload.get(k) else "N"

        cursor.execute(
            f"""
            INSERT INTO {TB_ANALISE}
            (ID_PROJETO, DOC_CONFERIDA, CNPJ_REGULAR, LICENCA_ANATEL_OK, POSTES_LOCALIZADOS,
             GEO_DENTRO_CONCESSAO, CAPACIDADE_SUFICIENTE, RESULTADO, PARECER,
             QTD_POSTES_APROVADOS, QTD_POSTES_REPROVADOS, USUARIO_ANALISE, DATA_ANALISE, CREATED_AT)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_UTCTIMESTAMP, CURRENT_UTCTIMESTAMP)
            """,
            [
                id_projeto, flag("doc_conferida"), flag("cnpj_regular"), flag("licenca_anatel_ok"),
                flag("postes_localizados"), flag("geo_dentro_concessao"), flag("capacidade_suficiente"),
                resultado, payload.get("parecer"), ap, rp, str(payload.get("usuario") or "CLB349328"),
            ],
        )
        cursor.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
        id_analise = int(cursor.fetchone()[0])

        novo_status = "DEVOLVIDO" if resultado == "REPROVADO" else "PARECER_EMITIDO"
        cursor.execute(
            f"UPDATE {TB_PROJETO} SET STATUS_PROJETO = ?, UPDATED_AT = CURRENT_UTCTIMESTAMP WHERE ID_PROJETO = ?",
            [novo_status, id_projeto],
        )
        _add_historico(cursor, id_projeto, "ANALISE", anterior, novo_status, "Parecer registrado.", payload.get("usuario"))
        conn.commit()
        return {"success": True, "id_analise": id_analise, "status": novo_status}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao registrar a análise: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ------------------------------------------------------------------
# Caixa de entrada (submissoes)
# ------------------------------------------------------------------
@router.get("/api/projetos/submissoes", response_model=List[dict])
def listar_submissoes(status: Optional[str] = None):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)
        conn.commit()
        where = ""
        params: List[Any] = []
        if status:
            where = " WHERE STATUS_SUBMISSAO = ?"
            params.append(status)
        cursor.execute(f"SELECT * FROM {TB_SUBMISSAO}{where} ORDER BY DATA_EMAIL DESC, ID_SUBMISSAO DESC", params)
        itens = _linhas(cursor)
        for it in itens:
            chave = it.get("CHAVE_CONEXAO") or ""
            cursor.execute(
                f"SELECT 1 FROM {TB_PROVEDOR} WHERE REPLACE(REPLACE(REPLACE(CNPJ,'.',''),'/',''),'-','') = ?",
                [chave],
            )
            it["PROVEDOR_CONHECIDO"] = cursor.fetchone() is not None
        return itens
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/projetos/submissoes/{id_sub}/vincular", response_model=dict)
def vincular_submissao(id_sub: int, payload: dict = Body(...)):
    """Cria um projeto a partir de uma submissao da caixa de entrada."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)

        cursor.execute(
            f"SELECT ID_SUBMISSAO, ID_PROJETO, CHAVE_CONEXAO, ASSUNTO, EMAIL_REMETENTE FROM {TB_SUBMISSAO} WHERE ID_SUBMISSAO = ?",
            [id_sub],
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Submissão não encontrada")
        if row[1]:
            raise HTTPException(status_code=409, detail="Submissão já vinculada a um projeto")
        chave, assunto, remetente = row[2] or "", row[3], row[4]

        provedor = None
        cursor.execute(
            f"""
            SELECT ID_PROVEDOR, CNPJ, RAZAO_SOCIAL, NOME_FANTASIA, MUNICIPIO, UF
            FROM {TB_PROVEDOR}
            WHERE REPLACE(REPLACE(REPLACE(CNPJ,'.',''),'/',''),'-','') = ?
            """,
            [chave],
        )
        pr = cursor.fetchone()
        if pr:
            provedor = {"ID_PROVEDOR": pr[0], "CNPJ": pr[1], "RAZAO_SOCIAL": pr[2], "NOME_FANTASIA": pr[3],
                        "MUNICIPIO": pr[4], "UF": pr[5]}

        cnpj = str(payload.get("cnpj") or (provedor["CNPJ"] if provedor else chave))
        razao = str(payload.get("razao_social") or (provedor["RAZAO_SOCIAL"] if provedor else "Provedor não identificado"))
        fantasia = payload.get("nome_fantasia") or (provedor["NOME_FANTASIA"] if provedor else None)
        municipio = (provedor["MUNICIPIO"] if provedor else None) or "Salvador"
        uf = (provedor["UF"] if provedor else None) or "BA"
        usuario = str(payload.get("submetido_por") or payload.get("usuario") or "CLB349328")

        tipo_projeto = payload.get("tipo_projeto") if payload.get("tipo_projeto") in CODIGOS_TIPO else "NOVO_COMPARTILHAMENTO"
        modalidade = "CHECKLIST_SIMPLIFICADO" if payload.get("modalidade") == "CHECKLIST_SIMPLIFICADO" else "COMPLETO"
        sem_contrato = "S" if payload.get("sem_contrato") in ("S", True) else "N"
        checklist = _resolver_checklist(tipo_projeto, modalidade, sem_contrato)

        cursor.execute(f"SELECT COUNT(*) FROM {TB_PROJETO}")
        seq = (cursor.fetchone()[0] or 0) + 1
        numero_projeto = f"PRJ-{datetime.utcnow().year}-{seq:06d}"
        titulo = f"Compartilhamento {fantasia or razao} - {municipio}"

        cursor.execute(
            f"""
            INSERT INTO {TB_PROJETO}
            (NUMERO_PROJETO, TITULO, CHAVE_CONEXAO, ID_PROVEDOR, CNPJ, RAZAO_SOCIAL, NOME_FANTASIA,
             MUNICIPIO, UF, REGIONAL, QTD_POSTES_INFORMADA, QTD_POSTES_RECEBIDA, QTD_POSTES_VALIDADA,
             STATUS_PROJETO, PRIORIDADE, CANAL_ORIGEM, SUBMETIDO_POR, EMAIL_REMETENTE, DATA_RECEBIMENTO,
             DOCS_OBRIGATORIOS, DOCS_RECEBIDOS, DOCS_VALIDADOS, DOCUMENTACAO_OK,
             TIPO_PROJETO, MODALIDADE, SEM_CONTRATO,
             CREATED_AT, CREATED_BY, UPDATED_AT, UPDATED_BY, ATIVO)
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Metropolitana', 0, 0, 0,
             'EM_ANALISE', 'MEDIA', 'EMAIL', ?, ?, CURRENT_UTCTIMESTAMP,
             ?, 0, 0, 'N', ?, ?, ?,
             CURRENT_UTCTIMESTAMP, ?, CURRENT_UTCTIMESTAMP, ?, 'S')
            """,
            [
                numero_projeto, titulo, _so_digitos(cnpj),
                (provedor["ID_PROVEDOR"] if provedor else None),
                cnpj, razao, fantasia, municipio, uf,
                usuario, remetente,
                len(checklist), tipo_projeto, modalidade, sem_contrato,
                usuario, usuario,
            ],
        )
        cursor.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
        id_projeto = int(cursor.fetchone()[0])

        for doc in checklist:
            cursor.execute(
                f"""
                INSERT INTO {TB_DOC}
                (ID_PROJETO, ID_SUBMISSAO, CODIGO_TIPO, TIPO_DOCUMENTO, OBRIGATORIO,
                 STATUS_DOCUMENTO, RECEBIDO_VIA, CREATED_AT, ATIVO)
                VALUES (?, ?, ?, ?, 'S', 'PENDENTE', 'EMAIL', CURRENT_UTCTIMESTAMP, 'S')
                """,
                [id_projeto, id_sub, doc["CODIGO"], doc["NOME"]],
            )

        cursor.execute(
            f"""
            UPDATE {TB_SUBMISSAO}
               SET ID_PROJETO = ?, STATUS_SUBMISSAO = 'VINCULADA', SUBMETIDO_POR = ?,
                   DATA_SUBMISSAO = CURRENT_UTCTIMESTAMP, PROCESSADO_EM = CURRENT_UTCTIMESTAMP
             WHERE ID_SUBMISSAO = ?
            """,
            [id_projeto, usuario, id_sub],
        )
        _add_historico(
            cursor, id_projeto, "RECEBIMENTO", None, "RECEBIDO",
            f'Projeto criado a partir do e-mail "{assunto}".', usuario,
        )
        _add_historico(cursor, id_projeto, "STATUS", "RECEBIDO", "EM_ANALISE", "Triagem concluída.", usuario)
        conn.commit()
        return {
            "success": True,
            "id_projeto": id_projeto,
            "numero_projeto": numero_projeto,
            "vinculo_resolvido": bool(provedor),
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao vincular a submissão: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/projetos", response_model=dict)
def criar_projeto_manual(payload: dict = Body(...)):
    """Cria um projeto manualmente e o associa a um provedor (e, opcionalmente,
    a um processo) existentes. O projeto entra como RECEBIDO, canal MANUAL,
    com o checklist de documentos obrigatórios todo PENDENTE."""
    id_provedor = payload.get("id_provedor")
    id_processo = payload.get("id_processo")
    prioridade = str(payload.get("prioridade") or "MEDIA").strip().upper()
    if prioridade not in PRIORIDADES:
        prioridade = "MEDIA"

    def _texto(valor: Any) -> Optional[str]:
        t = str(valor).strip() if valor is not None else ""
        return t or None

    try:
        qtd_postes = int(payload.get("qtd_postes_informada") or 0)
    except (TypeError, ValueError):
        qtd_postes = 0

    # Classificacao (o procedimento muda conforme o tipo).
    tipo_projeto = payload.get("tipo_projeto") or "NOVO_COMPARTILHAMENTO"
    if tipo_projeto not in CODIGOS_TIPO:
        raise HTTPException(status_code=400, detail="Informe o tipo de projeto (com base no e-mail).")
    modalidade = "CHECKLIST_SIMPLIFICADO" if payload.get("modalidade") == "CHECKLIST_SIMPLIFICADO" else "COMPLETO"
    sem_contrato = "S" if payload.get("sem_contrato") in ("S", True) else "N"
    try:
        dias_revelia = int(payload.get("dias_operacao_revelia") or 0)
    except (TypeError, ValueError):
        dias_revelia = 0
    if modalidade == "CHECKLIST_SIMPLIFICADO":
        chk = _checar_simplificado(tipo_projeto, qtd_postes, dias_revelia)
        if not chk["elegivel"] and payload.get("forcar") is not True:
            raise HTTPException(
                status_code=422,
                detail=f"Checklist Simplificado nao permitido. {chk['motivo']}",
            )
    checklist = _resolver_checklist(tipo_projeto, modalidade, sem_contrato)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabelas_projeto(cursor)

        provedor = None
        if id_provedor is not None:
            cursor.execute(
                f"SELECT ID_PROVEDOR, CNPJ, RAZAO_SOCIAL, NOME_FANTASIA FROM {TB_PROVEDOR} WHERE ID_PROVEDOR = ?",
                [int(id_provedor)],
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Provedor não encontrado")
            provedor = {"ID_PROVEDOR": row[0], "CNPJ": row[1], "RAZAO_SOCIAL": row[2], "NOME_FANTASIA": row[3]}

        processo = None
        if id_processo is not None:
            cursor.execute(
                f"SELECT ID_PROCESSO, ID_PROVEDOR, NUMERO_PROTOCOLO FROM {TB_PROCESSO} WHERE ID_PROCESSO = ?",
                [int(id_processo)],
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado")
            processo = {"ID_PROCESSO": row[0], "ID_PROVEDOR": row[1], "NUMERO_PROTOCOLO": row[2]}
            if provedor and processo["ID_PROVEDOR"] != provedor["ID_PROVEDOR"]:
                raise HTTPException(
                    status_code=400,
                    detail="O processo informado não pertence ao provedor selecionado",
                )

        cnpj = _texto(payload.get("cnpj")) or (provedor["CNPJ"] if provedor else None)
        razao = _texto(payload.get("razao_social")) or (provedor["RAZAO_SOCIAL"] if provedor else None)
        if not provedor and not razao:
            raise HTTPException(status_code=400, detail="Selecione um provedor ou informe a razão social")

        fantasia = _texto(payload.get("nome_fantasia")) or (provedor["NOME_FANTASIA"] if provedor else None)
        municipio = _texto(payload.get("municipio")) or "Salvador"
        uf = (_texto(payload.get("uf")) or "BA")[:2].upper()
        usuario = _texto(payload.get("usuario")) or "CLB349328"

        # Número do projeto: PRJ-<ano>-<sequencial global, 6 dígitos>.
        cursor.execute(f"SELECT COUNT(*) FROM {TB_PROJETO}")
        seq = (cursor.fetchone()[0] or 0) + 1
        numero_projeto = f"PRJ-{datetime.utcnow().year}-{seq:06d}"
        titulo = _texto(payload.get("titulo")) or f"Compartilhamento {fantasia or razao} - {municipio}"

        cursor.execute(
            f"""
            INSERT INTO {TB_PROJETO}
            (
                NUMERO_PROJETO, TITULO, CHAVE_CONEXAO, ID_PROVEDOR, ID_PROCESSO,
                NUMERO_PROTOCOLO, CNPJ, RAZAO_SOCIAL, NOME_FANTASIA, MUNICIPIO, UF,
                REGIONAL, QTD_POSTES_INFORMADA, QTD_POSTES_RECEBIDA, QTD_POSTES_VALIDADA,
                STATUS_PROJETO, PRIORIDADE, CANAL_ORIGEM, SUBMETIDO_POR, DATA_RECEBIMENTO,
                DOCS_OBRIGATORIOS, DOCS_RECEBIDOS, DOCS_VALIDADOS, DOCUMENTACAO_OK,
                TIPO_PROJETO, MODALIDADE, SEM_CONTRATO, DIAS_OPERACAO_REVELIA,
                PROTOCOLO_SAP_CRM, NOTA_SAP_CCS, PASTA_SHAREPOINT,
                ETAPA_PROTOCOLO_CRM, ETAPA_NOTA_CCS, ETAPA_PASTA_SHAREPOINT, ETAPA_ESTEIRA_ANALISE,
                CREATED_AT, CREATED_BY, UPDATED_AT, UPDATED_BY, ATIVO
            )
            VALUES
            (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, 0, 0,
                'RECEBIDO', ?, 'MANUAL', ?, CURRENT_UTCTIMESTAMP,
                ?, 0, 0, 'N',
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, 'N',
                CURRENT_UTCTIMESTAMP, ?, CURRENT_UTCTIMESTAMP, ?, 'S'
            )
            """,
            [
                numero_projeto, titulo, _so_digitos(cnpj),
                provedor["ID_PROVEDOR"] if provedor else None,
                processo["ID_PROCESSO"] if processo else None,
                processo["NUMERO_PROTOCOLO"] if processo else None,
                cnpj, razao, fantasia, municipio, uf,
                "Metropolitana", qtd_postes,
                prioridade, usuario,
                len(checklist),
                tipo_projeto, modalidade, sem_contrato, (dias_revelia or None),
                _texto(payload.get("protocolo_sap_crm")), _texto(payload.get("nota_sap_ccs")),
                _texto(payload.get("pasta_sharepoint")),
                "S" if _texto(payload.get("protocolo_sap_crm")) else "N",
                "S" if _texto(payload.get("nota_sap_ccs")) else "N",
                "S" if _texto(payload.get("pasta_sharepoint")) else "N",
                usuario, usuario,
            ],
        )
        cursor.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
        id_projeto = int(cursor.fetchone()[0])

        # Checklist de documentos resolvido da matriz tipo/modalidade/sem contrato.
        for doc in checklist:
            cursor.execute(
                f"""
                INSERT INTO {TB_DOC}
                (ID_PROJETO, CODIGO_TIPO, TIPO_DOCUMENTO, OBRIGATORIO,
                 STATUS_DOCUMENTO, RECEBIDO_VIA, CREATED_AT, ATIVO)
                VALUES (?, ?, ?, 'S', 'PENDENTE', 'MANUAL', CURRENT_UTCTIMESTAMP, 'S')
                """,
                [id_projeto, doc["CODIGO"], doc["NOME"]],
            )

        descricao_hist = (
            f"Projeto criado manualmente e vinculado ao processo {processo['NUMERO_PROTOCOLO']}."
            if processo
            else f"Projeto criado manualmente e vinculado ao provedor {razao}."
            if provedor
            else "Projeto criado manualmente."
        )
        cursor.execute(
            f"""
            INSERT INTO {TB_HIST}
            (ID_PROJETO, TIPO_EVENTO, STATUS_ANTERIOR, STATUS_NOVO, DESCRICAO, USUARIO, DATA_EVENTO)
            VALUES (?, 'RECEBIMENTO', NULL, 'RECEBIDO', ?, ?, CURRENT_UTCTIMESTAMP)
            """,
            [id_projeto, descricao_hist, usuario],
        )

        conn.commit()
        return {
            "success": True,
            "id_projeto": id_projeto,
            "numero_projeto": numero_projeto,
            "vinculo_resolvido": bool(provedor),
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao criar o projeto: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
