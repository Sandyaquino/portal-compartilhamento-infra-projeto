# -*- coding: utf-8 -*-
"""
Acompanhamento Mensal de KPIs (Meta x Realizado, semáforo automático).
Endpoints consumidos por app/(app)/resultados/kpismensal/page.tsx.
"""
from typing import Any, Optional, List
from decimal import Decimal
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import main

router = APIRouter()

KM_SCHEMA = "CLB349328"
TB_KPI = f'"{KM_SCHEMA}"."PORTAL_COMPARTILHAMENTO_KPI_CADASTRO"'
TB_LANCAMENTO = f'"{KM_SCHEMA}"."PORTAL_COMPARTILHAMENTO_KPI_LANCAMENTO"'

MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
TIPOS_VALIDOS = {"Maior melhor", "Menor melhor"}


def _km_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _linhas_para_dicts(cursor) -> List[dict]:
    colunas = [col[0] for col in cursor.description]
    return [
        {colunas[index]: _km_json_value(value) for index, value in enumerate(row)}
        for row in cursor.fetchall()
    ]


def calcular_status(tipo: str, meta: Optional[float], realizado: Optional[float]):
    """Regra de semáforo - nunca é digitada pelo usuário, sempre recalculada
    aqui a partir de meta/realizado, pra nunca ficar dessincronizada."""
    if realizado is None or meta is None:
        return None, None, None

    desvio = realizado - meta
    percentual = (desvio / meta) if meta else None
    referencia = percentual if percentual is not None else 0.0

    if tipo == "Maior melhor":
        if realizado >= meta:
            status = "verde"
        elif referencia >= -0.05:
            status = "amarelo"
        else:
            status = "vermelho"
    else:  # "Menor melhor"
        if realizado <= meta:
            status = "verde"
        elif referencia <= 0.05:
            status = "amarelo"
        else:
            status = "vermelho"

    return desvio, percentual, status


class KpiCreate(BaseModel):
    bloco: str
    kpi: str
    unidade: str
    tipo: str


class LancamentoUpdate(BaseModel):
    kpi_id: int
    mes: str
    meta: float
    realizado: Optional[float] = None
    observacao: Optional[str] = None


@router.get("/api/kpis-mensal/kpis", response_model=List[dict])
def listar_kpis():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {TB_KPI} ORDER BY BLOCO, KPI")
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/kpis-mensal/kpis")
def criar_kpi(dados: KpiCreate):
    bloco = (dados.bloco or "").strip()
    kpi = (dados.kpi or "").strip()
    unidade = (dados.unidade or "").strip()
    tipo = (dados.tipo or "").strip()

    if not bloco or not kpi or not unidade or not tipo:
        raise HTTPException(status_code=400, detail="Bloco, KPI, unidade e tipo são obrigatórios")
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo deve ser um de: {', '.join(sorted(TIPOS_VALIDOS))}")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"""
            INSERT INTO {TB_KPI} (BLOCO, KPI, UNIDADE, TIPO, CREATED_AT)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, [bloco, kpi, unidade, tipo])

        # pyhdb/hdbcli não tem cursor.lastrowid - mesmo padrão já usado em
        # routers/entrantes.py e routers/plano_medidas.py.
        novo_id = None
        try:
            cursor.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
            resultado_id = cursor.fetchone()
            novo_id = resultado_id[0] if resultado_id else None
        except Exception:
            novo_id = None

        if not novo_id:
            cursor.execute(f"SELECT MAX(ID) FROM {TB_KPI}")
            resultado_id = cursor.fetchone()
            novo_id = resultado_id[0] if resultado_id else None

        # A tabela mensal já nasce completa: 12 lançamentos em branco
        # (META=0, REALIZADO=NULL), editáveis inline na hora.
        for mes in MESES:
            cursor.execute(f"""
                INSERT INTO {TB_LANCAMENTO} (KPI_ID, MES, META, REALIZADO, CREATED_AT)
                VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP)
            """, [novo_id, mes])

        conn.commit()

        cursor.execute(f"SELECT * FROM {TB_KPI} WHERE ID = ?", [novo_id])
        itens = _linhas_para_dicts(cursor)

        return {"success": True, "item": itens[0] if itens else None}
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


