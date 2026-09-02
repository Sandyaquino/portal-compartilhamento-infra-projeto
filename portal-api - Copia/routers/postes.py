# -*- coding: utf-8 -*-
"""
Mapa de Postes/Ocupações (Uso Compartilhado).
Endpoints consumidos por app/(app)/mapa-postes/page.tsx.
"""
from typing import Any, Optional, List
from decimal import Decimal
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import main

router = APIRouter()

SCHEMA = "CLB349328"
TB_POSTE = f'{SCHEMA}."PORTAL_COMPARTILHAMENTO_POSTE"'
TB_OPERADORA = f'{SCHEMA}."PORTAL_COMPARTILHAMENTO_OPERADORA"'
TB_OCUPACAO = f'{SCHEMA}."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO"'
TB_ACAO = f'{SCHEMA}."PORTAL_COMPARTILHAMENTO_ACAO_POSTE"'
TB_ACAO_ITEM = f'{SCHEMA}."PORTAL_COMPARTILHAMENTO_ACAO_POSTE_ITEM"'

LIMITE_PONTOS_MAPA = 3000
STATUS_VALIDOS = {"identificado", "nao_identificado"}
TIPOS_ACAO_VALIDOS = {"FISCALIZACAO", "ORDENAMENTO", "REMOCAO"}
STATUS_ACAO_VALIDOS = {"ABERTA", "CONCLUIDA", "CANCELADA"}


def _postes_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _linhas_para_dicts(cursor) -> List[dict]:
    colunas = [col[0] for col in cursor.description]
    return [
        {colunas[index]: _postes_json_value(value) for index, value in enumerate(row)}
        for row in cursor.fetchall()
    ]


@router.get("/api/postes/mapa", response_model=dict)
def listar_postes_mapa(
    min_x: float = Query(...),
    max_x: float = Query(...),
    min_y: float = Query(...),
    max_y: float = Query(...),
    id_operadora: List[int] = Query([]),
    status: Optional[str] = Query(None),
):
    """Postes dentro da caixa delimitadora do viewport atual do mapa,
    limitado a LIMITE_PONTOS_MAPA registros - o front avisa o usuario pra
    dar zoom quando `truncado` vier True, em vez de cortar silenciosamente."""
    if status is not None and status not in STATUS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"status deve ser um de: {', '.join(sorted(STATUS_VALIDOS))}")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        sql = f"""
            SELECT P."BARRAMENTO", P."X", P."Y",
                COALESCE(P."CAPACIDADE", 5) AS "CAPACIDADE",
                (
                    SELECT COUNT(*) FROM {TB_OCUPACAO} O2
                    WHERE O2."BARRAMENTO" = P."BARRAMENTO"
                ) AS "PONTOS_OCUPADOS",
                CASE WHEN EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ORGANIZATION_NAME" IS NOT NULL
                ) THEN 'S' ELSE 'N' END AS "TEM_OCUPACAO_IDENTIFICADA"
            FROM {TB_POSTE} P
            WHERE P."X" BETWEEN ? AND ? AND P."Y" BETWEEN ? AND ?
        """
        params: List[Any] = [min_x, max_x, min_y, max_y]

        if id_operadora:
            placeholders = ",".join(["?"] * len(id_operadora))
            sql += f"""
                AND EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ID_OPERADORA" IN ({placeholders})
                )
            """
            params.extend(id_operadora)

        if status == "identificado":
            sql += f"""
                AND EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ORGANIZATION_NAME" IS NOT NULL
                )
            """
        elif status == "nao_identificado":
            sql += f"""
                AND EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ORGANIZATION_NAME" IS NULL
                )
            """

        sql += f" LIMIT {LIMITE_PONTOS_MAPA + 1}"

        cursor.execute(sql, params)
        linhas = _linhas_para_dicts(cursor)

        truncado = len(linhas) > LIMITE_PONTOS_MAPA
        if truncado:
            linhas = linhas[:LIMITE_PONTOS_MAPA]

        return {"postes": linhas, "truncado": truncado}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/postes/{barramento}/ocupacoes", response_model=List[dict])
