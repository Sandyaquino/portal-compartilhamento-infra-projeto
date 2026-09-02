from fastapi import APIRouter, HTTPException, Path, Body, Query, File, UploadFile, Request
from typing import Any, Optional, List, Dict, Tuple
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta
import hashlib
import io
import re
import pandas as pd
from pydantic import BaseModel, Field

import main
from routers.auth import _auth_extrair_bearer_token, _auth_validar_token, _enviar_email_smtp

router = APIRouter()

class DocumentoProcessoCreate(BaseModel):
    id_etapa: int
    tipo_documento: Optional[str] = None
    nome_arquivo: str
    tipo_arquivo: Optional[str] = None
    caminho_arquivo: str
    tamanho_bytes: Optional[int] = None
    observacao: Optional[str] = None
    usuario_upload: Optional[str] = None


class AnaliseCadastralCreate(BaseModel):
    id_etapa: int
    dados_conferidos: bool
    cnpj_validado: bool
    responsavel_validado: bool
    contato_confirmado: bool
    usuario_registro: Optional[str] = None


class ParecerCreate(BaseModel):
    id_etapa: int
    resultado: str
    observacao: Optional[str] = None
    usuario_registro: Optional[str] = None


class ContratacaoCreate(BaseModel):
    numero_pn: str
    numero_contrato: str
    data_assinatura: Optional[str] = None
    url_contrato: str
    usuario_registro: Optional[str] = None


class RetornarEtapaRequest(BaseModel):
    motivo: str = Field(..., min_length=1)


class CancelarProcessoRequest(BaseModel):
    motivo: str = Field(..., min_length=1)


class ContatoProcessoCreate(BaseModel):
    data_contato: str
    meio_contato: Optional[str] = None
    pessoa_contato: Optional[str] = None
    observacao: str = Field(..., min_length=1)
    resultado: Optional[str] = None


class EnviarEmailProvedorRequest(BaseModel):
    para: Optional[str] = None
    assunto: str = Field(..., min_length=1)
    corpo: str = Field(..., min_length=1)
    pessoa_contato: Optional[str] = None


def _usuario_do_request(request: Request) -> str:
    """Tenta identificar o usuário real pelo token Bearer. routers/processos.py
    não exige autenticação hoje, então isso é best-effort: se não vier token
    ou ele for inválido, cai no valor fixo já usado no resto do arquivo."""
    try:
        token = _auth_extrair_bearer_token(request)
        payload = _auth_validar_token(token)
        return payload.get("login") or payload.get("email") or "CLB349328"
    except Exception:
        return "CLB349328"


def _normalizar_nome_etapa(valor: Any) -> str:
    """Normaliza NOME_ETAPA para comparação: maiúsculas, sem acento, espaço vira
    underscore. Necessário porque a etapa cadastrada no HANA é 'ANALISE CADASTRAL'
    (com espaço), diferente das demais ('DOCUMENTACAO', 'APROVACAO', 'CONTRATACAO')."""
    texto = str(valor or "").strip().upper()
    substituicoes = {
        "Á": "A", "À": "A", "Â": "A", "Ã": "A",
        "É": "E", "Ê": "E",
        "Í": "I",
        "Ó": "O", "Ô": "O", "Õ": "O",
        "Ú": "U",
        "Ç": "C",
        " ": "_",
    }
    for original, troca in substituicoes.items():
        texto = texto.replace(original, troca)
    return texto

# =====================================================
# PROCESSOS - GESTÃO DA JORNADA
# Endpoints utilizados pela tela app/comercial/processos/[id]/page.tsx
# =====================================================