@router.get("/api/kpis-mensal/lancamentos", response_model=List[dict])
def listar_lancamentos(kpi_id: int = Query(...)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"SELECT TIPO FROM {TB_KPI} WHERE ID = ?", [kpi_id])
        kpi_row = cursor.fetchone()
        if not kpi_row:
            raise HTTPException(status_code=404, detail="KPI não encontrado")
        tipo = kpi_row[0]

        cursor.execute(f"SELECT * FROM {TB_LANCAMENTO} WHERE KPI_ID = ?", [kpi_id])
        itens = _linhas_para_dicts(cursor)

        ordem = {mes: indice for indice, mes in enumerate(MESES)}
        itens.sort(key=lambda item: ordem.get(item.get("MES"), 99))

        for item in itens:
            desvio, percentual, status = calcular_status(tipo, item.get("META"), item.get("REALIZADO"))
            item["DESVIO"] = desvio
            item["PERCENTUAL_DESVIO"] = percentual
            item["STATUS"] = status

        return itens
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/api/kpis-mensal/lancamentos")
def atualizar_lancamento(dados: LancamentoUpdate):
    if dados.mes not in MESES:
        raise HTTPException(status_code=400, detail=f"Mês deve ser um de: {', '.join(MESES)}")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"SELECT TIPO FROM {TB_KPI} WHERE ID = ?", [dados.kpi_id])
        kpi_row = cursor.fetchone()
        if not kpi_row:
            raise HTTPException(status_code=404, detail="KPI não encontrado")
        tipo = kpi_row[0]

        cursor.execute(
            f"SELECT ID FROM {TB_LANCAMENTO} WHERE KPI_ID = ? AND MES = ?",
            [dados.kpi_id, dados.mes],
        )
        lancamento_row = cursor.fetchone()
        if not lancamento_row:
            raise HTTPException(status_code=404, detail="Lançamento não encontrado para este KPI/mês")

        cursor.execute(f"""
            UPDATE {TB_LANCAMENTO}
               SET META = ?, REALIZADO = ?, OBSERVACAO = ?, UPDATED_AT = CURRENT_TIMESTAMP
             WHERE ID = ?
        """, [dados.meta, dados.realizado, dados.observacao, lancamento_row[0]])
        conn.commit()

        desvio, percentual, status = calcular_status(tipo, dados.meta, dados.realizado)

        return {
            "success": True,
            "item": {
                "KPI_ID": dados.kpi_id,
                "MES": dados.mes,
                "META": dados.meta,
                "REALIZADO": dados.realizado,
                "OBSERVACAO": dados.observacao,
                "DESVIO": desvio,
                "PERCENTUAL_DESVIO": percentual,
                "STATUS": status,
            },
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


@router.get("/api/kpis-mensal/visao-geral", response_model=List[dict])
def visao_geral():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"SELECT * FROM {TB_KPI} ORDER BY BLOCO, KPI")
        kpis = _linhas_para_dicts(cursor)

        cursor.execute(f"SELECT * FROM {TB_LANCAMENTO}")
        lancamentos = _linhas_para_dicts(cursor)

        por_kpi: dict = {}
        for lancamento in lancamentos:
            por_kpi.setdefault(lancamento["KPI_ID"], []).append(lancamento)

        ordem = {mes: indice for indice, mes in enumerate(MESES)}

        resultado = []
        for kpi in kpis:
            meses_kpi = por_kpi.get(kpi["ID"], [])
            meses_kpi.sort(key=lambda item: ordem.get(item.get("MES"), 99))

            meses_calculados = []
            for lancamento in meses_kpi:
                desvio, percentual, status = calcular_status(
                    kpi["TIPO"], lancamento.get("META"), lancamento.get("REALIZADO")
                )
                meses_calculados.append({
                    "MES": lancamento["MES"],
                    "META": lancamento.get("META"),
                    "REALIZADO": lancamento.get("REALIZADO"),
                    "STATUS": status,
                })

            resultado.append({**kpi, "MESES": meses_calculados})

        return resultado
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
