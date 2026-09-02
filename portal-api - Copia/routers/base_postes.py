# -*- coding: utf-8 -*-
"""
Base de Postes Coelba (cadastro de ativos).

E a base MESTRE de todo poste da distribuidora - milhoes de linhas. NAO
confundir com PORTAL_COMPARTILHAMENTO_POSTE (subconjunto com ocupacao
mapeada). DDL: sql/PORTAL_COMPARTILHAMENTO_BASE_POSTE.sql.

Estrategia de carga (o mapa NUNCA carrega tudo):
  - navegacao por MUNICIPIO -> LOCALIDADE (fitBounds)
  - pontos individuais so quando a selecao e estreita (uma localidade, ou
    bbox de viewport com area <= LIMITE_AREA_GRAUS2); senao, so densidade
  - teto de LIMITE_PONTOS + flag "truncado"

Caso de uso central: selecionar postes SEM PROVEDOR numa area e gerar uma
acao de FISCALIZACAO.

Consumido por app/(app)/mapa-postes/base/page.tsx.
"""
from typing import Any, Optional, List
from datetime import datetime, date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, Body

import main
from routers.postes import inserir_acao_poste

router = APIRouter()

SCHEMA = "CLB349328"
TB_BASE = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_BASE_POSTE"
TB_OCUPACAO = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO"
TB_OPERADORA = f"{SCHEMA}.PORTAL_COMPARTILHAMENTO_OPERADORA"

LIMITE_PONTOS = 2000
LIMITE_AREA_GRAUS2 = 0.02
VINCULOS = {"todos", "sem_provedor", "com_provedor"}

# Sub-select que marca se o barramento tem provedor resolvido.
_TEM_PROVEDOR = f"""
    CASE WHEN EXISTS (
        SELECT 1 FROM {TB_OCUPACAO} O
        WHERE O.BARRAMENTO = BP.DE_BARRAMENTO AND O.ID_OPERADORA IS NOT NULL
    ) THEN 'S' ELSE 'N' END
"""


def _num(valor: Any) -> Any:
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return valor


def _garantir_tabela_base_poste(cursor) -> None:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_BASE}")
        cursor.fetchone()
        return
    except Exception:
        pass
    cursor.execute(
        f"""
        CREATE COLUMN TABLE {TB_BASE}
        (
            NU_PG_ID BIGINT NOT NULL,
            NU_LOCALIDADE_ID BIGINT,
            LOCALIDADE NVARCHAR(120),
            DE_BARRAMENTO NVARCHAR(50),
            MUNICIPIO NVARCHAR(120),
            UF NVARCHAR(2) DEFAULT 'BA',
            NU_LATITUDE DECIMAL(18,10),
            NU_LONGITUDE DECIMAL(18,10),
            DATA_ATUALIZACAO LONGDATE CS_LONGDATE,
            CARGA_ID NVARCHAR(40),
            ATIVO NVARCHAR(1) DEFAULT 'S',
            PRIMARY KEY (NU_PG_ID)
        )
        UNLOAD PRIORITY 5 AUTO MERGE
        """
    )


def _filtro_vinculo(vinculo: str) -> str:
    if vinculo == "sem_provedor":
        return f" AND {_TEM_PROVEDOR} = 'N'"
    if vinculo == "com_provedor":
        return f" AND {_TEM_PROVEDOR} = 'S'"
    return ""