def _processos_json_value(value: Any) -> Any:
    """Converte valores SAP HANA para tipos serializáveis em JSON."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _processos_rows_to_dicts(cursor, rows):
    columns = [col[0] for col in cursor.description]
    return [
        {
            columns[index]: _processos_json_value(value)
            for index, value in enumerate(row)
        }
        for row in rows
    ]



@router.get("/api/processos", response_model=List[dict])
def listar_processos_esteira(
    status: Optional[str] = Query(None),
    etapa: Optional[str] = Query(None),
    municipio: Optional[str] = Query(None),
    protocolo: Optional[str] = Query(None),
    provedor: Optional[str] = Query(None),
):
    """
    Lista os processos para a tela de Esteira de Processos.

    Endpoint consumido por:
        app/comercial/processos/page.tsx

    Observacao:
    - A rota /api/processos/{id} continua sendo usada pela timeline individual.
    - Esta rota /api/processos retorna a visao gerencial da esteira.
    """
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        sql = """
            SELECT
                P.ID_PROCESSO,
                P.ID_PROVEDOR,
                P.NUMERO_PROTOCOLO,
                P.TIPO_PROCESSO,
                P.STATUS_ATUAL,
                P.ETAPA_ATUAL,
                E.NOME_ETAPA AS NOME_ETAPA_ATUAL,
                P.MUNICIPIO,
                P.REGIONAL,
                P.PRIORIDADE,
                P.DT_ABERTURA,
                P.DT_PREVISAO_CONCLUSAO,
                P.DT_CONCLUSAO,
                PR.CNPJ,
                PR.RAZAO_SOCIAL,
                PR.NOME_FANTASIA,
                PR.RESPONSAVEL,
                PR.EMAIL,
                PR.TELEFONE,
                COALESCE(J.SLA_DIAS, E.SLA_DIAS) AS SLA_DIAS,
                J.DIAS_CONSUMIDOS,
                J.DIAS_ATRASO,
                J.STATUS_ETAPA AS STATUS_ETAPA_ATUAL,
                J.DATA_ENTRADA_ETAPA,
                J.DATA_PREVISTA_CONCLUSAO,
                J.DATA_CONCLUSAO_ETAPA
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO P
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_PROVEDOR PR
                ON PR.ID_PROVEDOR = P.ID_PROVEDOR
            LEFT JOIN CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA E
                ON E.ID_ETAPA = P.ETAPA_ATUAL
            LEFT JOIN CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA J
                ON J.ID_JORNADA = (
                    SELECT MAX(J2.ID_JORNADA)
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA J2
                    WHERE J2.ID_PROCESSO = P.ID_PROCESSO
                      AND J2.ID_ETAPA = P.ETAPA_ATUAL
                      AND COALESCE(J2.ATIVO, 'S') = 'S'
                )
            WHERE 1 = 1
        """

        params = []

        if status:
            sql += " AND UPPER(P.STATUS_ATUAL) LIKE UPPER(?)"
            params.append(f"%{status}%")

        if etapa:
            sql += " AND (UPPER(E.NOME_ETAPA) LIKE UPPER(?) OR TO_NVARCHAR(P.ETAPA_ATUAL) LIKE ?)"
            params.extend([f"%{etapa}%", f"%{etapa}%"])

        if municipio:
            sql += " AND UPPER(COALESCE(P.MUNICIPIO, '')) LIKE UPPER(?)"
            params.append(f"%{municipio}%")

        if protocolo:
            sql += " AND UPPER(COALESCE(P.NUMERO_PROTOCOLO, '')) LIKE UPPER(?)"
            params.append(f"%{protocolo}%")

        if provedor:
            sql += """
                AND (
                    UPPER(COALESCE(PR.RAZAO_SOCIAL, '')) LIKE UPPER(?)
                    OR UPPER(COALESCE(PR.NOME_FANTASIA, '')) LIKE UPPER(?)
                    OR COALESCE(PR.CNPJ, '') LIKE ?
                )
            """
            termo = f"%{provedor}%"
            params.extend([termo, termo, termo])

        sql += " ORDER BY P.DT_ABERTURA DESC, P.ID_PROCESSO DESC"

        cursor.execute(sql, params)
        return _processos_rows_to_dicts(cursor, cursor.fetchall())

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/processos/etapas", response_model=List[dict])
def listar_etapas_processo():
    """Retorna as etapas cadastradas para composição da timeline da Jornada."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                ID_ETAPA,
                NOME_ETAPA,
                ORDEM_FLUXO,
                SLA_DIAS,
                ETAPA_CRITICA,
                OBRIGA_DOCUMENTO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA
            ORDER BY ORDEM_FLUXO ASC, ID_ETAPA ASC
            """
        )
        return _processos_rows_to_dicts(cursor, cursor.fetchall())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



class AtribuirEtapaRequest(BaseModel):
    responsavel: Optional[str] = None
    prazo: Optional[str] = None


class AtribuirContatoRequest(BaseModel):
    responsavel: Optional[str] = None
    prazo: Optional[str] = None


class AtualizarResultadoContatoRequest(BaseModel):
    resultado: Optional[str] = None


# =====================================================
# CARTEIRA DE ANÁLISE - fases do processo e contato
# Endpoints consumidos por app/comercial/carteira-analise/page.tsx
# =====================================================

@router.get("/api/processos/carteira", response_model=List[dict])
def listar_carteira_processos(etapa_id: Optional[int] = Query(None)):
    """Processos ativos com a etapa atual, pra fila de trabalho por fase
    (mesma junção PROCESSO/PROVEDOR/ETAPA/JORNADA de listar_processos_esteira,
    acrescentando responsável/prazo de atribuição real da etapa)."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        sql = """
            SELECT
                P.ID_PROCESSO,
                P.NUMERO_PROTOCOLO,
                P.ETAPA_ATUAL,
                E.NOME_ETAPA AS NOME_ETAPA_ATUAL,
                P.MUNICIPIO,
                PR.CNPJ,
                PR.RAZAO_SOCIAL,
                PR.NOME_FANTASIA,
                J.RESPONSAVEL_ETAPA,
                J.PRAZO_ETAPA,
                J.DATA_ATRIBUICAO_ETAPA,
                J.DATA_ENTRADA_ETAPA,
                P.PRIORIDADE
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO P
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_PROVEDOR PR
                ON PR.ID_PROVEDOR = P.ID_PROVEDOR
            LEFT JOIN CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA E
                ON E.ID_ETAPA = P.ETAPA_ATUAL
            LEFT JOIN CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA J
                ON J.ID_JORNADA = (
                    SELECT MAX(J2.ID_JORNADA)
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA J2
                    WHERE J2.ID_PROCESSO = P.ID_PROCESSO
                      AND J2.ID_ETAPA = P.ETAPA_ATUAL
                      AND J2.STATUS_ETAPA = 'EM_ANDAMENTO'
                      AND COALESCE(J2.ATIVO, 'S') = 'S'
                )
            WHERE P.STATUS_ATUAL NOT IN ('CONCLUIDO', 'CANCELADO')
        """
        params: List[Any] = []

        if etapa_id is not None:
            sql += " AND P.ETAPA_ATUAL = ?"
            params.append(etapa_id)

        sql += " ORDER BY J.PRAZO_ETAPA ASC, P.DT_ABERTURA ASC"

        cursor.execute(sql, params)
        return _processos_rows_to_dicts(cursor, cursor.fetchall())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _somente_data(valor):
    """Normaliza um valor de data/timestamp do HANA (ou string ISO, no caso
    dos testes) para datetime.date, pra comparar prazo x resolução sem se
    importar com o horário."""
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        return datetime.fromisoformat(valor[:10]).date()
    return None


@router.get("/api/processos/sla-etapa", response_model=dict)
def obter_sla_etapa(etapa_id: Optional[int] = Query(None)):
    """Taxa histórica de cumprimento do prazo atribuído (PRAZO_ETAPA) nas
    etapas já concluídas/devolvidas/canceladas (DATA_CONCLUSAO_ETAPA
    preenchida). etapa_id opcional: se omitido, agrega todas as etapas."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        sql = """
            SELECT PRAZO_ETAPA, DATA_CONCLUSAO_ETAPA
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
            WHERE PRAZO_ETAPA IS NOT NULL AND DATA_CONCLUSAO_ETAPA IS NOT NULL
        """
        params: List[Any] = []
        if etapa_id is not None:
            sql += " AND ID_ETAPA = ?"
            params.append(etapa_id)

        cursor.execute(sql, params)
        linhas = cursor.fetchall()

        total = len(linhas)
        dentro_prazo = sum(
            1 for prazo, conclusao in linhas
            if _somente_data(conclusao) is not None and _somente_data(conclusao) <= _somente_data(prazo)
        )
        fora_prazo = total - dentro_prazo
        taxa = round((dentro_prazo / total) * 100, 1) if total > 0 else 0

        return {
            "total_avaliados": total,
            "dentro_prazo": dentro_prazo,
            "fora_prazo": fora_prazo,
            "taxa_cumprimento_sla": taxa,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/processos/{id}/jornada/atribuir", response_model=dict)
def atribuir_responsavel_etapa(dados: AtribuirEtapaRequest, id: int = Path(..., alias="id")):
    """Define/troca o responsável e o prazo da etapa ATUAL do processo, sem
    mexer em STATUS_ETAPA nem disparar avanço - diferente de avancar-etapa."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        cursor.execute(
            """
            SELECT ID_JORNADA
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
            WHERE ID_PROCESSO = ?
              AND STATUS_ETAPA = 'EM_ANDAMENTO'
              AND COALESCE(ATIVO, 'S') = 'S'
            ORDER BY DATA_ENTRADA_ETAPA DESC, ID_JORNADA DESC
            LIMIT 1
            """,
            [id],
        )
        jornada = cursor.fetchone()
        if not jornada:
            raise HTTPException(status_code=404, detail="Nenhuma etapa em andamento para este processo.")

        responsavel = (dados.responsavel or "").strip() or None
        prazo = (dados.prazo or "").strip() or None

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
               SET RESPONSAVEL_ETAPA = ?,
                   PRAZO_ETAPA = TO_DATE(?),
                   DATA_ATRIBUICAO_ETAPA = CURRENT_TIMESTAMP
             WHERE ID_JORNADA = ?
            """,
            [responsavel, prazo, jornada[0]],
        )
        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "responsavel_etapa": responsavel,
            "prazo_etapa": prazo,
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/processos/carteira-contato", response_model=List[dict])
def listar_carteira_contato():
    """Processos ativos com responsável/prazo de contato e dados do último
    contato registrado, pra fila de trabalho de Contato com Provedor."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                P.ID_PROCESSO,
                P.NUMERO_PROTOCOLO,
                P.MUNICIPIO,
                PR.CNPJ,
                PR.RAZAO_SOCIAL,
                PR.NOME_FANTASIA,
                P.RESPONSAVEL_CONTATO,
                P.PRAZO_CONTATO,
                P.DATA_ATRIBUICAO_CONTATO,
                P.PRIORIDADE,
                (
                    SELECT MAX(C.DATA_CONTATO)
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO C
                    WHERE C.ID_PROCESSO = P.ID_PROCESSO
                ) AS ULTIMO_CONTATO_EM
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO P
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_PROVEDOR PR
                ON PR.ID_PROVEDOR = P.ID_PROVEDOR
            WHERE P.STATUS_ATUAL NOT IN ('CONCLUIDO', 'CANCELADO')
            ORDER BY P.PRAZO_CONTATO ASC, P.DT_ABERTURA ASC
            """
        )
        return _processos_rows_to_dicts(cursor, cursor.fetchall())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/processos/{id}/atribuir-contato", response_model=dict)
def atribuir_responsavel_contato(dados: AtribuirContatoRequest, id: int = Path(..., alias="id")):
    """Define/troca quem deve contatar o provedor deste processo e até quando."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        responsavel = (dados.responsavel or "").strip() or None
        prazo = (dados.prazo or "").strip() or None

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
               SET RESPONSAVEL_CONTATO = ?,
                   PRAZO_CONTATO = TO_DATE(?),
                   DATA_ATRIBUICAO_CONTATO = CURRENT_TIMESTAMP
             WHERE ID_PROCESSO = ?
            """,
            [responsavel, prazo, id],
        )
        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "responsavel_contato": responsavel,
            "prazo_contato": prazo,
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/processos/metricas-contato", response_model=dict)
def obter_metricas_contato():
    """Taxa de contato: RESPONDIDO / (RESPONDIDO + SEM_RESPOSTA), excluindo
    AGUARDANDO do denominador porque ainda não foi resolvido."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                COUNT(*) AS TOTAL_CONTATOS,
                COUNT(CASE WHEN RESULTADO = 'RESPONDIDO' THEN 1 END) AS RESPONDIDOS,
                COUNT(CASE WHEN RESULTADO = 'SEM_RESPOSTA' THEN 1 END) AS SEM_RESPOSTA,
                COUNT(CASE WHEN RESULTADO IS NULL OR RESULTADO = 'AGUARDANDO' THEN 1 END) AS AGUARDANDO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO
            """
        )
        row = cursor.fetchone()
        total, respondidos, sem_resposta, aguardando = row if row else (0, 0, 0, 0)

        denominador = (respondidos or 0) + (sem_resposta or 0)
        taxa_contato = round((respondidos / denominador) * 100, 1) if denominador > 0 else 0

        return {
            "total_contatos": total or 0,
            "respondidos": respondidos or 0,
            "sem_resposta": sem_resposta or 0,
            "aguardando": aguardando or 0,
            "taxa_contato": taxa_contato,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/processos/sla-contato", response_model=dict)
def obter_sla_contato():
    """Taxa histórica de cumprimento do prazo atribuído (PRAZO_CONTATO) nos
    processos cujo contato já teve um resultado final (RESPONDIDO ou
    SEM_RESPOSTA), usando DATA_RESULTADO como data de resolução."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT P.PRAZO_CONTATO, MIN(C.DATA_RESULTADO) AS DATA_RESOLUCAO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO P
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO C
                ON C.ID_PROCESSO = P.ID_PROCESSO
               AND C.RESULTADO IN ('RESPONDIDO', 'SEM_RESPOSTA')
            WHERE P.PRAZO_CONTATO IS NOT NULL AND C.DATA_RESULTADO IS NOT NULL
            GROUP BY P.ID_PROCESSO, P.PRAZO_CONTATO
            """
        )
        linhas = cursor.fetchall()

        total = len(linhas)
        dentro_prazo = sum(
            1 for prazo, resolucao in linhas
            if _somente_data(resolucao) is not None and _somente_data(resolucao) <= _somente_data(prazo)
        )
        fora_prazo = total - dentro_prazo
        taxa = round((dentro_prazo / total) * 100, 1) if total > 0 else 0

        return {
            "total_avaliados": total,
            "dentro_prazo": dentro_prazo,
            "fora_prazo": fora_prazo,
            "taxa_cumprimento_sla": taxa,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/processos/{id}/jornada", response_model=List[dict])
def listar_jornada_processo(id: int = Path(..., alias="id")):
    """Retorna o histórico da Jornada de um processo."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                J.ID_JORNADA,
                J.ID_PROCESSO,
                J.ID_ETAPA,
                E.NOME_ETAPA,
                E.ORDEM_FLUXO,
                J.STATUS_ETAPA,
                J.RESPONSAVEL_ATUAL,
                J.RESPONSAVEL_ETAPA,
                J.PRAZO_ETAPA,
                J.AREA_RESPONSAVEL,
                J.DATA_ENTRADA_ETAPA,
                J.DATA_PREVISTA_CONCLUSAO,
                J.DATA_CONCLUSAO_ETAPA,
                COALESCE(J.SLA_DIAS, E.SLA_DIAS) AS SLA_DIAS,
                J.DIAS_CONSUMIDOS,
                J.DIAS_ATRASO,
                J.OBSERVACAO,
                J.MOTIVO_RETORNO,
                J.COR_SLA,
                J.FLAG_PENDENCIA,
                J.FLAG_DOCUMENTO_PENDENTE,
                J.FLAG_BLOQUEADO,
                J.ATIVO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA J
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA E
                ON E.ID_ETAPA = J.ID_ETAPA
            WHERE J.ID_PROCESSO = ?
              AND COALESCE(J.ATIVO, 'S') = 'S'
            ORDER BY E.ORDEM_FLUXO ASC, J.DATA_ENTRADA_ETAPA ASC, J.ID_JORNADA ASC
            """,
            [id],
        )
        return _processos_rows_to_dicts(cursor, cursor.fetchall())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



@router.post("/api/processos/{id}/avancar-etapa", response_model=dict)
def avancar_etapa_processo(id: int = Path(..., alias="id")):
    """
    Conclui a etapa atual do processo e cria a próxima etapa como EM_ANDAMENTO.
    """
    conn = None
    cursor = None
    user = "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                ID_PROCESSO,
                ETAPA_ATUAL,
                STATUS_ATUAL
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
            WHERE ID_PROCESSO = ?
            """,
            [id],
        )
        processo = cursor.fetchone()
        if not processo:
            raise HTTPException(status_code=404, detail="Processo não encontrado")

        id_processo, etapa_atual, status_atual = processo

        if status_atual in ("CONCLUIDO", "CONCLUÍDO", "FINALIZADO"):
            raise HTTPException(status_code=409, detail="Este processo já está concluído.")

        if status_atual == "CANCELADO":
            raise HTTPException(status_code=409, detail="Este processo está cancelado.")

        if etapa_atual is None:
            raise HTTPException(status_code=400, detail="Processo não possui etapa atual definida.")

        cursor.execute(
            """
            SELECT
                ID_ETAPA,
                NOME_ETAPA,
                ORDEM_FLUXO,
                SLA_DIAS
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA
            WHERE ID_ETAPA = ?
            """,
            [etapa_atual],
        )
        etapa = cursor.fetchone()
        if not etapa:
            raise HTTPException(status_code=400, detail="Etapa atual não encontrada no cadastro de etapas.")

        id_etapa_atual, nome_etapa_atual, ordem_atual, sla_atual = etapa

        cursor.execute(
            """
            SELECT ID_JORNADA
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
            WHERE ID_PROCESSO = ?
              AND ID_ETAPA = ?
              AND STATUS_ETAPA = 'EM_ANDAMENTO'
              AND COALESCE(ATIVO, 'S') = 'S'
            ORDER BY DATA_ENTRADA_ETAPA DESC, ID_JORNADA DESC
            LIMIT 1
            """,
            [id_processo, id_etapa_atual],
        )
        jornada_atual = cursor.fetchone()
        if not jornada_atual:
            raise HTTPException(status_code=400, detail="Não existe jornada em andamento para a etapa atual.")

        id_jornada_atual = jornada_atual[0]


        # Regra de negócio: cada etapa só pode ser concluída se o registro
        # correspondente (checklist/parecer/contratação/documento) já foi
        # de fato preenchido. Sem isso, o "Concluir Etapa" avançava a
        # jornada mesmo sem nenhum dado da etapa ter sido registrado.
        nome_etapa_normalizado = _normalizar_nome_etapa(nome_etapa_atual)

        if nome_etapa_normalizado == "DOCUMENTACAO":
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO
                WHERE ID_PROCESSO = ?
                  AND ID_ETAPA = ?
                  AND COALESCE(ATIVO, 'S') = 'S'
                """,
                [id_processo, id_etapa_atual],
            )
            total_documentos = cursor.fetchone()[0] or 0
            if total_documentos == 0:
                raise HTTPException(
                    status_code=400,
                    detail="É obrigatório registrar ao menos um documento antes de concluir a etapa Documentação."
                )

        elif nome_etapa_normalizado == "ANALISE_CADASTRAL":
            cursor.execute(
                """
                SELECT DADOS_CONFERIDOS, CNPJ_VALIDADO, RESPONSAVEL_VALIDADO, CONTATO_CONFIRMADO
                FROM CLB349328.PORTAL_COMPARTILHAMENTO_ANALISE_CADASTRAL
                WHERE ID_PROCESSO = ? AND ID_ETAPA = ?
                ORDER BY DATA_REGISTRO DESC
                LIMIT 1
                """,
                [id_processo, id_etapa_atual],
            )
            analise = cursor.fetchone()
            if not analise:
                raise HTTPException(
                    status_code=400,
                    detail="É obrigatório preencher a análise cadastral antes de concluir esta etapa."
                )
            if any(str(valor) != "S" for valor in analise):
                raise HTTPException(
                    status_code=400,
                    detail="Todos os itens do checklist de análise cadastral precisam estar confirmados."
                )

        elif nome_etapa_normalizado == "APROVACAO":
            cursor.execute(
                """
                SELECT RESULTADO
                FROM CLB349328.PORTAL_COMPARTILHAMENTO_PARECER
                WHERE ID_PROCESSO = ? AND ID_ETAPA = ?
                ORDER BY DATA_REGISTRO DESC
                LIMIT 1
                """,
                [id_processo, id_etapa_atual],
            )
            parecer = cursor.fetchone()
            if not parecer:
                raise HTTPException(
                    status_code=400,
                    detail="É obrigatório registrar o parecer antes de concluir esta etapa."
                )
            if _normalizar_nome_etapa(parecer[0]) == "REPROVADO":
                raise HTTPException(
                    status_code=409,
                    detail="O parecer desta etapa está REPROVADO. Utilize 'Retornar etapa' ou 'Cancelar processo' em vez de avançar."
                )

        elif nome_etapa_normalizado == "CONTRATACAO":
            cursor.execute(
                """
                SELECT ID_CONTRATACAO
                FROM CLB349328.PORTAL_COMPARTILHAMENTO_CONTRATACAO
                WHERE ID_PROCESSO = ?
                ORDER BY DATA_REGISTRO DESC
                LIMIT 1
                """,
                [id_processo],
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="É obrigatório registrar os dados de contratação antes de concluir esta etapa."
                )

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
               SET STATUS_ETAPA = 'CONCLUIDO',
                   DATA_CONCLUSAO_ETAPA = CURRENT_TIMESTAMP,
                   DIAS_CONSUMIDOS = DAYS_BETWEEN(DATA_ENTRADA_ETAPA, CURRENT_DATE),
                   DIAS_ATRASO = CASE
                       WHEN DATA_PREVISTA_CONCLUSAO IS NOT NULL
                            AND CURRENT_DATE > TO_DATE(DATA_PREVISTA_CONCLUSAO)
                       THEN DAYS_BETWEEN(TO_DATE(DATA_PREVISTA_CONCLUSAO), CURRENT_DATE)
                       ELSE 0
                   END,
                   UPDATED_AT = CURRENT_TIMESTAMP,
                   UPDATED_BY = ?
             WHERE ID_JORNADA = ?
            """,
            [user, id_jornada_atual],
        )

        cursor.execute(
            """
            SELECT
                ID_ETAPA,
                NOME_ETAPA,
                ORDEM_FLUXO,
                SLA_DIAS
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA
            WHERE ORDEM_FLUXO > ?
            ORDER BY ORDEM_FLUXO ASC, ID_ETAPA ASC
            LIMIT 1
            """,
            [ordem_atual],
        )
        proxima = cursor.fetchone()

        if not proxima:
            cursor.execute(
                """
                UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
                   SET STATUS_ATUAL = 'CONCLUIDO',
                       DT_CONCLUSAO = CURRENT_TIMESTAMP
                 WHERE ID_PROCESSO = ?
                """,
                [id_processo],
            )
            conn.commit()
            return {
                "success": True,
                "id_processo": id_processo,
                "etapaAnterior": nome_etapa_atual,
                "novaEtapa": None,
                "statusProcesso": "CONCLUIDO",
                "mensagem": "Última etapa concluída. Processo finalizado com sucesso."
            }

        id_proxima_etapa, nome_proxima_etapa, ordem_proxima, sla_proxima = proxima
        sla_proxima = int(sla_proxima or 0)

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
            (
                ID_PROCESSO,
                ID_ETAPA,
                STATUS_ETAPA,
                RESPONSAVEL_ATUAL,
                AREA_RESPONSAVEL,
                DATA_ENTRADA_ETAPA,
                DATA_PREVISTA_CONCLUSAO,
                SLA_DIAS,
                FLAG_PENDENCIA,
                FLAG_DOCUMENTO_PENDENTE,
                FLAG_BLOQUEADO,
                CREATED_AT,
                CREATED_BY,
                ATIVO
            )
            VALUES
            (
                ?,
                ?,
                'EM_ANDAMENTO',
                ?,
                'COMERCIAL',
                CURRENT_TIMESTAMP,
                ADD_DAYS(CURRENT_DATE, ?),
                ?,
                'N',
                'N',
                'N',
                CURRENT_TIMESTAMP,
                ?,
                'S'
            )
            """,
            [id_processo, id_proxima_etapa, user, sla_proxima, sla_proxima, user],
        )

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
               SET ETAPA_ATUAL = ?,
                   STATUS_ATUAL = 'EM_ANDAMENTO'
             WHERE ID_PROCESSO = ?
            """,
            [id_proxima_etapa, id_processo],
        )

        conn.commit()

        return {
            "success": True,
            "id_processo": id_processo,
            "etapaAnterior": nome_etapa_atual,
            "novaEtapa": nome_proxima_etapa,
            "statusProcesso": "EM_ANDAMENTO",
            "mensagem": f"Etapa {nome_etapa_atual} concluída. Processo avançou para {nome_proxima_etapa}."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/retornar-etapa", response_model=dict)
def retornar_etapa_processo(id: int = Path(..., alias="id"), payload: RetornarEtapaRequest = Body(...)):
    """
    Devolve o processo para a etapa imediatamente anterior (retrabalho),
    registrando o motivo do retorno. Não avança - é o inverso de avancar-etapa.
    """
    conn = None
    cursor = None
    user = "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT ID_PROCESSO, ETAPA_ATUAL, STATUS_ATUAL
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
            WHERE ID_PROCESSO = ?
            """,
            [id],
        )
        processo = cursor.fetchone()
        if not processo:
            raise HTTPException(status_code=404, detail="Processo não encontrado")

        id_processo, etapa_atual, status_atual = processo

        if status_atual in ("CONCLUIDO", "CONCLUÍDO", "FINALIZADO", "CANCELADO"):
            raise HTTPException(status_code=409, detail="Este processo já está encerrado.")

        if etapa_atual is None:
            raise HTTPException(status_code=400, detail="Processo não possui etapa atual definida.")

        cursor.execute(
            """
            SELECT ID_ETAPA, NOME_ETAPA, ORDEM_FLUXO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA
            WHERE ID_ETAPA = ?
            """,
            [etapa_atual],
        )
        etapa = cursor.fetchone()
        if not etapa:
            raise HTTPException(status_code=400, detail="Etapa atual não encontrada no cadastro de etapas.")

        id_etapa_atual, nome_etapa_atual, ordem_atual = etapa

        cursor.execute(
            """
            SELECT ID_JORNADA
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
            WHERE ID_PROCESSO = ?
              AND ID_ETAPA = ?
              AND STATUS_ETAPA = 'EM_ANDAMENTO'
              AND COALESCE(ATIVO, 'S') = 'S'
            ORDER BY DATA_ENTRADA_ETAPA DESC, ID_JORNADA DESC
            LIMIT 1
            """,
            [id_processo, id_etapa_atual],
        )
        jornada_atual = cursor.fetchone()
        if not jornada_atual:
            raise HTTPException(status_code=400, detail="Não existe jornada em andamento para a etapa atual.")

        id_jornada_atual = jornada_atual[0]

        cursor.execute(
            """
            SELECT ID_ETAPA, NOME_ETAPA, SLA_DIAS
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA
            WHERE ORDEM_FLUXO < ?
            ORDER BY ORDEM_FLUXO DESC, ID_ETAPA DESC
            LIMIT 1
            """,
            [ordem_atual],
        )
        anterior = cursor.fetchone()
        if not anterior:
            raise HTTPException(status_code=400, detail="Não há etapa anterior para retornar - o processo já está na primeira etapa.")

        id_etapa_anterior, nome_etapa_anterior, sla_anterior = anterior
        sla_anterior = int(sla_anterior or 0)

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
               SET STATUS_ETAPA = 'DEVOLVIDO',
                   MOTIVO_RETORNO = ?,
                   DATA_CONCLUSAO_ETAPA = CURRENT_TIMESTAMP,
                   UPDATED_AT = CURRENT_TIMESTAMP,
                   UPDATED_BY = ?
             WHERE ID_JORNADA = ?
            """,
            [payload.motivo, user, id_jornada_atual],
        )

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
            (
                ID_PROCESSO, ID_ETAPA, STATUS_ETAPA, RESPONSAVEL_ATUAL, AREA_RESPONSAVEL,
                DATA_ENTRADA_ETAPA, DATA_PREVISTA_CONCLUSAO, SLA_DIAS,
                FLAG_PENDENCIA, FLAG_DOCUMENTO_PENDENTE, FLAG_BLOQUEADO,
                CREATED_AT, CREATED_BY, ATIVO
            )
            VALUES
            (
                ?, ?, 'EM_ANDAMENTO', ?, 'COMERCIAL',
                CURRENT_TIMESTAMP, ADD_DAYS(CURRENT_DATE, ?), ?,
                'N', 'N', 'N',
                CURRENT_TIMESTAMP, ?, 'S'
            )
            """,
            [id_processo, id_etapa_anterior, user, sla_anterior, sla_anterior, user],
        )

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
               SET ETAPA_ATUAL = ?,
                   STATUS_ATUAL = 'EM_ANDAMENTO'
             WHERE ID_PROCESSO = ?
            """,
            [id_etapa_anterior, id_processo],
        )

        conn.commit()

        return {
            "success": True,
            "id_processo": id_processo,
            "etapaAnterior": nome_etapa_atual,
            "novaEtapa": nome_etapa_anterior,
            "statusProcesso": "EM_ANDAMENTO",
            "mensagem": f"Processo devolvido de {nome_etapa_atual} para {nome_etapa_anterior}."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/cancelar", response_model=dict)
def cancelar_processo(id: int = Path(..., alias="id"), payload: CancelarProcessoRequest = Body(...)):
    """Cancela definitivamente o processo, registrando o motivo."""
    conn = None
    cursor = None
    user = "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT ID_PROCESSO, ETAPA_ATUAL, STATUS_ATUAL
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
            WHERE ID_PROCESSO = ?
            """,
            [id],
        )
        processo = cursor.fetchone()
        if not processo:
            raise HTTPException(status_code=404, detail="Processo não encontrado")

        id_processo, etapa_atual, status_atual = processo

        if status_atual in ("CONCLUIDO", "CONCLUÍDO", "FINALIZADO", "CANCELADO"):
            raise HTTPException(status_code=409, detail="Este processo já está encerrado.")

        if etapa_atual is not None:
            cursor.execute(
                """
                SELECT ID_JORNADA
                FROM CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
                WHERE ID_PROCESSO = ?
                  AND ID_ETAPA = ?
                  AND STATUS_ETAPA = 'EM_ANDAMENTO'
                  AND COALESCE(ATIVO, 'S') = 'S'
                ORDER BY DATA_ENTRADA_ETAPA DESC, ID_JORNADA DESC
                LIMIT 1
                """,
                [id_processo, etapa_atual],
            )
            jornada_atual = cursor.fetchone()
            if jornada_atual:
                cursor.execute(
                    """
                    UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_JORNADA
                       SET STATUS_ETAPA = 'CANCELADO',
                           MOTIVO_RETORNO = ?,
                           DATA_CONCLUSAO_ETAPA = CURRENT_TIMESTAMP,
                           UPDATED_AT = CURRENT_TIMESTAMP,
                           UPDATED_BY = ?
                     WHERE ID_JORNADA = ?
                    """,
                    [payload.motivo, user, jornada_atual[0]],
                )

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
               SET STATUS_ATUAL = 'CANCELADO',
                   DT_CONCLUSAO = CURRENT_TIMESTAMP
             WHERE ID_PROCESSO = ?
            """,
            [id_processo],
        )

        conn.commit()

        return {
            "success": True,
            "id_processo": id_processo,
            "statusProcesso": "CANCELADO",
            "mensagem": "Processo cancelado com sucesso."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/contatos", response_model=dict)
def registrar_contato_processo(id: int = Path(..., alias="id"), payload: ContatoProcessoCreate = Body(...), request: Request = None):
    """Registra um contato feito com o provedor durante a jornada do processo."""
    conn = None
    cursor = None
    user = _usuario_do_request(request)

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        resultado_e_final = (payload.resultado or "").strip().upper() not in ("", "AGUARDANDO")
        data_resultado_sql = "CURRENT_TIMESTAMP" if resultado_e_final else "NULL"

        cursor.execute(
            f"""
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO
            (ID_PROCESSO, DATA_CONTATO, MEIO_CONTATO, PESSOA_CONTATO, OBSERVACAO, RESULTADO, USUARIO_REGISTRO, DATA_REGISTRO, DATA_RESULTADO)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, {data_resultado_sql})
            """,
            [id, payload.data_contato, payload.meio_contato, payload.pessoa_contato, payload.observacao, payload.resultado, user],
        )
        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "mensagem": "Contato registrado com sucesso."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/processos/{id}/contatos", response_model=List[dict])
def listar_contatos_processo(id: int = Path(..., alias="id")):
    """Lista os contatos registrados com o provedor deste processo, mais recente primeiro."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        cursor.execute(
            """
            SELECT
                ID_CONTATO, ID_PROCESSO, DATA_CONTATO, MEIO_CONTATO,
                PESSOA_CONTATO, OBSERVACAO, RESULTADO, USUARIO_REGISTRO, DATA_REGISTRO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO
            WHERE ID_PROCESSO = ?
            ORDER BY DATA_CONTATO DESC, ID_CONTATO DESC
            """,
            [id],
        )
        return _processos_rows_to_dicts(cursor, cursor.fetchall())

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/processos/{id}/contatos/{id_contato}", response_model=dict)
def atualizar_resultado_contato(
    dados: AtualizarResultadoContatoRequest,
    id: int = Path(..., alias="id"),
    id_contato: int = Path(..., alias="id_contato"),
):
    """Atualiza só o resultado de um contato já registrado (ex: 'liguei,
    aguardando retorno' vira 'respondeu' alguns dias depois)."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        cursor.execute(
            """
            SELECT ID_CONTATO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO
            WHERE ID_CONTATO = ? AND ID_PROCESSO = ?
            """,
            [id_contato, id],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Contato não encontrado para este processo.")

        resultado_e_final = (dados.resultado or "").strip().upper() not in ("", "AGUARDANDO")
        data_resultado_sql = "CURRENT_TIMESTAMP" if resultado_e_final else "NULL"

        cursor.execute(
            f"""
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO
               SET RESULTADO = ?, DATA_RESULTADO = {data_resultado_sql}
             WHERE ID_CONTATO = ?
            """,
            [dados.resultado, id_contato],
        )
        conn.commit()

        return {"success": True, "id_contato": id_contato, "resultado": dados.resultado}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/contatos/enviar-email", response_model=dict)
def enviar_email_provedor(id: int = Path(..., alias="id"), payload: EnviarEmailProvedorRequest = Body(...), request: Request = None):
    """Envia um e-mail de verdade para o provedor (via SMTP), listando os
    documentos ativos do processo como links, e registra o envio como um
    contato automaticamente."""
    conn = None
    cursor = None
    user = _usuario_do_request(request)

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT PR.EMAIL
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO P
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_PROVEDOR PR
                ON PR.ID_PROVEDOR = P.ID_PROVEDOR
            WHERE P.ID_PROCESSO = ?
            """,
            [id],
        )
        processo_provedor = cursor.fetchone()
        if not processo_provedor:
            raise HTTPException(status_code=404, detail="Processo não encontrado")

        (email_provedor,) = processo_provedor
        destinatario = (payload.para or email_provedor or "").strip()
        if not destinatario:
            raise HTTPException(status_code=400, detail="Provedor não tem e-mail cadastrado. Informe um destinatário.")

        cursor.execute(
            """
            SELECT NOME_ARQUIVO, CAMINHO_ARQUIVO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO
            WHERE ID_PROCESSO = ?
              AND COALESCE(ATIVO, 'S') = 'S'
            ORDER BY DATA_UPLOAD DESC
            """,
            [id],
        )
        documentos = cursor.fetchall()

        corpo_texto = payload.corpo
        corpo_html = "<p>" + payload.corpo.replace("\n", "<br>") + "</p>"

        if documentos:
            corpo_texto += "\n\nDocumentos do processo:\n" + "\n".join(
                f"- {nome}: {link}" for nome, link in documentos
            )
            itens_html = "".join(
                f'<li><a href="{link}">{nome}</a></li>' for nome, link in documentos
            )
            corpo_html += f"<p>Documentos do processo:</p><ul>{itens_html}</ul>"

        try:
            _enviar_email_smtp(destinatario, payload.assunto, corpo_texto, corpo_html)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao enviar e-mail: {str(e)}")

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_CONTATO_PROCESSO
            (ID_PROCESSO, DATA_CONTATO, MEIO_CONTATO, PESSOA_CONTATO, OBSERVACAO, USUARIO_REGISTRO, DATA_REGISTRO)
            VALUES (?, CURRENT_TIMESTAMP, 'EMAIL', ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            [id, payload.pessoa_contato, f"Assunto: {payload.assunto}\n\n{payload.corpo}", user],
        )
        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "destinatario": destinatario,
            "mensagem": f"E-mail enviado para {destinatario}."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _flag_sim_nao(valor: bool) -> str:
    return "S" if valor else "N"


def _validar_processo_existe(cursor, id_processo: int) -> None:
    cursor.execute(
        """
        SELECT ID_PROCESSO
        FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
        WHERE ID_PROCESSO = ?
        """,
        [id_processo],
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Processo não encontrado.")


@router.post("/api/processos/{id}/analise-cadastral", response_model=dict)
def registrar_analise_cadastral(
    id: int = Path(..., alias="id"),
    payload: AnaliseCadastralCreate = Body(...),
):
    """
    Registra o checklist de análise cadastral preenchido na etapa correspondente.
    """
    conn = None
    cursor = None
    user = payload.usuario_registro or "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_ANALISE_CADASTRAL
            (
                ID_PROCESSO,
                ID_ETAPA,
                DADOS_CONFERIDOS,
                CNPJ_VALIDADO,
                RESPONSAVEL_VALIDADO,
                CONTATO_CONFIRMADO,
                DATA_REGISTRO,
                USUARIO_REGISTRO
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP,
                ?
            )
            """,
            [
                id,
                payload.id_etapa,
                _flag_sim_nao(payload.dados_conferidos),
                _flag_sim_nao(payload.cnpj_validado),
                _flag_sim_nao(payload.responsavel_validado),
                _flag_sim_nao(payload.contato_confirmado),
                user,
            ],
        )

        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "mensagem": "Análise cadastral registrada com sucesso."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/parecer", response_model=dict)
def registrar_parecer(
    id: int = Path(..., alias="id"),
    payload: ParecerCreate = Body(...),
):
    """
    Registra o parecer de aprovação/reprovação da etapa correspondente.
    """
    conn = None
    cursor = None
    user = payload.usuario_registro or "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_PARECER
            (
                ID_PROCESSO,
                ID_ETAPA,
                RESULTADO,
                OBSERVACAO,
                DATA_REGISTRO,
                USUARIO_REGISTRO
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP,
                ?
            )
            """,
            [
                id,
                payload.id_etapa,
                payload.resultado,
                payload.observacao,
                user,
            ],
        )

        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "mensagem": "Parecer registrado com sucesso."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/contratacao", response_model=dict)
def registrar_contratacao(
    id: int = Path(..., alias="id"),
    payload: ContratacaoCreate = Body(...),
):
    """
    Registra os dados de contratação (PN, contrato e link do SharePoint) da etapa correspondente.
    """
    conn = None
    cursor = None
    user = payload.usuario_registro or "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        _validar_processo_existe(cursor, id)

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_CONTRATACAO
            (
                ID_PROCESSO,
                NUMERO_PN,
                NUMERO_CONTRATO,
                DATA_ASSINATURA,
                URL_CONTRATO,
                DATA_REGISTRO,
                USUARIO_REGISTRO
            )
            VALUES
            (
                ?,
                ?,
                ?,
                TO_DATE(?),
                ?,
                CURRENT_TIMESTAMP,
                ?
            )
            """,
            [
                id,
                payload.numero_pn,
                payload.numero_contrato,
                payload.data_assinatura,
                payload.url_contrato,
                user,
            ],
        )

        conn.commit()

        return {
            "success": True,
            "id_processo": id,
            "mensagem": "Dados de contratação registrados com sucesso."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/processos/{id}/documentos", response_model=dict)
def registrar_documento_processo(
    id: int = Path(..., alias="id"),
    payload: DocumentoProcessoCreate = Body(...),
):
    """
    Registra metadados de documentos da Jornada.
    O arquivo é enviado manualmente para o SharePoint e o portal armazena o link no campo CAMINHO_ARQUIVO.
    """
    conn = None
    cursor = None
    user = payload.usuario_upload or "CLB349328"

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT ID_PROCESSO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO
            WHERE ID_PROCESSO = ?
            """,
            [id],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Processo não encontrado.")

        cursor.execute(
            """
            SELECT ID_ETAPA
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA
            WHERE ID_ETAPA = ?
            """,
            [payload.id_etapa],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Etapa não encontrada.")

        if not payload.nome_arquivo or not payload.nome_arquivo.strip():
            raise HTTPException(status_code=400, detail="Nome do arquivo é obrigatório.")

        if not payload.caminho_arquivo or not payload.caminho_arquivo.strip():
            raise HTTPException(status_code=400, detail="Link/Caminho do arquivo é obrigatório.")

        cursor.execute(
            """
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO
            (
                ID_PROCESSO,
                ID_ETAPA,
                NOME_ARQUIVO,
                TIPO_ARQUIVO,
                CAMINHO_ARQUIVO,
                TAMANHO_BYTES,
                DATA_UPLOAD,
                USUARIO_UPLOAD,
                ATIVO,
                TIPO_DOCUMENTO,
                STATUS_DOCUMENTO,
                OBSERVACAO
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP,
                ?,
                'S',
                ?,
                'ENVIADO',
                ?
            )
            """,
            [
                id,
                payload.id_etapa,
                payload.nome_arquivo.strip(),
                payload.tipo_arquivo,
                payload.caminho_arquivo.strip(),
                payload.tamanho_bytes,
                user,
                payload.tipo_documento,
                payload.observacao,
            ],
        )

        cursor.execute(
            """
            SELECT MAX(ID_DOCUMENTO)
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO
            WHERE ID_PROCESSO = ?
              AND ID_ETAPA = ?
              AND NOME_ARQUIVO = ?
              AND CAMINHO_ARQUIVO = ?
            """,
            [id, payload.id_etapa, payload.nome_arquivo.strip(), payload.caminho_arquivo.strip()],
        )
        row = cursor.fetchone()
        id_documento = row[0] if row else None

        conn.commit()

        return {
            "success": True,
            "id_documento": id_documento,
            "id_processo": id,
            "id_etapa": payload.id_etapa,
            "mensagem": "Documento registrado com sucesso."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/processos/{id}/documentos", response_model=List[dict])
def listar_documentos_processo(id: int = Path(..., alias="id")):
    """
    Lista os documentos registrados para um processo.
    """
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                D.ID_DOCUMENTO,
                D.ID_PROCESSO,
                D.ID_ETAPA,
                E.NOME_ETAPA,
                D.TIPO_DOCUMENTO,
                D.NOME_ARQUIVO,
                D.TIPO_ARQUIVO,
                D.CAMINHO_ARQUIVO,
                D.TAMANHO_BYTES,
                D.STATUS_DOCUMENTO,
                D.OBSERVACAO,
                D.DATA_UPLOAD,
                D.USUARIO_UPLOAD,
                D.ATIVO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO D
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA E
                ON E.ID_ETAPA = D.ID_ETAPA
            WHERE D.ID_PROCESSO = ?
              AND COALESCE(D.ATIVO, 'S') = 'S'
            ORDER BY D.DATA_UPLOAD DESC, D.ID_DOCUMENTO DESC
            """,
            [id],
        )
        return _processos_rows_to_dicts(cursor, cursor.fetchall())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/api/documentos/{id}", response_model=dict)