def listar_ocupacoes_poste(barramento: str):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT 1 FROM {TB_POSTE} WHERE "BARRAMENTO" = ?', [barramento])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Poste não encontrado")

        cursor.execute(
            f"""
            SELECT O."ID", O."BOARD_NAME", O."ORGANIZATION_NAME", OP."CNPJ", OP."RAZAO_SOCIAL"
            FROM {TB_OCUPACAO} O
            LEFT JOIN {TB_OPERADORA} OP ON OP."ID" = O."ID_OPERADORA"
            WHERE O."BARRAMENTO" = ?
            ORDER BY O."BOARD_NAME"
            """,
            [barramento],
        )
        return _linhas_para_dicts(cursor)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/postes/operadoras", response_model=List[dict])
def listar_operadoras():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT OP."ID", OP."RAZAO_SOCIAL", OP."CNPJ", COUNT(O."ID") AS "TOTAL_OCUPACOES"
            FROM {TB_OPERADORA} OP
            LEFT JOIN {TB_OCUPACAO} O ON O."ID_OPERADORA" = OP."ID"
            GROUP BY OP."ID", OP."RAZAO_SOCIAL", OP."CNPJ"
            ORDER BY OP."RAZAO_SOCIAL"
            """
        )
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/postes/resumo", response_model=dict)
def obter_resumo_postes():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f"SELECT COUNT(*) FROM {TB_POSTE}")
        total_postes = cursor.fetchone()[0] or 0

        cursor.execute(f"SELECT COUNT(*) FROM {TB_OCUPACAO}")
        total_ocupacoes = cursor.fetchone()[0] or 0

        cursor.execute(
            f'SELECT COUNT(DISTINCT "BARRAMENTO") FROM {TB_OCUPACAO} WHERE "ORGANIZATION_NAME" IS NOT NULL'
        )
        postes_identificados = cursor.fetchone()[0] or 0

        percentual_identificado = round((postes_identificados / total_postes) * 100, 1) if total_postes > 0 else 0

        # Saturação: compara os pontos ocupados (COUNT de ocupações por
        # barramento) com a CAPACIDADE do poste (default 5). Um único passo
        # cobre esgotados (ocupados >= capacidade) e sobrecarga (ocupados >
        # capacidade); postes sem nenhuma ocupação ficam de fora.
        cursor.execute(f"""
            SELECT
                COUNT(CASE WHEN T.QTD >= T.CAP THEN 1 END) AS ESGOTADOS,
                COUNT(CASE WHEN T.QTD >  T.CAP THEN 1 END) AS SOBRECARGA
            FROM (
                SELECT COALESCE(P."CAPACIDADE", 5) AS CAP,
                       COALESCE(OCC.QTD, 0) AS QTD
                FROM {TB_POSTE} P
                LEFT JOIN (
                    SELECT "BARRAMENTO", COUNT(*) AS QTD
                    FROM {TB_OCUPACAO}
                    GROUP BY "BARRAMENTO"
                ) OCC ON OCC."BARRAMENTO" = P."BARRAMENTO"
            ) T
            WHERE T.QTD > 0
        """)
        linha_saturacao = cursor.fetchone()
        postes_esgotados = (linha_saturacao[0] if linha_saturacao else 0) or 0
        postes_sobrecarga = (linha_saturacao[1] if linha_saturacao else 0) or 0

        return {
            "total_postes": total_postes,
            "total_ocupacoes": total_ocupacoes,
            "postes_identificados": postes_identificados,
            "percentual_identificado": percentual_identificado,
            "postes_esgotados": postes_esgotados,
            "postes_sobrecarga": postes_sobrecarga,
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# =====================================================
# Densidade (grade agregada, pra overlay de calor no mapa) - agrega em
# celulas de uma grade em vez de mandar ponto a ponto, pra nao depender de
# nenhuma fonte GeoJSON no cliente (o worker do maplibre-gl trava com fontes
# GeoJSON neste projeto - ver components/mapa-postes/mapa-maplibre.tsx).
# =====================================================

@router.get("/api/postes/densidade", response_model=dict)
def obter_densidade_postes(
    min_x: float = Query(...),
    max_x: float = Query(...),
    min_y: float = Query(...),
    max_y: float = Query(...),
    grade: int = Query(24, ge=4, le=60),
    id_operadora: List[int] = Query([]),
    status: Optional[str] = Query(None),
):
    if status is not None and status not in STATUS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"status deve ser um de: {', '.join(sorted(STATUS_VALIDOS))}")
    if max_x <= min_x or max_y <= min_y:
        raise HTTPException(status_code=400, detail="bounds inválidos")

    largura_celula = (max_x - min_x) / grade
    altura_celula = (max_y - min_y) / grade

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        filtro_extra = ""
        params_extra: List[Any] = []

        if id_operadora:
            placeholders = ",".join(["?"] * len(id_operadora))
            filtro_extra += f"""
                AND EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ID_OPERADORA" IN ({placeholders})
                )
            """
            params_extra.extend(id_operadora)

        if status == "identificado":
            filtro_extra += f"""
                AND EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ORGANIZATION_NAME" IS NOT NULL
                )
            """
        elif status == "nao_identificado":
            filtro_extra += f"""
                AND EXISTS (
                    SELECT 1 FROM {TB_OCUPACAO} O
                    WHERE O."BARRAMENTO" = P."BARRAMENTO" AND O."ORGANIZATION_NAME" IS NULL
                )
            """

        # Agrega numa subquery (derived table) e agrupa pelo nome da coluna
        # na consulta externa - o HANA nao aceita GROUP BY por posição (1, 2)
        # nem repetir a expressão FLOOR(...) parametrizada em dois lugares
        # (nao reconhece as duas como equivalentes so pelo texto).
        sql = f"""
            SELECT CELULA_X, CELULA_Y, COUNT(*) AS QTD
            FROM (
                SELECT
                    FLOOR((P."X" - ?) / ?) AS CELULA_X,
                    FLOOR((P."Y" - ?) / ?) AS CELULA_Y
                FROM {TB_POSTE} P
                WHERE P."X" BETWEEN ? AND ? AND P."Y" BETWEEN ? AND ?
                {filtro_extra}
            ) SUB
            GROUP BY CELULA_X, CELULA_Y
        """
        params: List[Any] = [min_x, largura_celula, min_y, altura_celula, min_x, max_x, min_y, max_y, *params_extra]

        cursor.execute(sql, params)

        celulas = []
        maior_qtd = 0
        for celula_x, celula_y, qtd in cursor.fetchall():
            qtd = int(qtd)
            maior_qtd = max(maior_qtd, qtd)
            celulas.append(
                {
                    "min_x": min_x + celula_x * largura_celula,
                    "max_x": min_x + (celula_x + 1) * largura_celula,
                    "min_y": min_y + celula_y * altura_celula,
                    "max_y": min_y + (celula_y + 1) * altura_celula,
                    "qtd": qtd,
                }
            )

        return {"celulas": celulas, "maior_qtd": maior_qtd}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# =====================================================
# Ações do Mapa (Fiscalização / Ordenamento) - criadas a partir de um poste
# individual (card de detalhe) ou de uma seleção de área no mapa. A lista de
# postes de uma ação é resolvida no cliente (respeitando os filtros de
# status/operadora já aplicados) e enviada pronta - o backend só grava.
# =====================================================

def _acoes_garantir_tabelas(cursor) -> None:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_ACAO}")
        cursor.fetchone()
    except Exception:
        cursor.execute(f"""
            CREATE COLUMN TABLE {TB_ACAO}
            (
                "ID_ACAO" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "TIPO" NVARCHAR(20) NOT NULL,
                "TITULO" NVARCHAR(200),
                "RESPONSAVEL" NVARCHAR(50),
                "PRAZO" DATE,
                "STATUS" NVARCHAR(20) DEFAULT 'ABERTA',
                "QTD_POSTES" INTEGER DEFAULT 0,
                "MIN_X" DECIMAL(18,10),
                "MAX_X" DECIMAL(18,10),
                "MIN_Y" DECIMAL(18,10),
                "MAX_Y" DECIMAL(18,10),
                "OBSERVACAO" NVARCHAR(2000),
                "CREATED_AT" LONGDATE CS_LONGDATE,
                "CREATED_BY" NVARCHAR(50),
                "UPDATED_AT" LONGDATE CS_LONGDATE,
                PRIMARY KEY ("ID_ACAO")
            )
            UNLOAD PRIORITY 5 AUTO MERGE
        """)

    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_ACAO_ITEM}")
        cursor.fetchone()
    except Exception:
        cursor.execute(f"""
            CREATE COLUMN TABLE {TB_ACAO_ITEM}
            (
                "ID" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "ID_ACAO" INTEGER NOT NULL,
                "BARRAMENTO" NVARCHAR(50) NOT NULL,
                PRIMARY KEY ("ID")
            )
            UNLOAD PRIORITY 5 AUTO MERGE
        """)


class AcaoPosteCreate(BaseModel):
    tipo: str
    titulo: Optional[str] = None
    responsavel: Optional[str] = None
    prazo: Optional[str] = None
    observacao: Optional[str] = None
    criado_por: Optional[str] = None
    barramentos: List[str] = []
    bounds: Optional[dict] = None


class AcaoPosteUpdate(BaseModel):
    responsavel: Optional[str] = None
    prazo: Optional[str] = None
    status: Optional[str] = None
    observacao: Optional[str] = None


def inserir_acao_poste(
    cursor,
    tipo: str,
    titulo: Optional[str],
    responsavel: Optional[str],
    prazo: Optional[str],
    barramentos: List[str],
    bounds: Optional[dict] = None,
    observacao: Optional[str] = None,
    criado_por: Optional[str] = None,
) -> int:
    """Grava uma ação de poste (TB_ACAO + TB_ACAO_ITEM) e devolve o ID_ACAO
    gerado. Extraído do endpoint POST /api/postes/acoes pra poder ser
    reaproveitado por routers/provedores.py quando uma solicitação de
    Remoção feita a partir de um Contrato precisa nascer já vinculada a uma
    ação real no Mapa de Postes - mesma tabela, visível pro time técnico nos
    dois lugares. Não faz commit; quem chamar decide a transação."""
    _acoes_garantir_tabelas(cursor)
    bounds = bounds or {}

    cursor.execute(
        f"""
        INSERT INTO {TB_ACAO}
            ("TIPO","TITULO","RESPONSAVEL","PRAZO","STATUS","QTD_POSTES","MIN_X","MAX_X","MIN_Y","MAX_Y","OBSERVACAO","CREATED_AT","CREATED_BY","UPDATED_AT")
        VALUES (?,?,?,?,'ABERTA',?,?,?,?,?,?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP)
        """,
        [
            tipo,
            titulo,
            responsavel,
            prazo,
            len(barramentos),
            bounds.get("min_x"),
            bounds.get("max_x"),
            bounds.get("min_y"),
            bounds.get("max_y"),
            observacao,
            criado_por,
        ],
    )

    cursor.execute(f'SELECT MAX("ID_ACAO") FROM {TB_ACAO}')
    id_acao = cursor.fetchone()[0]

    linhas = [[id_acao, barramento] for barramento in barramentos]
    for inicio in range(0, len(linhas), 5000):
        cursor.executemany(
            f'INSERT INTO {TB_ACAO_ITEM} ("ID_ACAO","BARRAMENTO") VALUES (?,?)',
            linhas[inicio: inicio + 5000],
        )

    return id_acao


@router.post("/api/postes/acoes", response_model=dict)
def criar_acao_poste(dados: AcaoPosteCreate):
    if dados.tipo not in TIPOS_ACAO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tipo deve ser um de: {', '.join(sorted(TIPOS_ACAO_VALIDOS))}")
    if not dados.barramentos:
        raise HTTPException(status_code=400, detail="Informe ao menos um poste (barramentos)")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        id_acao = inserir_acao_poste(
            cursor,
            tipo=dados.tipo,
            titulo=dados.titulo,
            responsavel=dados.responsavel,
            prazo=dados.prazo,
            barramentos=dados.barramentos,
            bounds=dados.bounds,
            observacao=dados.observacao,
            criado_por=dados.criado_por,
        )

        conn.commit()
        return {"id_acao": id_acao, "qtd_postes": len(dados.barramentos)}
    except HTTPException:
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


@router.get("/api/postes/acoes", response_model=List[dict])
def listar_acoes_poste(
    tipo: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    responsavel: Optional[str] = Query(None),
):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _acoes_garantir_tabelas(cursor)

        sql = f'SELECT * FROM {TB_ACAO} WHERE 1=1'
        params: List[Any] = []
        if tipo:
            sql += ' AND "TIPO" = ?'
            params.append(tipo)
        if status:
            sql += ' AND "STATUS" = ?'
            params.append(status)
        if responsavel:
            sql += ' AND "RESPONSAVEL" = ?'
            params.append(responsavel)
        sql += ' ORDER BY "PRAZO" ASC, "CREATED_AT" DESC'

        cursor.execute(sql, params)
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/postes/acoes/{id_acao}", response_model=dict)
def detalhar_acao_poste(id_acao: int):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _acoes_garantir_tabelas(cursor)

        cursor.execute(f'SELECT * FROM {TB_ACAO} WHERE "ID_ACAO" = ?', [id_acao])
        linhas = _linhas_para_dicts(cursor)
        if not linhas:
            raise HTTPException(status_code=404, detail="Ação não encontrada")
        acao = linhas[0]

        cursor.execute(
            f"""
            SELECT AI."BARRAMENTO", P."X", P."Y"
            FROM {TB_ACAO_ITEM} AI
            LEFT JOIN {TB_POSTE} P ON P."BARRAMENTO" = AI."BARRAMENTO"
            WHERE AI."ID_ACAO" = ?
            """,
            [id_acao],
        )
        acao["postes"] = _linhas_para_dicts(cursor)
        return acao
    except HTTPException:
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/postes/acoes/{id_acao}", response_model=dict)
def atualizar_acao_poste(id_acao: int, dados: AcaoPosteUpdate):
    if dados.status is not None and dados.status not in STATUS_ACAO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"status deve ser um de: {', '.join(sorted(STATUS_ACAO_VALIDOS))}")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _acoes_garantir_tabelas(cursor)

        campos = []
        valores: List[Any] = []
        if dados.responsavel is not None:
            campos.append('"RESPONSAVEL" = ?')
            valores.append(dados.responsavel)
        if dados.prazo is not None:
            campos.append('"PRAZO" = ?')
            valores.append(dados.prazo)
        if dados.status is not None:
            campos.append('"STATUS" = ?')
            valores.append(dados.status)
        if dados.observacao is not None:
            campos.append('"OBSERVACAO" = ?')
            valores.append(dados.observacao)

        if not campos:
            return {"mensagem": "Nada para atualizar"}

        campos.append('"UPDATED_AT" = CURRENT_TIMESTAMP')
        valores.append(id_acao)

        cursor.execute(f'UPDATE {TB_ACAO} SET {", ".join(campos)} WHERE "ID_ACAO" = ?', valores)
        conn.commit()
        return {"success": True}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