@router.get("/api/base-postes/resumo", response_model=dict)
def resumo_base_postes():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela_base_poste(cursor)
        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS TOTAL,
                SUM(CASE WHEN {_TEM_PROVEDOR} = 'S' THEN 1 ELSE 0 END) AS COM_PROVEDOR,
                COUNT(DISTINCT MUNICIPIO) AS MUNICIPIOS,
                COUNT(DISTINCT NU_LOCALIDADE_ID) AS LOCALIDADES,
                MAX(DATA_ATUALIZACAO) AS DATA_MAX
            FROM {TB_BASE} BP
            WHERE ATIVO = 'S'
            """
        )
        total, com_provedor, municipios, localidades, data_max = cursor.fetchone()
        total = int(total or 0)
        com_provedor = int(com_provedor or 0)
        return {
            "total": total,
            "com_provedor": com_provedor,
            "sem_provedor": total - com_provedor,
            "municipios": int(municipios or 0),
            "localidades": int(localidades or 0),
            "data_atualizacao_max": _num(data_max),
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/base-postes/municipios", response_model=List[dict])
def municipios_base_postes():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela_base_poste(cursor)
        cursor.execute(
            f"""
            SELECT
                MUNICIPIO,
                COUNT(*) AS TOTAL,
                SUM(CASE WHEN {_TEM_PROVEDOR} = 'N' THEN 1 ELSE 0 END) AS SEM_PROVEDOR,
                MIN(NU_LONGITUDE) AS MIN_X, MAX(NU_LONGITUDE) AS MAX_X,
                MIN(NU_LATITUDE)  AS MIN_Y, MAX(NU_LATITUDE)  AS MAX_Y
            FROM {TB_BASE} BP
            WHERE ATIVO = 'S'
            GROUP BY MUNICIPIO
            ORDER BY TOTAL DESC
            """
        )
        linhas = []
        for mun, total, sem_prov, min_x, max_x, min_y, max_y in cursor.fetchall():
            linhas.append(
                {
                    "MUNICIPIO": mun,
                    "TOTAL": int(total or 0),
                    "SEM_PROVEDOR": int(sem_prov or 0),
                    "bounds": {
                        "min_x": _num(min_x), "max_x": _num(max_x),
                        "min_y": _num(min_y), "max_y": _num(max_y),
                    },
                }
            )
        return linhas
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/base-postes/localidades", response_model=List[dict])
def localidades_base_postes(municipio: Optional[str] = Query(None)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela_base_poste(cursor)
        sql = f"""
            SELECT
                NU_LOCALIDADE_ID, MAX(LOCALIDADE) AS LOCALIDADE, MAX(MUNICIPIO) AS MUNICIPIO,
                COUNT(*) AS TOTAL,
                SUM(CASE WHEN {_TEM_PROVEDOR} = 'N' THEN 1 ELSE 0 END) AS SEM_PROVEDOR,
                MIN(NU_LONGITUDE) AS MIN_X, MAX(NU_LONGITUDE) AS MAX_X,
                MIN(NU_LATITUDE)  AS MIN_Y, MAX(NU_LATITUDE)  AS MAX_Y
            FROM {TB_BASE} BP
            WHERE ATIVO = 'S'
        """
        params: List[Any] = []
        if municipio:
            sql += " AND UPPER(MUNICIPIO) = UPPER(?)"
            params.append(municipio)
        sql += " GROUP BY NU_LOCALIDADE_ID ORDER BY LOCALIDADE ASC"
        cursor.execute(sql, params)
        linhas = []
        for loc_id, loc, mun, total, sem_prov, min_x, max_x, min_y, max_y in cursor.fetchall():
            linhas.append(
                {
                    "NU_LOCALIDADE_ID": int(loc_id) if loc_id is not None else None,
                    "LOCALIDADE": loc,
                    "MUNICIPIO": mun,
                    "TOTAL": int(total or 0),
                    "SEM_PROVEDOR": int(sem_prov or 0),
                    "bounds": {
                        "min_x": _num(min_x), "max_x": _num(max_x),
                        "min_y": _num(min_y), "max_y": _num(max_y),
                    },
                }
            )
        return linhas
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/base-postes/mapa", response_model=dict)
def mapa_base_postes(
    min_x: Optional[float] = Query(None),
    max_x: Optional[float] = Query(None),
    min_y: Optional[float] = Query(None),
    max_y: Optional[float] = Query(None),
    municipio: Optional[str] = Query(None),
    localidade: Optional[int] = Query(None),
    vinculo: str = Query("todos"),
    limite: int = Query(LIMITE_PONTOS),
):
    if vinculo not in VINCULOS:
        raise HTTPException(status_code=400, detail=f"vinculo deve ser um de: {', '.join(sorted(VINCULOS))}")
    limite = min(LIMITE_PONTOS, max(1, limite))
    tem_bbox = None not in (min_x, max_x, min_y, max_y)
    area = (max_x - min_x) * (max_y - min_y) if tem_bbox else float("inf")
    estreito = bool(localidade) or area <= LIMITE_AREA_GRAUS2

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela_base_poste(cursor)

        where = " WHERE BP.ATIVO = 'S'"
        params: List[Any] = []
        if localidade:
            where += " AND BP.NU_LOCALIDADE_ID = ?"
            params.append(localidade)
        elif municipio:
            where += " AND UPPER(BP.MUNICIPIO) = UPPER(?)"
            params.append(municipio)
        if tem_bbox:
            where += " AND BP.NU_LONGITUDE BETWEEN ? AND ? AND BP.NU_LATITUDE BETWEEN ? AND ?"
            params += [min_x, max_x, min_y, max_y]
        where += _filtro_vinculo(vinculo)

        cursor.execute(f"SELECT COUNT(*) FROM {TB_BASE} BP{where}", params)
        total_na_selecao = int(cursor.fetchone()[0] or 0)

        if not estreito:
            return {"postes": [], "truncado": False, "agregar": True, "total_na_selecao": total_na_selecao}

        cursor.execute(
            f"""
            SELECT BP.NU_PG_ID, BP.NU_LOCALIDADE_ID, BP.LOCALIDADE, BP.DE_BARRAMENTO,
                   BP.MUNICIPIO, BP.UF, BP.NU_LATITUDE, BP.NU_LONGITUDE, BP.DATA_ATUALIZACAO,
                   {_TEM_PROVEDOR} AS TEM_PROVEDOR
            FROM {TB_BASE} BP{where}
            LIMIT {limite + 1}
            """,
            params,
        )
        linhas = cursor.fetchall()
        truncado = len(linhas) > limite
        linhas = linhas[:limite]

        # Provedores alocados por poste (uma consulta so, para todos os
        # barramentos do resultado).
        barramentos = sorted({r[3] for r in linhas if r[3]})
        provedores_por_barramento: dict = {}
        if barramentos:
            marcadores = ",".join(["?"] * len(barramentos))
            cursor.execute(
                f"""
                SELECT DISTINCT O.BARRAMENTO, OP.RAZAO_SOCIAL, OP.CNPJ
                FROM {TB_OCUPACAO} O
                JOIN {TB_OPERADORA} OP ON OP.ID = O.ID_OPERADORA
                WHERE O.ID_OPERADORA IS NOT NULL AND O.BARRAMENTO IN ({marcadores})
                """,
                barramentos,
            )
            for barramento, razao, cnpj in cursor.fetchall():
                provedores_por_barramento.setdefault(barramento, []).append(
                    {"RAZAO_SOCIAL": razao, "CNPJ": cnpj}
                )

        postes = []
        for r in linhas:
            provedores = provedores_por_barramento.get(r[3], [])
            postes.append(
                {
                    "NU_PG_ID": int(r[0]) if r[0] is not None else None,
                    "NU_LOCALIDADE_ID": int(r[1]) if r[1] is not None else None,
                    "LOCALIDADE": r[2],
                    "DE_BARRAMENTO": r[3],
                    "MUNICIPIO": r[4],
                    "UF": r[5],
                    "NU_LATITUDE": _num(r[6]),
                    "NU_LONGITUDE": _num(r[7]),
                    "DATA_ATUALIZACAO": _num(r[8]),
                    "TEM_PROVEDOR": "S" if provedores else "N",
                    "PROVEDORES": provedores,
                }
            )
        return {"postes": postes, "truncado": truncado, "agregar": False, "total_na_selecao": total_na_selecao}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/base-postes/densidade", response_model=dict)
def densidade_base_postes(
    min_x: float = Query(...),
    max_x: float = Query(...),
    min_y: float = Query(...),
    max_y: float = Query(...),
    municipio: Optional[str] = Query(None),
    vinculo: str = Query("todos"),
    grade: int = Query(24),
):
    if vinculo not in VINCULOS:
        raise HTTPException(status_code=400, detail=f"vinculo deve ser um de: {', '.join(sorted(VINCULOS))}")
    if max_x <= min_x or max_y <= min_y:
        raise HTTPException(status_code=400, detail="bounds inválidos")
    grade = min(60, max(4, grade))
    largura = (max_x - min_x) / grade
    altura = (max_y - min_y) / grade

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela_base_poste(cursor)

        where = " WHERE BP.ATIVO = 'S' AND BP.NU_LONGITUDE BETWEEN ? AND ? AND BP.NU_LATITUDE BETWEEN ? AND ?"
        params: List[Any] = [min_x, max_x, min_y, max_y]
        if municipio:
            where += " AND UPPER(BP.MUNICIPIO) = UPPER(?)"
            params.append(municipio)
        where += _filtro_vinculo(vinculo)

        cursor.execute(
            f"""
            SELECT
                LEAST({grade - 1}, FLOOR((BP.NU_LONGITUDE - ?) / ?)) AS CX,
                LEAST({grade - 1}, FLOOR((BP.NU_LATITUDE - ?) / ?)) AS CY,
                COUNT(*) AS QTD
            FROM {TB_BASE} BP{where}
            GROUP BY LEAST({grade - 1}, FLOOR((BP.NU_LONGITUDE - ?) / ?)),
                     LEAST({grade - 1}, FLOOR((BP.NU_LATITUDE - ?) / ?))
            """,
            [min_x, largura, min_y, altura] + params + [min_x, largura, min_y, altura],
        )
        celulas = []
        maior_qtd = 0
        for cx, cy, qtd in cursor.fetchall():
            qtd = int(qtd)
            maior_qtd = max(maior_qtd, qtd)
            cx = int(cx)
            cy = int(cy)
            celulas.append(
                {
                    "min_x": min_x + cx * largura,
                    "max_x": min_x + (cx + 1) * largura,
                    "min_y": min_y + cy * altura,
                    "max_y": min_y + (cy + 1) * altura,
                    "qtd": qtd,
                }
            )
        return {"celulas": celulas, "maior_qtd": maior_qtd}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/base-postes/fiscalizacao", response_model=dict)
def gerar_fiscalizacao_base(payload: dict = Body(...)):
    """Coleta os postes SEM PROVEDOR da seleção (bbox / localidade / município /
    lista de barramentos) e cria uma ação de FISCALIZACAO no Mapa de Postes."""
    b = payload.get("bounds") or {}
    localidade = payload.get("localidade")
    municipio = payload.get("municipio")
    barramentos_alvo = payload.get("barramentos") or []

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela_base_poste(cursor)

        where = f" WHERE BP.ATIVO = 'S' AND {_TEM_PROVEDOR} = 'N'"
        params: List[Any] = []
        if localidade:
            where += " AND BP.NU_LOCALIDADE_ID = ?"
            params.append(int(localidade))
        elif municipio:
            where += " AND UPPER(BP.MUNICIPIO) = UPPER(?)"
            params.append(municipio)
        if all(isinstance(b.get(k), (int, float)) for k in ("min_x", "max_x", "min_y", "max_y")):
            where += " AND BP.NU_LONGITUDE BETWEEN ? AND ? AND BP.NU_LATITUDE BETWEEN ? AND ?"
            params += [b["min_x"], b["max_x"], b["min_y"], b["max_y"]]
        if barramentos_alvo:
            marcadores = ",".join(["?"] * len(barramentos_alvo))
            where += f" AND BP.DE_BARRAMENTO IN ({marcadores})"
            params += list(barramentos_alvo)

        cursor.execute(f"SELECT DISTINCT BP.DE_BARRAMENTO FROM {TB_BASE} BP{where}", params)
        barramentos = [r[0] for r in cursor.fetchall() if r[0]]
        if not barramentos:
            raise HTTPException(status_code=400, detail="Nenhum poste sem provedor na seleção")

        bounds = b if b else None
        titulo = payload.get("titulo") or (
            f"Fiscalização - postes sem provedor" + (f" ({municipio})" if municipio else "")
        )
        id_acao = inserir_acao_poste(
            cursor,
            tipo="FISCALIZACAO",
            titulo=titulo,
            responsavel=payload.get("responsavel"),
            prazo=payload.get("prazo"),
            barramentos=barramentos,
            bounds=bounds,
            observacao=payload.get("observacao")
            or f"Gerada da Base de Postes: {len(barramentos)} poste(s) sem provedor associado.",
            criado_por=payload.get("criado_por"),
        )
        conn.commit()
        return {"success": True, "id_acao": id_acao, "qtd_postes": len(barramentos)}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao gerar fiscalização: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
