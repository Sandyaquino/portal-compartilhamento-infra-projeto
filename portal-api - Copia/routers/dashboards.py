from fastapi import APIRouter, HTTPException, Path, Body, Query, File, UploadFile, Request
from typing import Any, Optional, List, Dict, Tuple
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta
import hashlib
import io
import re
import pandas as pd
from pydantic import BaseModel

import main
from routers.campo import montar_filtros_dashboard

router = APIRouter()

@router.get("/api/dashboard-operacional/resumo")
def dashboard_resumo(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        # Filtros para a base oficial.
        # Município não entra aqui porque a tabela oficial não possui município.
        where_oficial, params_oficial = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=False,
            incluir_municipio=False,
        )

        # Filtros para os apontamentos de campo.
        where_campo, params_campo = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=True,
            incluir_municipio=True,
        )

        sql_oficial = f"""
            SELECT
                COUNT(*)
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O
            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_oficial}
        """

        cursor.execute(sql_oficial, params_oficial)
        turmas_oficiais = cursor.fetchone()[0] or 0

        # Nota: POSTES/CABOS/CAIXAS somam só linhas com NUMERO_OS válido (não nulo/vazio/'0')
        # - registros sem OS válida ainda contam em SEM_OS abaixo, mas não inflam os totais.
        sql_campo = f"""
            SELECT
                COUNT(DISTINCT O.EQUIPE_FORMS) AS TURMAS_APRESENTADAS,
                COALESCE(SUM(CASE WHEN COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0') THEN C.POSTES_EXECUTADOS ELSE 0 END), 0) AS POSTES,
                COALESCE(SUM(CASE WHEN COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0') THEN C.CABOS_REMOVIDOS ELSE 0 END), 0) AS CABOS,
                COALESCE(SUM(CASE WHEN COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0') THEN C.CAIXAS_REMOVIDAS ELSE 0 END), 0) AS CAIXAS,
                COUNT(DISTINCT C.MUNICIPIO) AS MUNICIPIOS,
                COUNT(
                    DISTINCT CASE
                        WHEN UPPER(COALESCE(C.OBSERVACAO, '')) LIKE '%MANUTEN%'
                        THEN O.EQUIPE_FORMS
                    END
                ) AS MANUTENCAO,
                COUNT(
                    DISTINCT CASE
                        WHEN UPPER(COALESCE(C.OBSERVACAO, '')) LIKE '%FOLGA%'
                        THEN O.EQUIPE_FORMS
                    END
                ) AS FOLGA,
                COUNT(
                    DISTINCT CASE
                        WHEN UPPER(COALESCE(C.OBSERVACAO, '')) LIKE '%SEM ATIVIDADE%'
                        THEN O.EQUIPE_FORMS
                    END
                ) AS SEM_ATIVIDADE,
                COUNT(
                    CASE
                        WHEN C.NUMERO_OS IS NULL
                          OR TRIM(C.NUMERO_OS) = ''
                          OR TRIM(C.NUMERO_OS) = '0'
                        THEN 1
                    END
                ) AS SEM_OS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.EQUIPE_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O2
                        WHERE O2.STATUS_TURMA = 'ATIVA'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                ON UPPER(TRIM(C.EQUIPE)) = UPPER(TRIM(O.EQUIPE_FORMS))
            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_campo}
        """

        cursor.execute(sql_campo, params_campo)
        row = cursor.fetchone()

        turmas_apresentadas = row[0] or 0
        postes = row[1] or 0
        cabos = row[2] or 0
        caixas = row[3] or 0
        municipios = row[4] or 0
        manutencao = row[5] or 0
        folga = row[6] or 0
        sem_atividade = row[7] or 0
        sem_os = row[8] or 0

        # Percentual de execução das OS: compara os postes já sinalizados no
        # período (POSTES acima) com o volume total planejado (U625108.GEOS.QNTD_POSTES)
        # das OS distintas e válidas tocadas nesse mesmo período/filtro.
        sql_os_programado = f"""
            SELECT COALESCE(SUM(G.QNTD_POSTES), 0)
            FROM (
                SELECT DISTINCT TRIM(C.NUMERO_OS) AS NUMERO_OS
                FROM
                    (
                        SELECT * FROM (
                            SELECT O2.*, ROW_NUMBER() OVER (
                                PARTITION BY UPPER(TRIM(O2.EQUIPE_FORMS)) ORDER BY O2.ID DESC
                            ) AS RN
                            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O2
                            WHERE O2.STATUS_TURMA = 'ATIVA'
                        ) WHERE RN = 1
                    ) O
                INNER JOIN
                    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                    ON UPPER(TRIM(C.EQUIPE)) = UPPER(TRIM(O.EQUIPE_FORMS))
                WHERE
                    O.STATUS_TURMA = 'ATIVA'
                    AND COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0')
                    {where_campo}
            ) OS_DISTINTAS
            LEFT JOIN U625108.GEOS G ON TRIM(G.NUMERO) = OS_DISTINTAS.NUMERO_OS
        """

        cursor.execute(sql_os_programado, params_campo)
        row_os = cursor.fetchone()
        postes_programados = (row_os[0] if row_os else 0) or 0

        percentual_execucao_os = (
            round((postes / postes_programados) * 100, 1) if postes_programados > 0 else 0
        )

        sql_media_apresentacao = f"""
            SELECT
                AVG(PERCENTUAL_DIA)
            FROM
            (
                SELECT

                    (
                        COUNT(
                            DISTINCT O.EQUIPE_FORMS
                        ) * 100.0
                    )

                    /

                    {turmas_oficiais}

                    AS PERCENTUAL_DIA

                FROM
                    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O

                INNER JOIN
                    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C

                    ON UPPER(TRIM(C.EQUIPE))
                    =
                    UPPER(TRIM(O.EQUIPE_FORMS))

                WHERE
                    O.STATUS_TURMA = 'ATIVA'
                    {where_campo}

                GROUP BY
                    C.DATA_EXECUCAO
            ) X
        """
   
        cursor.execute(
            sql_media_apresentacao,
            params_campo
        )

        row_media = cursor.fetchone()
        percentual = 0

        if (
            row_media
            and row_media[0] is not None
        ):
            percentual = round(
                float(row_media[0]),
                1
            )


        return {
            "turmas_oficiais": turmas_oficiais,
            "turmas_apresentadas": turmas_apresentadas,
            "turmas_pendentes": max(0, turmas_oficiais - turmas_apresentadas),
            "percentual_apresentacao": percentual,
            "postes": postes,
            "cabos": cabos,
            "caixas": caixas,
            "municipios": municipios,
            "manutencao": manutencao,
            "folga": folga,
            "sem_atividade": sem_atividade,
            "sem_os": sem_os,
            "percentual_execucao_os": percentual_execucao_os,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-operacional/evolucao")
def dashboard_evolucao(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_campo, params_campo = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=True,
            incluir_municipio=True,
        )

        sql = f"""
            SELECT
                TO_VARCHAR(C.DATA_EXECUCAO, 'DD/MM') AS DIA,
                C.DATA_EXECUCAO AS DATA_ORDENACAO,
                COALESCE(SUM(C.POSTES_EXECUTADOS), 0) AS POSTES,
                COALESCE(SUM(C.CABOS_REMOVIDOS), 0) AS CABOS,
                COALESCE(SUM(C.CAIXAS_REMOVIDAS), 0) AS CAIXAS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.EQUIPE_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O2
                        WHERE O2.STATUS_TURMA = 'ATIVA'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                ON UPPER(TRIM(C.EQUIPE)) = UPPER(TRIM(O.EQUIPE_FORMS))
                AND COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_campo}
            GROUP BY
                C.DATA_EXECUCAO
            ORDER BY
                DATA_ORDENACAO
        """

        cursor.execute(sql, params_campo)
        rows = cursor.fetchall()

        return [
            {
                "dia": row[0],
                "postes": row[2] or 0,
                "cabos": row[3] or 0,
                "caixas": row[4] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()




@router.get("/api/dashboard-operacional/evolucao-apresentacao")
def dashboard_evolucao_apresentacao(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        # =====================================================
        # FILTROS DA BASE OFICIAL
        # =====================================================
        # Aqui entram apenas filtros que existem na tabela oficial:
        # EPS e EQUIPE_FORMS.
        #
        # Município não existe na tabela oficial, então ele será
        # tratado separadamente quando necessário.

        where_oficial, params_oficial = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=False,
            incluir_municipio=False,
        )

        # =====================================================
        # FILTROS DA BASE CAMPO
        # =====================================================
        # Aqui entram período, EPS, equipe e município.
        # O cruzamento correto é:
        # C.EQUIPE = O.EQUIPE_FORMS

        where_campo, params_campo = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=True,
            incluir_municipio=True,
        )

        # =====================================================
        # TOTAL DE TURMAS OFICIAIS FILTRADAS
        # =====================================================
        # Regra:
        # - Se não houver município, conta a base oficial filtrada por EPS/equipe.
        # - Se houver município, conta apenas as turmas oficiais que tiveram
        #   algum apontamento naquele município dentro do filtro aplicado.

        if municipio:
            sql_oficiais = f"""
                SELECT
                    COUNT(DISTINCT O.EQUIPE_FORMS)
                FROM
                    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O
                WHERE
                    O.STATUS_TURMA = 'ATIVA'
                    {where_oficial}
                    AND EXISTS
                    (
                        SELECT
                            1
                        FROM
                            CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                        WHERE
                            UPPER(TRIM(C.EQUIPE))
                            =
                            UPPER(TRIM(O.EQUIPE_FORMS))
                            {where_campo}
                    )
            """

            params_oficiais = params_oficial + params_campo

        else:
            sql_oficiais = f"""
                SELECT
                    COUNT(DISTINCT O.EQUIPE_FORMS)
                FROM
                    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O
                WHERE
                    O.STATUS_TURMA = 'ATIVA'
                    {where_oficial}
            """

            params_oficiais = params_oficial

        cursor.execute(
            sql_oficiais,
            params_oficiais
        )

        total_oficiais = cursor.fetchone()[0] or 0

        # =====================================================
        # EVOLUÇÃO DIÁRIA DAS TURMAS APRESENTADAS
        # =====================================================
        # Conta por dia quantas turmas oficiais apareceram na tabela campo.

        sql_evolucao = f"""
            SELECT
                TO_VARCHAR(
                    C.DATA_EXECUCAO,
                    'DD/MM'
                ) AS DIA,

                C.DATA_EXECUCAO AS DATA_ORDENACAO,

                COUNT(
                    DISTINCT O.EQUIPE_FORMS
                ) AS TURMAS_APRESENTADAS

            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O

            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C

                ON UPPER(TRIM(C.EQUIPE))
                =
                UPPER(TRIM(O.EQUIPE_FORMS))

            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_campo}

            GROUP BY
                C.DATA_EXECUCAO

            ORDER BY
                DATA_ORDENACAO
        """

        cursor.execute(
            sql_evolucao,
            params_campo
        )

        rows = cursor.fetchall()

        resultado = []

        for row in rows:
            dia = row[0]
            apresentadas = row[2] or 0

            percentual = 0

            if total_oficiais > 0:
                percentual = round(
                    (apresentadas / total_oficiais) * 100,
                    1
                )

            resultado.append({
                "dia": dia,
                "turmas_oficiais": total_oficiais,
                "turmas_apresentadas": apresentadas,
                "percentual_apresentacao": percentual,
            })

        return resultado

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()




@router.get("/api/dashboard-operacional/ranking")
def dashboard_ranking(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_campo, params_campo = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=True,
            incluir_municipio=True,
        )

        sql = f"""
            SELECT
                C.EQUIPE,
                COALESCE(O.EPS, C.EPS) AS EPS,
                COALESCE(SUM(C.POSTES_EXECUTADOS), 0) AS POSTES,
                COALESCE(SUM(C.CABOS_REMOVIDOS), 0) AS CABOS,
                COALESCE(SUM(C.CAIXAS_REMOVIDAS), 0) AS CAIXAS,
                COUNT(DISTINCT C.NUMERO_OS) AS OS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.EQUIPE_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O2
                        WHERE O2.STATUS_TURMA = 'ATIVA'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                ON UPPER(TRIM(C.EQUIPE)) = UPPER(TRIM(O.EQUIPE_FORMS))
                AND COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_campo}
            GROUP BY
                C.EQUIPE,
                COALESCE(O.EPS, C.EPS)
            ORDER BY
                POSTES DESC
        """

        cursor.execute(sql, params_campo)
        rows = cursor.fetchall()

        resultado = []
        for index, row in enumerate(rows, start=1):
            resultado.append({
                "posicao": index,
                "equipe": row[0],
                "eps": row[1],
                "postes": row[2] or 0,
                "cabos": row[3] or 0,
                "caixas": row[4] or 0,
                "os": row[5] or 0,
            })

        return resultado

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-operacional/pendencias")
def dashboard_pendencias(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_oficial, params_oficial = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=False,
            incluir_municipio=False,
        )

        where_campo, params_campo = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=True,
            incluir_municipio=True,
        )

        sql = f"""
            SELECT
                O.EQUIPE_FORMS AS EQUIPE,
                O.EPS,
                O.STATUS_TURMA
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O
            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_oficial}
                AND NOT EXISTS
                (
                    SELECT 1
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                    WHERE
                        UPPER(TRIM(C.EQUIPE)) = UPPER(TRIM(O.EQUIPE_FORMS))
                        {where_campo}
                )
            ORDER BY
                O.EQUIPE_FORMS
        """

        params = params_oficial + params_campo
        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()

        return [
            dict(zip(columns, row))
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-operacional/apresentacoes")
def dashboard_apresentacoes(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_campo, params_campo = montar_filtros_dashboard(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            eps=eps,
            equipe=equipe,
            municipio=municipio,
            incluir_periodo=True,
            incluir_municipio=True,
        )

        sql = f"""
            SELECT TOP 20
                C.EQUIPE,
                C.DATA_EXECUCAO,
                C.STATUS_APRESENTACAO,
                C.DATA_ENVIO
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.EQUIPE_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL O2
                        WHERE O2.STATUS_TURMA = 'ATIVA'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
                ON UPPER(TRIM(C.EQUIPE)) = UPPER(TRIM(O.EQUIPE_FORMS))
                AND COALESCE(TRIM(C.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TURMA = 'ATIVA'
                {where_campo}
            ORDER BY
                C.DATA_ENVIO DESC
        """

        cursor.execute(sql, params_campo)
        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            resultado.append({
                "equipe": row[0],
                "data": str(row[1]) if row[1] is not None else "-",
                "status": row[2],
                "atualizacao": str(row[3]) if row[3] is not None else "-",
            })

        return resultado

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-operacional/ultimas-apresentacoes")
def dashboard_ultimas_apresentacoes():
    return dashboard_apresentacoes(periodo="ultimos_30_dias")


# =====================================================
# FATURAMENTO - DASHBOARD COMERCIAL
# =====================================================



TABELA_FATURAMENTO = "CLB962119.FATURAMENTO_COMP_ESTRUTURA_BASE_CADASTRAL_ORIG"


POSTES_SQL = """
COALESCE(
    TO_DOUBLE(
        NULLIF(
            REPLACE(
                TRIM(
                    TO_NVARCHAR(NUMERO_POSTES)
                ),
                ',',
                '.'
            ),
            ''
        )
    ),
    0
)
"""


VALOR_UNITARIO_SQL = """
COALESCE(
    TO_DOUBLE(
        NULLIF(
            REPLACE(
                TRIM(
                    TO_NVARCHAR(VALOR_UNITARIO_NORM)
                ),
                ',',
                '.'
            ),
            ''
        )
    ),
    0
)
"""


RECEITA_SQL = f"""
(
    {POSTES_SQL}
    *
    {VALOR_UNITARIO_SQL}
)
"""



def montar_filtros_faturamento(
    municipio=None,
    lote=None,
    cliente=None,
    status_contrato=None,
    flag_judicial=None,
    indice_reajuste=None,
):
    filtros = []
    params = []

    if municipio:
        filtros.append(
            "UPPER(MUNICIPIO) LIKE UPPER(?)"
        )
        params.append(
            f"%{municipio}%"
        )

    if lote:
        filtros.append(
            "UPPER(LOTE) LIKE UPPER(?)"
        )
        params.append(
            f"%{lote}%"
        )

    if cliente:
        filtros.append(
            "UPPER(RAZAO_SOCIAL) LIKE UPPER(?)"
        )
        params.append(
            f"%{cliente}%"
        )

    if status_contrato:
        filtros.append(
            "UPPER(STATUS_CONTRATO_PADRAO) = UPPER(?)"
        )
        params.append(
            status_contrato
        )

    if flag_judicial:
        filtros.append(
            "UPPER(FLAG_JUDICIAL) = UPPER(?)"
        )
        params.append(
            flag_judicial
        )

    if indice_reajuste:
        filtros.append(
            "UPPER(INDICE_REAJUSTE_PADRAO) = UPPER(?)"
        )
        params.append(
            indice_reajuste
        )

    where_sql = ""

    if filtros:
        where_sql = (
            " WHERE "
            + " AND ".join(filtros)
        )

    return where_sql, params

def converter_data_vencimento_faturamento(valor):
    if valor is None:
        return None

    if isinstance(valor, date):
        return valor

    texto = str(valor).strip()

    if texto == "":
        return None

    formatos = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %I:%M %p",
        "%d/%m/%Y %I:%M %p",
    ]

    for formato in formatos:
        try:
            return datetime.strptime(
                texto,
                formato
            ).date()
        except Exception:
            pass

    # Caso venha número serial do Excel
    try:
        numero = float(texto)

        if numero > 30000:
            return (
                date(1899, 12, 30)
                + timedelta(days=int(numero))
            )
    except Exception:
        pass

    return None


@router.get("/api/faturamento/resumo")
def faturamento_resumo(
    municipio: Optional[str] = None,
    lote: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            lote=lote,
            cliente=cliente,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA_TOTAL,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                COUNT(*) AS CONTRATOS,

                COUNT(
                    DISTINCT CNPJ
                ) AS CLIENTES,

                AVG(
                    {VALOR_UNITARIO_SQL}
                ) AS VALOR_UNITARIO_MEDIO,

                SUM(
                    CASE
                        WHEN UPPER(
                            COALESCE(
                                FLAG_JUDICIAL,
                                ''
                            )
                        ) = 'JUDICIAL'
                        THEN
                            {RECEITA_SQL}
                        ELSE
                            0
                    END
                ) AS RECEITA_JUDICIAL,

                COUNT(
                    CASE
                        WHEN UPPER(
                            COALESCE(
                                STATUS_CONTRATO_PADRAO,
                                ''
                            )
                        ) = 'ATIVO'
                        THEN
                            1
                    END
                ) AS CONTRATOS_ATIVOS

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}
        """

        cursor.execute(
            sql,
            params
        )

        row = cursor.fetchone()

        receita_total = float(row[0] or 0)
        postes = float(row[1] or 0)
        contratos = int(row[2] or 0)
        clientes = int(row[3] or 0)
        valor_unitario_medio = float(row[4] or 0)
        receita_judicial = float(row[5] or 0)
        contratos_ativos = int(row[6] or 0)

        receita_poste = 0

        if postes > 0:
            receita_poste = receita_total / postes

        receita_media_contrato = 0

        if contratos > 0:
            receita_media_contrato = receita_total / contratos

        percentual_judicial = 0

        if receita_total > 0:
            percentual_judicial = (
                receita_judicial
                / receita_total
            ) * 100

        return {
            "receita_total": round(receita_total, 2),
            "postes": round(postes, 0),
            "receita_poste": round(receita_poste, 2),
            "contratos": contratos,
            "contratos_ativos": contratos_ativos,
            "clientes": clientes,
            "valor_unitario": round(valor_unitario_medio, 2),
            "receita_media_contrato": round(receita_media_contrato, 2),
            "receita_judicial": round(receita_judicial, 2),
            "percentual_judicial": round(percentual_judicial, 2),
        }

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/municipios")
def faturamento_municipios(
    lote: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            lote=lote,
            cliente=cliente,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                COALESCE(
                    MUNICIPIO,
                    'SEM MUNICIPIO'
                ) AS MUNICIPIO,

                COUNT(*) AS CONTRATOS,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}

            GROUP BY
                COALESCE(
                    MUNICIPIO,
                    'SEM MUNICIPIO'
                )

            ORDER BY
                RECEITA DESC
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        return [
            {
                "municipio": row[0],
                "contratos": int(row[1] or 0),
                "postes": float(row[2] or 0),
                "receita": float(row[3] or 0),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/lotes")
def faturamento_lotes(
    municipio: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            cliente=cliente,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                COALESCE(
                    LOTE,
                    'SEM LOTE'
                ) AS LOTE,

                COUNT(*) AS CONTRATOS,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}

            GROUP BY
                COALESCE(
                    LOTE,
                    'SEM LOTE'
                )

            ORDER BY
                RECEITA DESC
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        return [
            {
                "lote": row[0],
                "contratos": int(row[1] or 0),
                "postes": float(row[2] or 0),
                "receita": float(row[3] or 0),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/judicial")
def faturamento_judicial(
    municipio: Optional[str] = None,
    lote: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            lote=lote,
            cliente=cliente,
            status_contrato=status_contrato,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                COALESCE(
                    FLAG_JUDICIAL,
                    'SEM INFORMACAO'
                ) AS FLAG,

                COUNT(*) AS CONTRATOS,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}

            GROUP BY
                COALESCE(
                    FLAG_JUDICIAL,
                    'SEM INFORMACAO'
                )

            ORDER BY
                RECEITA DESC
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        return [
            {
                "flag": row[0],
                "contratos": int(row[1] or 0),
                "postes": float(row[2] or 0),
                "receita": float(row[3] or 0),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/clientes")
def faturamento_clientes(
    municipio: Optional[str] = None,
    lote: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            lote=lote,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                RAZAO_SOCIAL,
                CNPJ,

                COUNT(*) AS CONTRATOS,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA,

                AVG(
                    {VALOR_UNITARIO_SQL}
                ) AS VALOR_UNITARIO_MEDIO

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}

            GROUP BY
                RAZAO_SOCIAL,
                CNPJ

            ORDER BY
                RECEITA DESC
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        return [
            {
                "cliente": row[0],
                "cnpj": str(row[1]) if row[1] is not None else None,
                "contratos": int(row[2] or 0),
                "postes": float(row[3] or 0),
                "receita": float(row[4] or 0),
                "valor_unitario_medio": round(float(row[5] or 0), 2),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/curva-abc")
def faturamento_curva_abc(
    municipio: Optional[str] = None,
    lote: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            lote=lote,
            cliente=cliente,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                RAZAO_SOCIAL,
                CNPJ,

                COUNT(*) AS CONTRATOS,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}

            GROUP BY
                RAZAO_SOCIAL,
                CNPJ

            ORDER BY
                RECEITA DESC
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        total_receita = sum(
            float(row[4] or 0)
            for row in rows
        )

        resultado = []
        acumulado = 0

        for index, row in enumerate(rows, start=1):
            receita = float(row[4] or 0)

            percentual = 0

            if total_receita > 0:
                percentual = round(
                    (receita / total_receita) * 100,
                    2,
                )

            acumulado += percentual

            if acumulado <= 80:
                classe_abc = "A"
            elif acumulado <= 95:
                classe_abc = "B"
            else:
                classe_abc = "C"

            resultado.append({
                "posicao": index,
                "cliente": row[0],
                "cnpj": str(row[1]) if row[1] is not None else None,
                "contratos": int(row[2] or 0),
                "postes": float(row[3] or 0),
                "receita": receita,
                "percentual": percentual,
                "percentual_acumulado": round(acumulado, 2),
                "classe_abc": classe_abc,
            })

        return resultado

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/reajustes")
def faturamento_reajustes(
    municipio: Optional[str] = None,
    lote: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            lote=lote,
            cliente=cliente,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
        )

        sql = f"""
            SELECT
                COALESCE(
                    INDICE_REAJUSTE_PADRAO,
                    'SEM INFORMACAO'
                ) AS INDICE,

                COUNT(*) AS CONTRATOS,

                SUM(
                    {POSTES_SQL}
                ) AS POSTES,

                SUM(
                    {RECEITA_SQL}
                ) AS RECEITA,

                AVG(
                    {VALOR_UNITARIO_SQL}
                ) AS VALOR_UNITARIO_MEDIO

            FROM
                {TABELA_FATURAMENTO}

            {where_sql}

            GROUP BY
                COALESCE(
                    INDICE_REAJUSTE_PADRAO,
                    'SEM INFORMACAO'
                )

            ORDER BY
                RECEITA DESC
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        return [
            {
                "indice": row[0],
                "contratos": int(row[1] or 0),
                "postes": float(row[2] or 0),
                "receita": float(row[3] or 0),
                "valor_unitario_medio": round(float(row[4] or 0), 2),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/faturamento/contratos-vencendo")
def faturamento_contratos_vencendo(
    dias: int = Query(90),
    municipio: Optional[str] = None,
    lote: Optional[str] = None,
    cliente: Optional[str] = None,
    status_contrato: Optional[str] = None,
    flag_judicial: Optional[str] = None,
    indice_reajuste: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_faturamento(
            municipio=municipio,
            lote=lote,
            cliente=cliente,
            status_contrato=status_contrato,
            flag_judicial=flag_judicial,
            indice_reajuste=indice_reajuste,
        )

        sql = f"""
            SELECT
                RAZAO_SOCIAL,
                CNPJ,
                CONTRATO,
                LOTE,
                MUNICIPIO,
                DATA_VENCIMENTO,
                STATUS_CONTRATO_PADRAO,
                FLAG_JUDICIAL,
                {POSTES_SQL} AS POSTES,
                {VALOR_UNITARIO_SQL} AS VALOR_UNITARIO,
                {RECEITA_SQL} AS RECEITA
            FROM
                {TABELA_FATURAMENTO}
            {where_sql}
        """

        cursor.execute(
            sql,
            params
        )

        rows = cursor.fetchall()

        hoje = date.today()
        limite = hoje + timedelta(days=dias)

        resultado = []

        for row in rows:
            data_vencimento = converter_data_vencimento_faturamento(
                row[5]
            )

            if data_vencimento is None:
                continue

            if data_vencimento < hoje:
                continue

            if data_vencimento > limite:
                continue

            dias_para_vencer = (
                data_vencimento - hoje
            ).days

            resultado.append({
                "cliente": row[0],
                "cnpj": str(row[1]) if row[1] is not None else None,
                "contrato": row[2],
                "lote": row[3],
                "municipio": row[4],
                "data_vencimento": data_vencimento.strftime("%Y-%m-%d"),
                "status_contrato": row[6],
                "flag_judicial": row[7],
                "postes": float(row[8] or 0),
                "valor_unitario": float(row[9] or 0),
                "receita": float(row[10] or 0),
                "dias_para_vencer": dias_para_vencer,
            })

        resultado = sorted(
            resultado,
            key=lambda item: item["dias_para_vencer"]
        )

        return resultado

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()



# =====================================================
# DASHBOARD TÉCNICO DE FISCALIZAÇÃO
# =====================================================

def montar_filtros_dashboard_tecnico(
    periodo="mes_atual",
    data_inicial=None,
    data_final=None,
    empresa=None,
    tecnico=None,
    municipio=None,
    tipo_os=None,
    setor=None,
    superintendencia=None,
    alias_tecnico="T",
    alias_oficial="O",
    incluir_periodo=True,
    incluir_operacional=True,
    incluir_oficial=True,
):
    """
    Monta filtros reutilizáveis para o Dashboard Técnico.

    Regra de relacionamento confirmada:
        PORTAL_COMPARTILHAMENTO_TECNICO.TECNICO
        =
        PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL.TECNICO

    T = tabela de execução/fiscalização técnica
    O = tabela oficial de técnicos
    """

    filtros = []
    params = []

    if incluir_periodo:
        coluna_data = f"{alias_tecnico}.DATA_EXECUCAO"

        if periodo == "hoje":
            filtros.append(f"{coluna_data} = CURRENT_DATE")

        elif periodo == "ontem":
            filtros.append(f"{coluna_data} = ADD_DAYS(CURRENT_DATE, -1)")

        elif periodo == "ultimos_7_dias":
            filtros.append(f"{coluna_data} >= ADD_DAYS(CURRENT_DATE, -7)")

        elif periodo == "ultimos_30_dias":
            filtros.append(f"{coluna_data} >= ADD_DAYS(CURRENT_DATE, -30)")

        elif periodo == "mes_atual":
            filtros.append(
                f"""
                {coluna_data} BETWEEN
                ADD_DAYS(
                    CURRENT_DATE,
                    1 - DAYOFMONTH(CURRENT_DATE)
                )
                AND CURRENT_DATE
                """
            )

        elif periodo == "mes_anterior":
            filtros.append(
                f"""
                {coluna_data} BETWEEN
                ADD_MONTHS(
                    ADD_DAYS(
                        CURRENT_DATE,
                        1 - DAYOFMONTH(CURRENT_DATE)
                    ),
                    -1
                )
                AND
                ADD_DAYS(
                    ADD_DAYS(
                        CURRENT_DATE,
                        1 - DAYOFMONTH(CURRENT_DATE)
                    ),
                    -1
                )
                """
            )

        elif periodo == "personalizado" and data_inicial and data_final:
            filtros.append(
                f"{coluna_data} BETWEEN TO_DATE(?) AND TO_DATE(?)"
            )
            params.extend([data_inicial, data_final])

    if incluir_operacional:
        if empresa:
            filtros.append(
                f"UPPER({alias_tecnico}.EMPRESA) = UPPER(?)"
            )
            params.append(empresa)

        if tecnico:
            filtros.append(
                f"UPPER({alias_tecnico}.TECNICO) LIKE UPPER(?)"
            )
            params.append(f"%{tecnico}%")

        if municipio:
            filtros.append(
                f"UPPER({alias_tecnico}.MUNICIPIO) LIKE UPPER(?)"
            )
            params.append(f"%{municipio}%")

        if tipo_os:
            filtros.append(
                f"UPPER({alias_tecnico}.TIPO_OS) LIKE UPPER(?)"
            )
            params.append(f"%{tipo_os}%")

    if incluir_oficial:
        if setor:
            filtros.append(
                f"UPPER({alias_oficial}.SETOR) LIKE UPPER(?)"
            )
            params.append(f"%{setor}%")

        if superintendencia:
            filtros.append(
                f"UPPER({alias_oficial}.SUPERINTENDENCIA) = UPPER(?)"
            )
            params.append(superintendencia)

    where_sql = ""

    if filtros:
        where_sql = " AND " + " AND ".join(filtros)

    return where_sql, params


@router.get("/api/dashboard-tecnico/resumo")
def dashboard_tecnico_resumo(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        # =====================================================
        # FILTROS DA BASE OFICIAL
        # =====================================================
        where_oficial, params_oficial = montar_filtros_dashboard_tecnico(
            empresa=empresa,
            tecnico=tecnico,
            setor=setor,
            superintendencia=superintendencia,
            incluir_periodo=False,
            incluir_operacional=False,
            incluir_oficial=True,
        )

        sql_oficial = f"""
            SELECT
                COUNT(*) AS TECNICOS_OFICIAIS
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_oficial}
        """

        cursor.execute(sql_oficial, params_oficial)
        tecnicos_oficiais = cursor.fetchone()[0] or 0

        # =====================================================
        # FILTROS DOS REGISTROS DE FISCALIZAÇÃO
        # =====================================================
        where_tecnico, params_tecnico = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
            incluir_periodo=True,
            incluir_operacional=True,
            incluir_oficial=True,
        )

        # Nota: OS_FISCALIZADAS/POSTES_FISCALIZADOS ignoram linhas com NUMERO_OS
        # invalido (nulo/vazio/'0') - essas continuam contadas em SEM_OS abaixo,
        # sem inflar os totais.
        sql_resumo = f"""
            SELECT
                COUNT(DISTINCT T.TECNICO) AS TECNICOS_APRESENTADOS,
                COUNT(DISTINCT CASE WHEN COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0') THEN T.NUMERO_OS END) AS OS_FISCALIZADAS,
                COALESCE(SUM(CASE WHEN COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0') THEN T.POSTES_EXECUTADOS ELSE 0 END), 0) AS POSTES_FISCALIZADOS,
                COUNT(DISTINCT T.MUNICIPIO) AS MUNICIPIOS_ATENDIDOS,
                COUNT(DISTINCT T.EMPRESA) AS EMPRESAS_ATIVAS,
                COUNT(*) AS REGISTROS,
                COUNT(
                    CASE
                        WHEN T.NUMERO_OS IS NULL
                          OR TRIM(T.NUMERO_OS) = ''
                          OR TRIM(T.NUMERO_OS) = '0'
                        THEN 1
                    END
                ) AS SEM_OS,
                COUNT(
                    CASE
                        WHEN T.OBSERVACAO IS NULL
                          OR TRIM(TO_NVARCHAR(T.OBSERVACAO)) = ''
                        THEN 1
                    END
                ) AS SEM_OBSERVACAO,
                COUNT(
                    CASE
                        WHEN UPPER(COALESCE(TO_NVARCHAR(T.OBSERVACAO), '')) LIKE '%CONCLU%'
                        THEN 1
                    END
                ) AS CONCLUIDAS,
                COUNT(
                    CASE
                        WHEN UPPER(COALESCE(TO_NVARCHAR(T.OBSERVACAO), '')) LIKE '%ANDAMENTO%'
                        THEN 1
                    END
                ) AS EM_ANDAMENTO,
                COUNT(
                    CASE
                        WHEN UPPER(COALESCE(TO_NVARCHAR(T.OBSERVACAO), '')) LIKE '%PARCIAL%'
                        THEN 1
                    END
                ) AS PARCIAIS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                        WHERE O2.STATUS_TECNICO = 'ATIVO'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_tecnico}
        """

        cursor.execute(sql_resumo, params_tecnico)
        row = cursor.fetchone()

        tecnicos_apresentados = row[0] or 0
        os_fiscalizadas = row[1] or 0
        postes_fiscalizados = row[2] or 0
        municipios_atendidos = row[3] or 0
        empresas_ativas = row[4] or 0
        registros = row[5] or 0
        sem_os = row[6] or 0
        sem_observacao = row[7] or 0
        concluidas = row[8] or 0
        em_andamento = row[9] or 0
        parciais = row[10] or 0

        # Percentual de execução das OS: compara os postes fiscalizados no
        # período (POSTES_FISCALIZADOS acima) com o volume total planejado
        # (U625108.GEOS.QNTD_POSTES) das OS distintas e válidas do período/filtro.
        sql_os_programado = f"""
            SELECT COALESCE(SUM(G.QNTD_POSTES), 0)
            FROM (
                SELECT DISTINCT TRIM(T.NUMERO_OS) AS NUMERO_OS
                FROM
                    (
                        SELECT * FROM (
                            SELECT O2.*, ROW_NUMBER() OVER (
                                PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                            ) AS RN
                            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                            WHERE O2.STATUS_TECNICO = 'ATIVO'
                        ) WHERE RN = 1
                    ) O
                INNER JOIN
                    CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                    ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                WHERE
                    O.STATUS_TECNICO = 'ATIVO'
                    AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                    AND COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0')
                    {where_tecnico}
            ) OS_DISTINTAS
            LEFT JOIN U625108.GEOS G ON TRIM(G.NUMERO) = OS_DISTINTAS.NUMERO_OS
        """

        cursor.execute(sql_os_programado, params_tecnico)
        row_os = cursor.fetchone()
        postes_programados = (row_os[0] if row_os else 0) or 0

        percentual_execucao_os = (
            round((postes_fiscalizados / postes_programados) * 100, 1)
            if postes_programados > 0
            else 0
        )

        percentual_apresentacao = 0

        if tecnicos_oficiais > 0:
            percentual_apresentacao = round(
                (tecnicos_apresentados / tecnicos_oficiais) * 100,
                1
            )

        media_postes_tecnico = 0

        if tecnicos_apresentados > 0:
            media_postes_tecnico = round(
                postes_fiscalizados / tecnicos_apresentados,
                1
            )

        media_postes_os = 0

        if os_fiscalizadas > 0:
            media_postes_os = round(
                postes_fiscalizados / os_fiscalizadas,
                1
            )

        return {
            "tecnicos_oficiais": tecnicos_oficiais,
            "tecnicos_apresentados": tecnicos_apresentados,
            "tecnicos_pendentes": max(0, tecnicos_oficiais - tecnicos_apresentados),
            "percentual_apresentacao": percentual_apresentacao,
            "os_fiscalizadas": os_fiscalizadas,
            "postes_fiscalizados": postes_fiscalizados,
            "municipios_atendidos": municipios_atendidos,
            "empresas_ativas": empresas_ativas,
            "registros": registros,
            "sem_os": sem_os,
            "sem_observacao": sem_observacao,
            "concluidas": concluidas,
            "em_andamento": em_andamento,
            "parciais": parciais,
            "media_postes_tecnico": media_postes_tecnico,
            "media_postes_os": media_postes_os,
            "percentual_execucao_os": percentual_execucao_os,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-tecnico/evolucao")
def dashboard_tecnico_evolucao(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
        )

        sql = f"""
            SELECT
                TO_VARCHAR(T.DATA_EXECUCAO, 'DD/MM') AS DIA,
                T.DATA_EXECUCAO AS DATA_ORDENACAO,
                COALESCE(SUM(T.POSTES_EXECUTADOS), 0) AS POSTES,
                COUNT(DISTINCT T.NUMERO_OS) AS OS,
                COUNT(DISTINCT T.TECNICO) AS TECNICOS,
                COUNT(*) AS REGISTROS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                        WHERE O2.STATUS_TECNICO = 'ATIVO'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                AND COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_sql}
            GROUP BY
                T.DATA_EXECUCAO
            ORDER BY
                DATA_ORDENACAO
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "dia": row[0],
                "postes": row[2] or 0,
                "os": row[3] or 0,
                "tecnicos": row[4] or 0,
                "registros": row[5] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-tecnico/empresas")
def dashboard_tecnico_empresas(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
        )

        sql = f"""
            SELECT
                COALESCE(T.EMPRESA, O.EMPRESA, 'SEM EMPRESA') AS EMPRESA,
                COUNT(DISTINCT T.TECNICO) AS TECNICOS,
                COUNT(DISTINCT T.NUMERO_OS) AS OS,
                COALESCE(SUM(T.POSTES_EXECUTADOS), 0) AS POSTES,
                COUNT(DISTINCT T.MUNICIPIO) AS MUNICIPIOS,
                COUNT(*) AS REGISTROS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                        WHERE O2.STATUS_TECNICO = 'ATIVO'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                AND COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_sql}
            GROUP BY
                COALESCE(T.EMPRESA, O.EMPRESA, 'SEM EMPRESA')
            ORDER BY
                POSTES DESC
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "empresa": row[0],
                "tecnicos": row[1] or 0,
                "os": row[2] or 0,
                "postes": row[3] or 0,
                "municipios": row[4] or 0,
                "registros": row[5] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-tecnico/municipios")
def dashboard_tecnico_municipios(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
        )

        sql = f"""
            SELECT
                COALESCE(T.MUNICIPIO, 'SEM MUNICIPIO') AS MUNICIPIO,
                COUNT(DISTINCT T.TECNICO) AS TECNICOS,
                COUNT(DISTINCT T.NUMERO_OS) AS OS,
                COALESCE(SUM(T.POSTES_EXECUTADOS), 0) AS POSTES,
                COUNT(*) AS REGISTROS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                        WHERE O2.STATUS_TECNICO = 'ATIVO'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                AND COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_sql}
            GROUP BY
                COALESCE(T.MUNICIPIO, 'SEM MUNICIPIO')
            ORDER BY
                POSTES DESC
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "municipio": row[0],
                "tecnicos": row[1] or 0,
                "os": row[2] or 0,
                "postes": row[3] or 0,
                "registros": row[4] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-tecnico/tipos-os")
def dashboard_tecnico_tipos_os(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
        )

        sql = f"""
            SELECT
                COALESCE(T.TIPO_OS, 'SEM TIPO') AS TIPO_OS,
                COUNT(DISTINCT T.TECNICO) AS TECNICOS,
                COUNT(DISTINCT T.NUMERO_OS) AS OS,
                COALESCE(SUM(T.POSTES_EXECUTADOS), 0) AS POSTES,
                COUNT(*) AS REGISTROS
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                        WHERE O2.STATUS_TECNICO = 'ATIVO'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                AND COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0')
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_sql}
            GROUP BY
                COALESCE(T.TIPO_OS, 'SEM TIPO')
            ORDER BY
                POSTES DESC
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "tipo_os": row[0],
                "tecnicos": row[1] or 0,
                "os": row[2] or 0,
                "postes": row[3] or 0,
                "registros": row[4] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-tecnico/status")
def dashboard_tecnico_status(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
        )

        sql = f"""
            SELECT
                STATUS_FISCALIZACAO,
                COUNT(*) AS REGISTROS,
                COUNT(DISTINCT TECNICO) AS TECNICOS,
                COUNT(DISTINCT NUMERO_OS) AS OS,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES
            FROM
            (
                SELECT
                    T.TECNICO,
                    T.NUMERO_OS,
                    T.POSTES_EXECUTADOS,
                    CASE
                        WHEN UPPER(COALESCE(TO_NVARCHAR(T.OBSERVACAO), '')) LIKE '%CONCLU%'
                        THEN 'CONCLUIDA'

                        WHEN UPPER(COALESCE(TO_NVARCHAR(T.OBSERVACAO), '')) LIKE '%ANDAMENTO%'
                        THEN 'EM ANDAMENTO'

                        WHEN UPPER(COALESCE(TO_NVARCHAR(T.OBSERVACAO), '')) LIKE '%PARCIAL%'
                        THEN 'PARCIAL'

                        WHEN T.OBSERVACAO IS NULL
                          OR TRIM(TO_NVARCHAR(T.OBSERVACAO)) = ''
                        THEN 'SEM OBSERVACAO'

                        ELSE 'OUTROS'
                    END AS STATUS_FISCALIZACAO
                FROM
                    CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O
                INNER JOIN
                    CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                    ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                WHERE
                    O.STATUS_TECNICO = 'ATIVO'
                    AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                    {where_sql}
            ) X
            GROUP BY
                STATUS_FISCALIZACAO
            ORDER BY
                REGISTROS DESC
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "status": row[0],
                "registros": row[1] or 0,
                "tecnicos": row[2] or 0,
                "os": row[3] or 0,
                "postes": row[4] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/dashboard-tecnico/registros")
def dashboard_tecnico_registros(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    empresa: Optional[str] = None,
    tecnico: Optional[str] = None,
    municipio: Optional[str] = None,
    tipo_os: Optional[str] = None,
    setor: Optional[str] = None,
    superintendencia: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = montar_filtros_dashboard_tecnico(
            periodo=periodo,
            data_inicial=data_inicial,
            data_final=data_final,
            empresa=empresa,
            tecnico=tecnico,
            municipio=municipio,
            tipo_os=tipo_os,
            setor=setor,
            superintendencia=superintendencia,
        )

        sql = f"""
            SELECT TOP 1000
                T.ID,
                T.DATA_EXECUCAO,
                T.EMPRESA,
                T.TIPO_OS,
                T.NUMERO_OS,
                T.TECNICO,
                O.SETOR,
                O.SUPERINTENDENCIA,
                T.MUNICIPIO,
                T.BAIRRO,
                T.POSTES_EXECUTADOS,
                T.OBSERVACAO,
                T.APOIO,
                T.DATA_IMPORTACAO,
                T.USUARIO_IMPORTACAO,
                T.CHAVE_NEGOCIO,
                OSX.TOTAL_EXECUTADO AS OS_POSTES_EXECUTADOS,
                G.QNTD_POSTES AS OS_QNTD_POSTES
            FROM
                (
                    SELECT * FROM (
                        SELECT O2.*, ROW_NUMBER() OVER (
                            PARTITION BY UPPER(TRIM(O2.TECNICO_FORMS)) ORDER BY O2.ID DESC
                        ) AS RN
                        FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_OFICIAL O2
                        WHERE O2.STATUS_TECNICO = 'ATIVO'
                    ) WHERE RN = 1
                ) O
            INNER JOIN
                CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO T
                ON UPPER(TRIM(T.TECNICO)) = UPPER(TRIM(O.TECNICO_FORMS))
                AND COALESCE(TRIM(T.NUMERO_OS), '') NOT IN ('', '0')
            LEFT JOIN
                (
                    SELECT TRIM(NUMERO_OS) AS NUMERO_OS, SUM(POSTES_EXECUTADOS) AS TOTAL_EXECUTADO
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
                    WHERE COALESCE(TRIM(NUMERO_OS), '') NOT IN ('', '0')
                    GROUP BY TRIM(NUMERO_OS)
                ) OSX
                ON OSX.NUMERO_OS = TRIM(T.NUMERO_OS)
            LEFT JOIN
                U625108.GEOS G
                ON TRIM(G.NUMERO) = TRIM(T.NUMERO_OS)
            WHERE
                O.STATUS_TECNICO = 'ATIVO'
                AND COALESCE(O.OBRIGATORIA_APRESENTACAO, 'S') = 'S'
                {where_sql}
            ORDER BY
                T.DATA_EXECUCAO DESC,
                T.DATA_IMPORTACAO DESC,
                T.ID DESC
        """

        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()

        resultado = []

        for row in rows:
            item = {}

            for index, column in enumerate(columns):
                value = row[index]

                if value is None:
                    item[column] = None
                else:
                    item[column] = str(value)

            resultado.append(item)

        return resultado

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# -*- coding: utf-8 -*-
"""
Endpoints FastAPI - Dashboard de Despesas do Portal Compartilhamento

Como usar no main.py:

    from despesas_endpoints import registrar_endpoints_despesas
    registrar_endpoints_despesas(app, get_connection)

Premissas:
- Existe uma função main.get_connection() no seu projeto retornando conexão SAP HANA.
- Existe uma instância FastAPI chamada app.
- Tabelas utilizadas:
    CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
    CLB349328.PORTAL_COMPARTILHAMENTO_CUSTOS

Regras:
- FISCALIZACAO: PORTAL_COMPARTILHAMENTO_TECNICO.POSTES_EXECUTADOS x VALOR_BASE da categoria FISCALIZACAO por EPS.
- REMOCAO: PORTAL_COMPARTILHAMENTO_TURMA_CAMPO.POSTES_EXECUTADOS x VALOR_BASE da categoria REMOCAO por EPS.
"""


def _json_value(value: Any) -> Any:
    """Converte valores do SAP HANA para tipos serializáveis em JSON."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _rows_to_dicts(cursor, rows) -> List[Dict[str, Any]]:
    columns = [col[0] for col in cursor.description]
    return [
        {columns[index]: _json_value(value) for index, value in enumerate(row)}
        for row in rows
    ]


def _normalizar_sql(campo: str) -> str:
     """ Normaliza nomes de EPS/Empresa para JOIN. Ex.: Dínamo -> DINAMO Orca -> ORC """ 
     normalizado = f""" REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE( REPLACE(UPPER(TRIM({campo})), 'Á','A'), 'À','A'), 'Â','A'), 'Ã','A'), 'É','E'), 'Ê','E'), 'Í','I'), 'Ó','O'), 'Ô','O'), 'Ç','C') """ 
     return f""" CASE WHEN {normalizado} = 'ORCA' THEN 'ORC' ELSE {normalizado} END """


def _base_sql() -> str:
    """
    Base unificada das despesas.
    IMPORTANTE:
    A tabela de custos pode ter mais de uma descrição para a mesma combinação EPS/CATEGORIA_SERVICO.
    Por isso agregamos primeiro por EPS + Categoria para evitar duplicar valores no JOIN.
    """
    eps_custo = _normalizar_sql("EPS")
    empresa_tecnico = _normalizar_sql("T.EMPRESA")
    eps_turma = _normalizar_sql("T.EPS")

    return f"""
        WITH CUSTOS_AGR AS
        (
            SELECT
                {eps_custo} AS EPS_NORM,
                UPPER(TRIM(CATEGORIA_SERVICO)) AS CATEGORIA_SERVICO,
                MAX(VALOR_BASE) AS VALOR_BASE
            FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_CUSTOS"
            WHERE COALESCE(ATIVO, 'S') = 'S'
            GROUP BY
                {eps_custo},
                UPPER(TRIM(CATEGORIA_SERVICO))
        ),
        BASE AS
        (
            SELECT
                'FISCALIZACAO' AS CATEGORIA,
                T.DATA_EXECUCAO,
                T.EMPRESA AS EPS,
                {empresa_tecnico} AS EPS_NORM,
                T.MUNICIPIO,
                T.TIPO_OS,
                T.NUMERO_OS,
                T.TECNICO AS EXECUTOR,
                COALESCE(T.POSTES_EXECUTADOS, 0) AS POSTES_EXECUTADOS,
                C.VALOR_BASE,
                COALESCE(T.POSTES_EXECUTADOS, 0) * C.VALOR_BASE AS VALOR_TOTAL
            FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TECNICO" T
            INNER JOIN CUSTOS_AGR C
                ON {empresa_tecnico} = C.EPS_NORM
               AND C.CATEGORIA_SERVICO = 'FISCALIZACAO'
            WHERE T.DATA_EXECUCAO IS NOT NULL

            UNION ALL

            SELECT
                'REMOCAO' AS CATEGORIA,
                T.DATA_EXECUCAO,
                T.EPS AS EPS,
                {eps_turma} AS EPS_NORM,
                T.MUNICIPIO,
                T.TIPO_OS,
                T.NUMERO_OS,
                T.EQUIPE AS EXECUTOR,
                COALESCE(T.POSTES_EXECUTADOS, 0) AS POSTES_EXECUTADOS,
                C.VALOR_BASE,
                COALESCE(T.POSTES_EXECUTADOS, 0) * C.VALOR_BASE AS VALOR_TOTAL
            FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TURMA_CAMPO" T
            INNER JOIN CUSTOS_AGR C
                ON {eps_turma} = C.EPS_NORM
               AND C.CATEGORIA_SERVICO = 'REMOCAO'
            WHERE T.DATA_EXECUCAO IS NOT NULL
        )
    """


def _filtros_sql(
    periodo: str,
    data_inicial: Optional[str],
    data_final: Optional[str],
    eps: Optional[str],
    municipio: Optional[str],
    categoria: Optional[str],
) -> Tuple[str, List[Any]]:
    filtros: List[str] = []
    params: List[Any] = []

    if periodo == "hoje":
        filtros.append("DATA_EXECUCAO = CURRENT_DATE")
    elif periodo == "ontem":
        filtros.append("DATA_EXECUCAO = ADD_DAYS(CURRENT_DATE, -1)")
    elif periodo == "ultimos_7_dias":
        filtros.append("DATA_EXECUCAO >= ADD_DAYS(CURRENT_DATE, -7)")
    elif periodo == "ultimos_30_dias":
        filtros.append("DATA_EXECUCAO >= ADD_DAYS(CURRENT_DATE, -30)")
    elif periodo == "mes_anterior":
        filtros.append(
            """
            DATA_EXECUCAO BETWEEN
                ADD_MONTHS(ADD_DAYS(CURRENT_DATE, 1 - DAYOFMONTH(CURRENT_DATE)), -1)
                AND ADD_DAYS(ADD_DAYS(CURRENT_DATE, 1 - DAYOFMONTH(CURRENT_DATE)), -1)
            """
        )
    elif periodo == "personalizado":
        if data_inicial:
            filtros.append("DATA_EXECUCAO >= TO_DATE(?)")
            params.append(data_inicial)
        if data_final:
            filtros.append("DATA_EXECUCAO <= TO_DATE(?)")
            params.append(data_final)
    else:
        # padrão: mês atual
        filtros.append(
            """
            DATA_EXECUCAO BETWEEN
                ADD_DAYS(CURRENT_DATE, 1 - DAYOFMONTH(CURRENT_DATE))
                AND CURRENT_DATE
            """
        )

    if eps:
        filtros.append("UPPER(TRIM(EPS)) = UPPER(TRIM(?))")
        params.append(eps)

    if municipio:
        filtros.append("UPPER(TRIM(MUNICIPIO)) LIKE UPPER(TRIM(?))")
        params.append(f"%{municipio}%")

    if categoria:
        filtros.append("UPPER(TRIM(CATEGORIA)) = UPPER(TRIM(?))")
        params.append(categoria)

    where_sql = ""
    if filtros:
        where_sql = " WHERE " + " AND ".join(filtros)

    return where_sql, params


def registrar_endpoints_despesas(app, get_connection):
    """Registra os endpoints de despesas no app FastAPI existente."""

@router.get("/api/despesas/resumo")
def despesas_resumo(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(periodo, data_inicial, data_final, eps, municipio, categoria)

        sql = f"""
            {_base_sql()}
            SELECT
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'FISCALIZACAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_FISCALIZACAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'REMOCAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_REMOCAO,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES_EXECUTADOS,
                COUNT(*) AS REGISTROS,
                COUNT(DISTINCT EPS) AS TOTAL_EPS,
                COUNT(DISTINCT MUNICIPIO) AS TOTAL_MUNICIPIOS,
                COUNT(DISTINCT NUMERO_OS) AS TOTAL_OS
            FROM BASE
            {where_sql}
        """

        cursor.execute(sql, params)
        row = cursor.fetchone()

        valor_total = float(row[0] or 0)
        postes = float(row[3] or 0)

        return {
            "valor_total": valor_total,
            "valor_fiscalizacao": float(row[1] or 0),
            "valor_remocao": float(row[2] or 0),
            "postes_executados": int(postes),
            "registros": int(row[4] or 0),
            "total_eps": int(row[5] or 0),
            "total_municipios": int(row[6] or 0),
            "total_os": int(row[7] or 0),
            "ticket_medio": round(valor_total / postes, 2) if postes > 0 else 0,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/despesas/evolucao")
def despesas_evolucao(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(periodo, data_inicial, data_final, eps, municipio, categoria)

        sql = f"""
            {_base_sql()}
            SELECT
                TO_VARCHAR(DATA_EXECUCAO, 'YYYY-MM') AS MES,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'FISCALIZACAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_FISCALIZACAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'REMOCAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_REMOCAO,
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES_EXECUTADOS
            FROM BASE
            {where_sql}
            GROUP BY TO_VARCHAR(DATA_EXECUCAO, 'YYYY-MM')
            ORDER BY MES
        """

        cursor.execute(sql, params)
        return _rows_to_dicts(cursor, cursor.fetchall())

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/despesas/eps")
def despesas_eps(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(periodo, data_inicial, data_final, eps, municipio, categoria)

        sql = f"""
            {_base_sql()}
            SELECT
                EPS,
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'FISCALIZACAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_FISCALIZACAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'REMOCAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_REMOCAO,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES_EXECUTADOS,
                COUNT(*) AS REGISTROS
            FROM BASE
            {where_sql}
            GROUP BY EPS
            ORDER BY VALOR_TOTAL DESC
        """

        cursor.execute(sql, params)
        return _rows_to_dicts(cursor, cursor.fetchall())

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/despesas/municipios")
def despesas_municipios(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(periodo, data_inicial, data_final, eps, municipio, categoria)

        sql = f"""
            {_base_sql()}
            SELECT TOP 20
                MUNICIPIO,
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES_EXECUTADOS,
                COUNT(*) AS REGISTROS,
                COUNT(DISTINCT EPS) AS TOTAL_EPS
            FROM BASE
            {where_sql}
            GROUP BY MUNICIPIO
            ORDER BY VALOR_TOTAL DESC
        """

        cursor.execute(sql, params)
        return _rows_to_dicts(cursor, cursor.fetchall())

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/despesas/categorias")
def despesas_categorias(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(periodo, data_inicial, data_final, eps, municipio, categoria)

        sql = f"""
            {_base_sql()}
            SELECT
                CATEGORIA,
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES_EXECUTADOS,
                COUNT(*) AS REGISTROS,
                COUNT(DISTINCT EPS) AS TOTAL_EPS,
                COUNT(DISTINCT MUNICIPIO) AS TOTAL_MUNICIPIOS
            FROM BASE
            {where_sql}
            GROUP BY CATEGORIA
            ORDER BY VALOR_TOTAL DESC
        """

        cursor.execute(sql, params)
        return _rows_to_dicts(cursor, cursor.fetchall())

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/despesas/detalhamento")
def despesas_detalhamento(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(periodo, data_inicial, data_final, eps, municipio, categoria)

        sql = f"""
            {_base_sql()}
            SELECT TOP 1000
                CATEGORIA,
                DATA_EXECUCAO,
                EPS,
                MUNICIPIO,
                TIPO_OS,
                NUMERO_OS,
                EXECUTOR,
                POSTES_EXECUTADOS,
                VALOR_BASE,
                VALOR_TOTAL
            FROM BASE
            {where_sql}
            ORDER BY DATA_EXECUCAO DESC, VALOR_TOTAL DESC
        """

        cursor.execute(sql, params)
        return _rows_to_dicts(cursor, cursor.fetchall())

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.get("/api/despesas/filtros")
def despesas_filtros():
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        sql = f"""
            {_base_sql()}
            SELECT
                EPS,
                MUNICIPIO,
                CATEGORIA
            FROM BASE
            GROUP BY EPS, MUNICIPIO, CATEGORIA
        """

        cursor.execute(sql)
        rows = _rows_to_dicts(cursor, cursor.fetchall())

        eps_values = sorted({row.get("EPS") for row in rows if row.get("EPS")})
        municipios_values = sorted({row.get("MUNICIPIO") for row in rows if row.get("MUNICIPIO")})
        categorias_values = sorted({row.get("CATEGORIA") for row in rows if row.get("CATEGORIA")})

        return {
            "eps": eps_values,
            "municipios": municipios_values,
            "categorias": categorias_values,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



# =====================================================
# DESPESAS - GRÁFICOS DIÁRIOS COM FILTROS DINÂMICOS
# =====================================================

def _acrescentar_filtro_categoria(where_sql: str, categoria_fixa: str) -> str:
    """
    Acrescenta filtro fixo de categoria respeitando o WHERE já montado por _filtros_sql.
    Ex.: usado para Fiscalização Diária e Remoção Diária.
    """
    if where_sql and where_sql.strip():
        return f"{where_sql} AND CATEGORIA = '{categoria_fixa}'"
    return f" WHERE CATEGORIA = '{categoria_fixa}'"


@router.get("/api/despesas/fiscalizacao-diaria")
def despesas_fiscalizacao_diaria(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    """
    Retorna a despesa diária de FISCALIZACAO.
    Respeita os mesmos filtros da página de despesas:
    periodo, data_inicial, data_final, eps, municipio e categoria.
    """
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(
            periodo,
            data_inicial,
            data_final,
            eps,
            municipio,
            categoria,
        )
        where_sql = _acrescentar_filtro_categoria(where_sql, "FISCALIZACAO")

        sql = f"""
            {_base_sql()}
            SELECT
                TO_VARCHAR(DATA_EXECUCAO, 'DD/MM') AS DIA,
                DATA_EXECUCAO AS DATA_ORDENACAO,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES,
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL
            FROM BASE
            {where_sql}
            GROUP BY DATA_EXECUCAO
            ORDER BY DATA_ORDENACAO
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "DIA": row[0],
                "POSTES": row[2] or 0,
                "VALOR_TOTAL": float(row[3] or 0),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/despesas/remocao-diaria")
def despesas_remocao_diaria(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    """
    Retorna a despesa diária de REMOCAO.
    Respeita os mesmos filtros da página de despesas:
    periodo, data_inicial, data_final, eps, municipio e categoria.
    """
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(
            periodo,
            data_inicial,
            data_final,
            eps,
            municipio,
            categoria,
        )
        where_sql = _acrescentar_filtro_categoria(where_sql, "REMOCAO")

        sql = f"""
            {_base_sql()}
            SELECT
                TO_VARCHAR(DATA_EXECUCAO, 'DD/MM') AS DIA,
                DATA_EXECUCAO AS DATA_ORDENACAO,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS POSTES,
                COALESCE(SUM(VALOR_TOTAL), 0) AS VALOR_TOTAL
            FROM BASE
            {where_sql}
            GROUP BY DATA_EXECUCAO
            ORDER BY DATA_ORDENACAO
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "DIA": row[0],
                "POSTES": row[2] or 0,
                "VALOR_TOTAL": float(row[3] or 0),
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/despesas/comparativo-diario")
def despesas_comparativo_diario(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    municipio: Optional[str] = None,
    categoria: Optional[str] = None,
):
    """
    Retorna comparativo diário entre FISCALIZACAO e REMOCAO.
    Respeita os mesmos filtros da página de despesas:
    periodo, data_inicial, data_final, eps, municipio e categoria.
    """
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        where_sql, params = _filtros_sql(
            periodo,
            data_inicial,
            data_final,
            eps,
            municipio,
            categoria,
        )

        sql = f"""
            {_base_sql()}
            SELECT
                TO_VARCHAR(DATA_EXECUCAO, 'DD/MM') AS DIA,
                DATA_EXECUCAO AS DATA_ORDENACAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'FISCALIZACAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_FISCALIZACAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'REMOCAO' THEN VALOR_TOTAL ELSE 0 END), 0) AS VALOR_REMOCAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'FISCALIZACAO' THEN POSTES_EXECUTADOS ELSE 0 END), 0) AS POSTES_FISCALIZACAO,
                COALESCE(SUM(CASE WHEN CATEGORIA = 'REMOCAO' THEN POSTES_EXECUTADOS ELSE 0 END), 0) AS POSTES_REMOCAO
            FROM BASE
            {where_sql}
            GROUP BY DATA_EXECUCAO
            ORDER BY DATA_ORDENACAO
        """

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        return [
            {
                "DIA": row[0],
                "VALOR_FISCALIZACAO": float(row[2] or 0),
                "VALOR_REMOCAO": float(row[3] or 0),
                "POSTES_FISCALIZACAO": row[4] or 0,
                "POSTES_REMOCAO": row[5] or 0,
            }
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()





# =====================================================
# EXECUCAO - REGISTROS RECENTES DE TURMA CAMPO
# Endpoint consumido por app/operacao/execucao/page.tsx
# =====================================================
@router.get("/api/execucao/registros-recentes", response_model=List[dict])
def listar_registros_execucao(
    periodo: str = Query("mes_atual"),
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    eps: Optional[str] = None,
    equipe: Optional[str] = None,
    municipio: Optional[str] = None,
):
    """
    Retorna registros recentes da tabela CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO.

    Inclui as métricas operacionais solicitadas:
    - POSTES_EXECUTADOS
    - CABOS_REMOVIDOS
    - CAIXAS_REMOVIDAS
    - POSTE_FORA_OS
    """
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        filtros = []
        params = []

        if periodo == "hoje":
            filtros.append("DATA_EXECUCAO = CURRENT_DATE")
        elif periodo == "ontem":
            filtros.append("DATA_EXECUCAO = ADD_DAYS(CURRENT_DATE, -1)")
        elif periodo == "ultimos_7_dias":
            filtros.append("DATA_EXECUCAO >= ADD_DAYS(CURRENT_DATE, -7)")
        elif periodo == "ultimos_30_dias":
            filtros.append("DATA_EXECUCAO >= ADD_DAYS(CURRENT_DATE, -30)")
        elif periodo == "mes_anterior":
            filtros.append(
                """
                DATA_EXECUCAO BETWEEN
                    ADD_MONTHS(ADD_DAYS(CURRENT_DATE, 1 - DAYOFMONTH(CURRENT_DATE)), -1)
                    AND ADD_DAYS(ADD_DAYS(CURRENT_DATE, 1 - DAYOFMONTH(CURRENT_DATE)), -1)
                """
            )
        elif periodo == "personalizado":
            if data_inicial:
                filtros.append("DATA_EXECUCAO >= TO_DATE(?)")
                params.append(data_inicial)
            if data_final:
                filtros.append("DATA_EXECUCAO <= TO_DATE(?)")
                params.append(data_final)
        else:
            filtros.append(
                """
                DATA_EXECUCAO BETWEEN
                    ADD_DAYS(CURRENT_DATE, 1 - DAYOFMONTH(CURRENT_DATE))
                    AND CURRENT_DATE
                """
            )

        if eps and eps.strip():
            filtros.append("""
                (
                    UPPER(COALESCE(EPS, '')) LIKE UPPER(?)
                    OR
                    UPPER(COALESCE(EQUIPE, '')) LIKE UPPER(?)
                )
            """)
            termo = f"%{eps.strip()}%"
            params.extend([termo, termo])

        if equipe:
            filtros.append("UPPER(COALESCE(EQUIPE, '')) LIKE UPPER(?)")
            params.append(f"%{equipe}%")

        if municipio:
            filtros.append("UPPER(COALESCE(MUNICIPIO, '')) LIKE UPPER(?)")
            params.append(f"%{municipio}%")

        where_sql = ""
        if filtros:
            where_sql = " WHERE " + " AND ".join(filtros)

        sql = f"""
            SELECT TOP 1000
                ID,
                ID_ORIGEM,
                DATA_EXECUCAO,
                DATA_ENVIO,
                EQUIPE,
                RESPONSAVEL,
                EPS,
                TIPO_OS,
                C.NUMERO_OS AS NUMERO_OS,
                MUNICIPIO,
                BAIRRO,
                POSTES_EXECUTADOS,
                CABOS_REMOVIDOS,
                CAIXAS_REMOVIDAS,
                POSTE_FORA_OS,
                OBSERVACAO,
                STATUS_APRESENTACAO,
                DATA_IMPORTACAO,
                USUARIO_IMPORTACAO,
                HASH_NEGOCIO,
                CHAVE_NEGOCIO,
                OSX.TOTAL_EXECUTADO AS OS_POSTES_EXECUTADOS,
                G.QNTD_POSTES AS OS_QNTD_POSTES
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO C
            LEFT JOIN
                (
                    SELECT TRIM(NUMERO_OS) AS NUMERO_OS, SUM(POSTES_EXECUTADOS) AS TOTAL_EXECUTADO
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
                    WHERE COALESCE(TRIM(NUMERO_OS), '') NOT IN ('', '0')
                    GROUP BY TRIM(NUMERO_OS)
                ) OSX
                ON OSX.NUMERO_OS = TRIM(C.NUMERO_OS)
            LEFT JOIN
                U625108.GEOS G
                ON TRIM(G.NUMERO) = TRIM(C.NUMERO_OS)
            {where_sql}
            ORDER BY
                DATA_EXECUCAO DESC,
                DATA_IMPORTACAO DESC,
                ID DESC
        """

        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()

        resultado = []
        for row in rows:
            item = {}
            for index, column in enumerate(columns):
                value = row[index]
                if isinstance(value, Decimal):
                    item[column] = float(value)
                elif isinstance(value, (datetime, date)):
                    item[column] = value.isoformat()
                else:
                    item[column] = value
            resultado.append(item)

        return resultado

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