def excluir_documento_processo(id: int = Path(..., alias="id")):
    """
    Exclusão lógica do documento registrado na Jornada.
    Não remove o arquivo do SharePoint; apenas inativa o registro no portal.
    """
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT ID_DOCUMENTO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO
            WHERE ID_DOCUMENTO = ?
              AND COALESCE(ATIVO, 'S') = 'S'
            """,
            [id],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Documento não encontrado.")

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_DOCUMENTO
               SET ATIVO = 'N'
             WHERE ID_DOCUMENTO = ?
            """,
            [id],
        )
        conn.commit()
        return {"success": True, "id_documento": id, "mensagem": "Documento excluído com sucesso."}

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/processos/{id}", response_model=dict)
def obter_processo(id: int = Path(..., alias="id")):
    """Retorna os dados principais do processo para a tela de Gestão da Jornada."""
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                P.ID_PROCESSO,
                P.ID_PROVEDOR,
                P.NUMERO_PROTOCOLO,
                P.TIPO_PROCESSO,
                P.STATUS_ATUAL,
                P.ETAPA_ATUAL,
                E.NOME_ETAPA AS NOME_ETAPA_ATUAL,
                P.MUNICIPIO,
                P.REGIONAL,
                P.PRIORIDADE,
                P.DT_ABERTURA,
                P.DT_PREVISAO_CONCLUSAO,
                P.DT_CONCLUSAO,
                PR.CNPJ,
                PR.RAZAO_SOCIAL,
                PR.NOME_FANTASIA,
                PR.RESPONSAVEL,
                PR.EMAIL,
                PR.TELEFONE
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_PROCESSO P
            INNER JOIN CLB349328.PORTAL_COMPARTILHAMENTO_PROVEDOR PR
                ON PR.ID_PROVEDOR = P.ID_PROVEDOR
            LEFT JOIN CLB349328.PORTAL_COMPARTILHAMENTO_ETAPA E
                ON E.ID_ETAPA = P.ETAPA_ATUAL
            WHERE P.ID_PROCESSO = ?
            """,
            [id],
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Processo não encontrado")
        columns = [col[0] for col in cursor.description]
        return {
            columns[index]: _processos_json_value(value)
            for index, value in enumerate(row)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()




