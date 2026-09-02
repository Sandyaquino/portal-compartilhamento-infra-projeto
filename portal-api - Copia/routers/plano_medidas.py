# -*- coding: utf-8 -*-
"""
Plano de Medidas: desvios de KPI, causa raiz, ação corretiva, responsável,
prazo, status e risco. Endpoints consumidos por
app/(app)/resultados/planodemedidas/page.tsx.
"""
from typing import Any, Optional, List
from decimal import Decimal
from datetime import datetime, date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import main

router = APIRouter()

PM_SCHEMA = "CLB349328"
TB_PLANO_MEDIDAS = f'"{PM_SCHEMA}"."PORTAL_COMPARTILHAMENTO_PLANO_MEDIDAS"'

STATUS_VALIDOS = {"Não iniciado", "Em andamento", "Concluído"}
RISCO_VALIDOS = {"Baixo", "Médio", "Alto"}


def _pm_json_value(value: Any) -> Any:
    """Converte valores SAP HANA para tipos serializáveis em JSON (mesmo
    padrão de _processos_json_value/_auth_json_value nos outros routers)."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _linhas_para_dicts(cursor) -> List[dict]:
    colunas = [col[0] for col in cursor.description]
    return [
        {colunas[index]: _pm_json_value(value) for index, value in enumerate(row)}
        for row in cursor.fetchall()
    ]


def _linha_para_dict(cursor, row) -> Optional[dict]:
    if not row:
        return None
    colunas = [col[0] for col in cursor.description]
    return {colunas[index]: _pm_json_value(value) for index, value in enumerate(row)}


class PlanoMedidaCreate(BaseModel):
    bloco: str
    kpi: str
    mes: str
    desvio_identificado: Optional[float] = None
    causa_raiz: Optional[str] = None
    medida_acao: str
    responsavel: str
    prazo: str
    status: str
    risco: str = "Médio"
    evidencia_link: Optional[str] = None
    comentario_executivo: Optional[str] = None


class PlanoMedidaUpdate(BaseModel):
    bloco: Optional[str] = None
    kpi: Optional[str] = None
    mes: Optional[str] = None
    desvio_identificado: Optional[float] = None
    causa_raiz: Optional[str] = None
    medida_acao: Optional[str] = None
    responsavel: Optional[str] = None
    prazo: Optional[str] = None
    status: Optional[str] = None
    risco: Optional[str] = None
    evidencia_link: Optional[str] = None
    comentario_executivo: Optional[str] = None


@router.get("/api/plano-medidas", response_model=List[dict])
def listar_plano_medidas():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT * FROM {TB_PLANO_MEDIDAS}
            ORDER BY PRAZO ASC, ID DESC
        """)
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/plano-medidas")
def criar_plano_medida(dados: PlanoMedidaCreate):
    bloco = (dados.bloco or "").strip()
    kpi = (dados.kpi or "").strip()
    mes = (dados.mes or "").strip()
    medida_acao = (dados.medida_acao or "").strip()
    responsavel = (dados.responsavel or "").strip()
    status = (dados.status or "").strip()
    risco = (dados.risco or "Médio").strip()

    if not bloco or not kpi or not mes or not medida_acao or not responsavel or not dados.prazo:
        raise HTTPException(
            status_code=400,
            detail="Bloco, KPI, mês, ação, responsável e prazo são obrigatórios",
        )
    if status not in STATUS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Status deve ser um de: {', '.join(sorted(STATUS_VALIDOS))}")
    if risco not in RISCO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Risco deve ser um de: {', '.join(sorted(RISCO_VALIDOS))}")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"""
            INSERT INTO {TB_PLANO_MEDIDAS}
                (BLOCO, KPI, MES, DESVIO_IDENTIFICADO, CAUSA_RAIZ, MEDIDA_ACAO, RESPONSAVEL,
                 PRAZO, STATUS, RISCO, EVIDENCIA_LINK, COMENTARIO_EXECUTIVO, CREATED_AT)
            VALUES (?, ?, ?, ?, ?, ?, ?, TO_DATE(?), ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, [
            bloco, kpi, mes, dados.desvio_identificado, dados.causa_raiz, medida_acao,
            responsavel, dados.prazo, status, risco, dados.evidencia_link, dados.comentario_executivo,
        ])

        # pyhdb/hdbcli não tem cursor.lastrowid - recupera pela identidade da
        # sessão (mesmo padrão de _criar_processo_para_provedor em entrantes.py).
        novo_id = None
        try:
            cursor.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
            resultado_id = cursor.fetchone()
            novo_id = resultado_id[0] if resultado_id else None
        except Exception:
            novo_id = None

        if not novo_id:
            cursor.execute(f"SELECT MAX(ID) FROM {TB_PLANO_MEDIDAS}")
            resultado_id = cursor.fetchone()
            novo_id = resultado_id[0] if resultado_id else None

        conn.commit()

        cursor.execute(f"SELECT * FROM {TB_PLANO_MEDIDAS} WHERE ID = ?", [novo_id])
        item = _linha_para_dict(cursor, cursor.fetchone())

        return {"success": True, "item": item}
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


@router.put("/api/plano-medidas/{id}")
def editar_plano_medida(id: int, dados: PlanoMedidaUpdate):
    campos_map = {
        "bloco": "BLOCO",
        "kpi": "KPI",
        "mes": "MES",
        "desvio_identificado": "DESVIO_IDENTIFICADO",
        "causa_raiz": "CAUSA_RAIZ",
        "medida_acao": "MEDIDA_ACAO",
        "responsavel": "RESPONSAVEL",
        "status": "STATUS",
        "risco": "RISCO",
        "evidencia_link": "EVIDENCIA_LINK",
        "comentario_executivo": "COMENTARIO_EXECUTIVO",
    }

    dados_dict = dados.dict()

    if dados_dict.get("status") is not None and dados_dict["status"] not in STATUS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Status deve ser um de: {', '.join(sorted(STATUS_VALIDOS))}")
    if dados_dict.get("risco") is not None and dados_dict["risco"] not in RISCO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Risco deve ser um de: {', '.join(sorted(RISCO_VALIDOS))}")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"SELECT ID FROM {TB_PLANO_MEDIDAS} WHERE ID = ?", [id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Item não encontrado")

        sets = []
        valores = []

        for campo, coluna in campos_map.items():
            valor = dados_dict.get(campo)
            if valor is not None:
                sets.append(f"{coluna} = ?")
                valores.append(valor)

        if dados_dict.get("prazo") is not None:
            sets.append("PRAZO = TO_DATE(?)")
            valores.append(dados_dict["prazo"])

        if not sets:
            return {"mensagem": "Nada para atualizar"}

        sets.append("UPDATED_AT = CURRENT_TIMESTAMP")
        valores.append(id)

        cursor.execute(f"UPDATE {TB_PLANO_MEDIDAS} SET {', '.join(sets)} WHERE ID = ?", valores)
        conn.commit()

        cursor.execute(f"SELECT * FROM {TB_PLANO_MEDIDAS} WHERE ID = ?", [id])
        item = _linha_para_dict(cursor, cursor.fetchone())

        return {"success": True, "item": item}
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


@router.delete("/api/plano-medidas/{id}")
def excluir_plano_medida(id: int):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"SELECT ID FROM {TB_PLANO_MEDIDAS} WHERE ID = ?", [id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Item não encontrado")

        cursor.execute(f"DELETE FROM {TB_PLANO_MEDIDAS} WHERE ID = ?", [id])
        conn.commit()

        return {"success": True}
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
