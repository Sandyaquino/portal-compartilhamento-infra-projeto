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
from routers.auth import (
    _auth_extrair_bearer_token,
    _auth_validar_token,
    _auth_buscar_usuario_por_email,
    _auth_status_ativo,
)

router = APIRouter()


def _exigir_funcionalidade(request: Request, codigo_funcionalidade: str) -> None:
    """Bloqueia o endpoint com 403 se o perfil do usuário do token não tiver a funcionalidade exigida."""
    token = _auth_extrair_bearer_token(request)
    payload = _auth_validar_token(token)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        usuario = _auth_buscar_usuario_por_email(cursor, payload.get("email", ""))
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if not _auth_status_ativo(usuario.get("STATUS")):
            raise HTTPException(status_code=403, detail="Usuário inativo")

        cursor.execute("""
            SELECT F."CODIGO"
            FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_PERFIL_FUNCIONALIDADE" PF
            JOIN "CLB349328"."PORTAL_COMPARTILHAMENTO_FUNCIONALIDADE" F
                ON F."ID" = PF."FUNCIONALIDADE_ID"
            WHERE PF."PERFIL_ID" = ?
        """, [usuario.get("PERFIL_ID")])
        funcionalidades = [row[0] for row in cursor.fetchall()]

        if codigo_funcionalidade not in funcionalidades:
            raise HTTPException(status_code=403, detail="Sem permissão para editar este cadastro")

        return usuario.get("LOGIN")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.post("/api/tecnico/importar")
async def importar_tecnico(file: UploadFile = File(...)):

    conn = None
    cursor = None

    registros_lidos = 0
    registros_inseridos = 0
    registros_atualizados = 0
    registros_rejeitados = 0
    usuario_importacao = "API"
    erros = []

    try:
        conteudo = await file.read()

        df = pd.read_csv(
            io.BytesIO(conteudo),
            encoding="utf-8-sig",
            sep=None,
            engine="python"
        )

        colunas_esperadas = [
            "EMPRESA",
            "TIPO DE OS",
            "TECNICO DE EQUIPE",
            "MUNICIPIO",
            "BAIRRO",
            "OS DE EXECUCAO",
            "DATA DE EXECUCAO",
            "QUANTIDADE DE POSTES EXECUTADOS",
            "OBSERVACOES",
            "APOIO"
        ]

        colunas_faltantes = [
            c for c in colunas_esperadas if c not in df.columns
        ]

        if colunas_faltantes:
            return {
                "sucesso": False,
                "mensagem": "Estrutura do arquivo inválida.",
                "arquivo": file.filename,
                "estrutura_valida": False,
                "registros_lidos": len(df),
                "registros_inseridos": 0,
                "registros_atualizados": 0,
                "registros_rejeitados": len(df),
                "colunas_encontradas": list(df.columns),
                "colunas_faltantes": colunas_faltantes,
            }

        registros_lidos = len(df)

        conn = main.get_connection()
        cursor = conn.cursor()

        for index, row in df.iterrows():
            try:
                empresa = main.limpar_texto(row["EMPRESA"])
                tipo_os = main.limpar_texto(row["TIPO DE OS"])
                tecnico = main.limpar_texto(row["TECNICO DE EQUIPE"])
                municipio = main.limpar_texto(row["MUNICIPIO"])
                bairro = main.limpar_texto(row["BAIRRO"])
                numero_os = main.limpar_texto(row["OS DE EXECUCAO"])
                data_execucao = main.converter_data(row["DATA DE EXECUCAO"])
                qtd_postes = main.limpar_inteiro(row["QUANTIDADE DE POSTES EXECUTADOS"])
                observacao = main.limpar_texto(row.get("OBSERVACOES"))
                apoio = main.limpar_texto(row.get("APOIO"))

                if not numero_os or numero_os == "0" or not data_execucao or not tecnico:
                    registros_rejeitados += 1
                    erros.append({
                        "linha": int(index) + 2,
                        "erro": "Campos obrigatórios ausentes ou OS DE EXECUCAO inválida (vazia ou '0')."
                    })
                    continue

                chave_negocio = f"{numero_os}|{data_execucao}|{tecnico}"

                cursor.execute("""
                    SELECT ID
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
                    WHERE CHAVE_NEGOCIO = ?
                """, [chave_negocio])

                existe = cursor.fetchone()

                if existe:
                    cursor.execute("""
                        UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
                        SET
                            EMPRESA = ?,
                            TIPO_OS = ?,
                            TECNICO = ?,
                            MUNICIPIO = ?,
                            BAIRRO = ?,
                            POSTES_EXECUTADOS = ?,
                            OBSERVACAO = ?,
                            APOIO = ?,
                            DATA_IMPORTACAO = ?,
                            USUARIO_IMPORTACAO = ?
                        WHERE CHAVE_NEGOCIO = ?
                    """, [
                        empresa,
                        tipo_os,
                        tecnico,
                        municipio,
                        bairro,
                        qtd_postes,
                        observacao,
                        apoio,
                        datetime.now(),
                        usuario_importacao,
                        chave_negocio
                    ])

                    registros_atualizados += 1

                else:
                    cursor.execute("""
                        INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO (
                            EMPRESA,
                            TIPO_OS,
                            NUMERO_OS,
                            TECNICO,
                            MUNICIPIO,
                            BAIRRO,
                            DATA_EXECUCAO,
                            POSTES_EXECUTADOS,
                            OBSERVACAO,
                            APOIO,
                            DATA_IMPORTACAO,
                            USUARIO_IMPORTACAO,
                            CHAVE_NEGOCIO
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, [
                        empresa,
                        tipo_os,
                        numero_os,
                        tecnico,
                        municipio,
                        bairro,
                        data_execucao,
                        qtd_postes,
                        observacao,
                        apoio,
                        datetime.now(),
                        usuario_importacao,
                        chave_negocio
                    ])

                    registros_inseridos += 1

            except Exception as erro_linha:
                registros_rejeitados += 1
                erros.append({
                    "linha": int(index) + 2,
                    "erro": str(erro_linha),
                })

        status_importacao = "SUCESSO_PARCIAL" if registros_rejeitados > 0 else "SUCESSO"
        observacao_log = str(erros[:20]) if erros else None

        cursor.execute("""
            INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_IMPORTACAO
            (
                NOME_ARQUIVO,
                DATA_IMPORTACAO,
                USUARIO_IMPORTACAO,
                REGISTROS_LIDOS,
                REGISTROS_INSERIDOS,
                REGISTROS_ATUALIZADOS,
                REGISTROS_REJEITADOS,
                STATUS_IMPORTACAO,
                OBSERVACAO
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            file.filename,
            datetime.now(),
            usuario_importacao,
            registros_lidos,
            registros_inseridos,
            registros_atualizados,
            registros_rejeitados,
            status_importacao,
            observacao_log,
        ])

        conn.commit()

        return {
            "sucesso": True,
            "mensagem": "Importação técnica realizada com sucesso.",
            "arquivo": file.filename,
            "estrutura_valida": True,
            "registros_lidos": registros_lidos,
            "registros_inseridos": registros_inseridos,
            "registros_atualizados": registros_atualizados,
            "registros_rejeitados": registros_rejeitados,
            "status_importacao": status_importacao,
            "erros": erros[:20],
            "lidos": registros_lidos,
            "inseridos": registros_inseridos,
            "atualizados": registros_atualizados,
            "rejeitados": registros_rejeitados,
        }

    except Exception as erro:
        if conn:
            conn.rollback()

        try:
            if conn and cursor:
                cursor.execute("""
                    INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_IMPORTACAO
                    (
                        NOME_ARQUIVO,
                        DATA_IMPORTACAO,
                        USUARIO_IMPORTACAO,
                        REGISTROS_LIDOS,
                        REGISTROS_INSERIDOS,
                        REGISTROS_ATUALIZADOS,
                        REGISTROS_REJEITADOS,
                        STATUS_IMPORTACAO,
                        OBSERVACAO
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    file.filename if file else None,
                    datetime.now(),
                    usuario_importacao,
                    registros_lidos,
                    registros_inseridos,
                    registros_atualizados,
                    registros_rejeitados,
                    "ERRO",
                    str(erro),
                ])
                conn.commit()
        except Exception:
            pass

        return {
            "sucesso": False,
            "mensagem": "Erro ao processar importação técnica.",
            "erro": str(erro),
            "registros_lidos": registros_lidos,
            "registros_inseridos": registros_inseridos,
            "registros_atualizados": registros_atualizados,
            "registros_rejeitados": registros_rejeitados,
            "lidos": registros_lidos,
            "inseridos": registros_inseridos,
            "atualizados": registros_atualizados,
            "rejeitados": registros_rejeitados,
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



@router.get("/api/tecnico/consolidado")
def consolidado_tecnico():

    conn = main.get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                COUNT(*) AS REGISTROS_PROCESSADOS,
                COUNT(DISTINCT NUMERO_OS) AS TOTAL_OS,
                COUNT(DISTINCT TECNICO) AS TOTAL_TECNICOS,
                COALESCE(SUM(POSTES_EXECUTADOS), 0) AS TOTAL_POSTES_EXECUTADOS,
                MAX(DATA_IMPORTACAO) AS ULTIMA_IMPORTACAO_REGISTRO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
        """)

        row_registros = cursor.fetchone()

        cursor.execute("""
            SELECT
                COUNT(*) AS TOTAL_IMPORTACOES,
                COALESCE(SUM(REGISTROS_REJEITADOS), 0) AS TOTAL_REJEITADOS,
                MAX(DATA_IMPORTACAO) AS ULTIMA_IMPORTACAO_LOG
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_IMPORTACAO
        """)

        row_importacoes = cursor.fetchone()

        ultima_importacao_log = row_importacoes[2] if row_importacoes else None
        ultima_importacao_registro = row_registros[4] if row_registros else None

        return {
            "TOTAL_IMPORTACOES": row_importacoes[0] if row_importacoes and row_importacoes[0] is not None else 0,
            "REGISTROS_PROCESSADOS": row_registros[0] if row_registros and row_registros[0] is not None else 0,
            "TOTAL_OS": row_registros[1] if row_registros and row_registros[1] is not None else 0,
            "TOTAL_TECNICOS": row_registros[2] if row_registros and row_registros[2] is not None else 0,
            "TOTAL_POSTES_EXECUTADOS": row_registros[3] if row_registros and row_registros[3] is not None else 0,
            "ULTIMA_IMPORTACAO": ultima_importacao_log or ultima_importacao_registro,
            "TOTAL_REJEITADOS": row_importacoes[1] if row_importacoes and row_importacoes[1] is not None else 0
        }

    finally:
        cursor.close()
        conn.close()

@router.get("/api/tecnico/importacoes")
def listar_importacoes_tecnico():

    conn = main.get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute("""
            SELECT
                ID,
                NOME_ARQUIVO,
                DATA_IMPORTACAO,
                USUARIO_IMPORTACAO,
                REGISTROS_LIDOS,
                REGISTROS_INSERIDOS,
                REGISTROS_ATUALIZADOS,
                REGISTROS_REJEITADOS,
                STATUS_IMPORTACAO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO_IMPORTACAO
            ORDER BY DATA_IMPORTACAO DESC
        """)

        colunas = [col[0] for col in cursor.description]

        return [
            dict(zip(colunas, row))
            for row in cursor.fetchall()
        ]

    finally:
        cursor.close()
        conn.close()


@router.get("/api/tecnico/registros")
def listar_registros_tecnico():

    conn = main.get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute("""
            SELECT
                ID,
                ID_ORIGEM,
                EMPRESA,
                TIPO_OS,
                NUMERO_OS,
                TECNICO,
                MUNICIPIO,
                BAIRRO,
                DATA_EXECUCAO,
                POSTES_EXECUTADOS,
                OBSERVACAO,
                APOIO,
                STATUS_APRESENTACAO,
                DATA_IMPORTACAO,
                USUARIO_IMPORTACAO,
                HASH_NEGOCIO,
                CHAVE_NEGOCIO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
            ORDER BY DATA_IMPORTACAO DESC
        """)

        colunas = [col[0] for col in cursor.description]

        registros = [
            dict(zip(colunas, row))
            for row in cursor.fetchall()
        ]

        return registros

    except Exception as e:
        return {
            "erro": str(e)
        }

    finally:
        cursor.close()
        conn.close()




@router.post("/api/turma-campo/importar")
async def importar_turma_campo(
    file: UploadFile = File(...)
):
    conn = None
    cursor = None

    registros_lidos = 0
    registros_inseridos = 0
    registros_atualizados = 0
    registros_rejeitados = 0
    usuario_importacao = "CLB349328"

    try:
        conteudo = await file.read()

        df = pd.read_csv(
            io.BytesIO(conteudo),
            encoding="utf-8-sig",
            sep=None,
            engine="python"
        )

        colunas_esperadas = [
            "ID",
            "Title",
            "DATA_EXECUCAO",
            "DATA_ENVIO",
            "EQUIPE",
            "RESPONSAVEL",
            "EPS",
            "TIPO_OS",
            "NUMERO_OS",
            "MUNICIPIO",
            "BAIRRO",
            "POSTES_EXECUTADOS",
            "CABOS_REMOVIDOS",
            "CAIXAS_REMOVIDAS",
            "POSTE_FORA_OS",
            "OBSERVACAO",
            "STATUS_APRESENTACAO",
        ]

        colunas_csv = list(df.columns)

        colunas_faltantes = [
            coluna
            for coluna in colunas_esperadas
            if coluna not in colunas_csv
        ]

        if len(colunas_faltantes) > 0:
            return {
                "sucesso": False,
                "mensagem": "Estrutura do arquivo inválida.",
                "arquivo": file.filename,
                "estrutura_valida": False,
                "registros_lidos": len(df),
                "registros_inseridos": 0,
                "registros_atualizados": 0,
                "registros_rejeitados": len(df),
                "colunas_encontradas": colunas_csv,
                "colunas_faltantes": colunas_faltantes,
            }

        registros_lidos = len(df)
        erros = []

        conn = main.get_connection()
        cursor = conn.cursor()

        for index, row in df.iterrows():
            try:
                id_origem = main.limpar_texto(
                    row["ID"]
                )

                data_execucao = main.converter_data(
                    row["DATA_EXECUCAO"]
                )

                data_envio = main.converter_timestamp(
                    row["DATA_ENVIO"]
                )

                equipe = main.limpar_texto(
                    row["EQUIPE"]
                )

                responsavel = main.limpar_texto(
                    row["RESPONSAVEL"]
                )

                eps = main.limpar_texto(
                    row["EPS"]
                )

                tipo_os = main.limpar_texto(
                    row["TIPO_OS"]
                )

                numero_os = main.limpar_texto(
                    row["NUMERO_OS"]
                )

                municipio = main.limpar_texto(
                    row["MUNICIPIO"]
                )

                bairro = main.limpar_texto(
                    row["BAIRRO"]
                )

                postes_executados = main.limpar_inteiro(
                    row["POSTES_EXECUTADOS"]
                )

                cabos_removidos = main.limpar_decimal(
                    row["CABOS_REMOVIDOS"]
                )

                caixas_removidas = main.limpar_inteiro(
                    row["CAIXAS_REMOVIDAS"]
                )

                poste_fora_os = main.limpar_inteiro(
                    row["POSTE_FORA_OS"]
                )

                observacao = main.limpar_texto(
                    row["OBSERVACAO"]
                )

                status_apresentacao = main.limpar_texto(
                    row["STATUS_APRESENTACAO"]
                )

                if (
                    not data_execucao
                    or not equipe
                    or not numero_os
                    or numero_os == "0"
                    or not municipio
                    or not status_apresentacao
                ):
                    registros_rejeitados += 1

                    erros.append({
                        "linha": int(index) + 2,
                        "erro": "Campos obrigatórios ausentes ou NUMERO_OS inválido (vazio ou '0'): DATA_EXECUCAO, EQUIPE, NUMERO_OS, MUNICIPIO ou STATUS_APRESENTACAO."
                    })

                    continue

                data_execucao_str = data_execucao.strftime(
                    "%Y-%m-%d"
                )

                chave_negocio = (
                    f"{numero_os}|{data_execucao_str}|{equipe}"
                )

                cursor.execute(
                    """
                    SELECT ID
                    FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
                    WHERE CHAVE_NEGOCIO = ?
                    """,
                    [
                        chave_negocio
                    ]
                )

                registro = cursor.fetchone()

                if registro:
                    cursor.execute(
                        """
                        UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
                        SET
                            ID_ORIGEM = ?,
                            DATA_EXECUCAO = ?,
                            DATA_ENVIO = ?,
                            EQUIPE = ?,
                            RESPONSAVEL = ?,
                            EPS = ?,
                            TIPO_OS = ?,
                            NUMERO_OS = ?,
                            MUNICIPIO = ?,
                            BAIRRO = ?,
                            POSTES_EXECUTADOS = ?,
                            CABOS_REMOVIDOS = ?,
                            CAIXAS_REMOVIDAS = ?,
                            POSTE_FORA_OS = ?,
                            OBSERVACAO = ?,
                            STATUS_APRESENTACAO = ?,
                            DATA_IMPORTACAO = ?,
                            USUARIO_IMPORTACAO = ?
                        WHERE CHAVE_NEGOCIO = ?
                        """,
                        [
                            id_origem,
                            data_execucao,
                            data_envio,
                            equipe,
                            responsavel,
                            eps,
                            tipo_os,
                            numero_os,
                            municipio,
                            bairro,
                            postes_executados,
                            cabos_removidos,
                            caixas_removidas,
                            poste_fora_os,
                            observacao,
                            status_apresentacao,
                            datetime.now(),
                            usuario_importacao,
                            chave_negocio,
                        ]
                    )

                    registros_atualizados += 1

                else:
                    cursor.execute(
                        """
                        INSERT INTO CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
                        (
                            ID_ORIGEM,
                            DATA_EXECUCAO,
                            DATA_ENVIO,
                            EQUIPE,
                            RESPONSAVEL,
                            EPS,
                            TIPO_OS,
                            NUMERO_OS,
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
                            CHAVE_NEGOCIO
                        )
                        VALUES
                        (
                            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                            ?, ?, ?, ?, ?, ?, ?, ?, ?
                        )
                        """,
                        [
                            id_origem,
                            data_execucao,
                            data_envio,
                            equipe,
                            responsavel,
                            eps,
                            tipo_os,
                            numero_os,
                            municipio,
                            bairro,
                            postes_executados,
                            cabos_removidos,
                            caixas_removidas,
                            poste_fora_os,
                            observacao,
                            status_apresentacao,
                            datetime.now(),
                            usuario_importacao,
                            chave_negocio,
                        ]
                    )

                    registros_inseridos += 1

            except Exception as erro_linha:
                registros_rejeitados += 1

                erros.append({
                    "linha": int(index) + 2,
                    "erro": str(erro_linha),
                })

        if registros_rejeitados > 0:
            status_importacao = "SUCESSO_PARCIAL"
        else:
            status_importacao = "SUCESSO"

        observacao_log = None

        if len(erros) > 0:
            observacao_log = str(erros[:20])

        cursor.execute(
            """
            INSERT INTO
            CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO_IMPORTACAO
            (
                NOME_ARQUIVO,
                DATA_IMPORTACAO,
                USUARIO_IMPORTACAO,
                REGISTROS_LIDOS,
                REGISTROS_INSERIDOS,
                REGISTROS_ATUALIZADOS,
                REGISTROS_REJEITADOS,
                STATUS_IMPORTACAO,
                OBSERVACAO
            )
            VALUES
            (
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            """,
            [
                file.filename,
                datetime.now(),
                usuario_importacao,
                registros_lidos,
                registros_inseridos,
                registros_atualizados,
                registros_rejeitados,
                status_importacao,
                observacao_log,
            ]
        )

        conn.commit()

        return {
            "sucesso": True,
            "mensagem": "Importação realizada com sucesso.",
            "arquivo": file.filename,
            "estrutura_valida": True,
            "registros_lidos": registros_lidos,
            "registros_inseridos": registros_inseridos,
            "registros_atualizados": registros_atualizados,
            "registros_rejeitados": registros_rejeitados,
            "status_importacao": status_importacao,
            "erros": erros[:20],
        }

    except Exception as erro:
        if conn:
            conn.rollback()

        try:
            if conn and cursor:
                cursor.execute(
                    """
                    INSERT INTO
                    CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO_IMPORTACAO
                    (
                        NOME_ARQUIVO,
                        DATA_IMPORTACAO,
                        USUARIO_IMPORTACAO,
                        REGISTROS_LIDOS,
                        REGISTROS_INSERIDOS,
                        REGISTROS_ATUALIZADOS,
                        REGISTROS_REJEITADOS,
                        STATUS_IMPORTACAO,
                        OBSERVACAO
                    )
                    VALUES
                    (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    [
                        file.filename if file else None,
                        datetime.now(),
                        usuario_importacao,
                        registros_lidos,
                        registros_inseridos,
                        registros_atualizados,
                        registros_rejeitados,
                        "ERRO",
                        str(erro),
                    ]
                )

                conn.commit()

        except Exception:
            pass

        return {
            "sucesso": False,
            "mensagem": "Erro ao processar importação.",
            "erro": str(erro),
            "registros_lidos": registros_lidos,
            "registros_inseridos": registros_inseridos,
            "registros_atualizados": registros_atualizados,
            "registros_rejeitados": registros_rejeitados,
        }

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/turma-campo/importacoes")
def listar_importacoes():
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                ID,
                NOME_ARQUIVO,
                DATA_IMPORTACAO,
                USUARIO_IMPORTACAO,
                REGISTROS_LIDOS,
                REGISTROS_INSERIDOS,
                REGISTROS_ATUALIZADOS,
                REGISTROS_REJEITADOS,
                STATUS_IMPORTACAO
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO_IMPORTACAO
            ORDER BY
                DATA_IMPORTACAO DESC
            """
        )

        columns = [
            col[0]
            for col in cursor.description
        ]

        rows = cursor.fetchall()

        result = [
            dict(zip(columns, row))
            for row in rows
        ]

        return result

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()

@router.get("/api/turma-campo/consolidado")
def consolidado():

    conn = None
    cursor = None

    try:

        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute("""

            SELECT
                COUNT(*) TOTAL_IMPORTACOES,
                COALESCE(
                    SUM(REGISTROS_LIDOS),
                    0
                ) REGISTROS_PROCESSADOS,
                COALESCE(
                    SUM(REGISTROS_REJEITADOS),
                    0
                ) TOTAL_REJEITADOS,
                MAX(DATA_IMPORTACAO)
                    ULTIMA_IMPORTACAO
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO_IMPORTACAO

        """)

        columns = [
            col[0]
            for col in cursor.description
        ]

        rows = cursor.fetchall()

        resultado = [
            dict(zip(columns, row))
            for row in rows
        ]

        return resultado

    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()


@router.get("/api/turma-campo/consolidado_tabela")
def consolidado_tabela():

    conn = None
    cursor = None

    try:

        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute("""

        SELECT *
        FROM
        CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
        ORDER BY
        DATA_IMPORTACAO DESC

        """)

        columns = [
            col[0]
            for col in cursor.description
        ]

        rows = cursor.fetchall()

        resultado = [
            dict(zip(columns, row))
            for row in rows
        ]

        return resultado

    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()



@router.get("/api/turma-campo/registros")
def listar_registros_turma_campo():
    conn = None
    cursor = None

    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT TOP 1000
                ID,
                ID_ORIGEM,
                DATA_EXECUCAO,
                DATA_ENVIO,
                EQUIPE,
                RESPONSAVEL,
                EPS,
                TIPO_OS,
                NUMERO_OS,
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
                CHAVE_NEGOCIO
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
            ORDER BY
                DATA_IMPORTACAO DESC,
                DATA_EXECUCAO DESC,
                ID DESC
            """
        )

        columns = [
            col[0]
            for col in cursor.description
        ]

        rows = cursor.fetchall()

        result = []

        for row in rows:
            item = {}

            for index, column in enumerate(columns):
                value = row[index]

                if value is None:
                    item[column] = None
                else:
                    item[column] = str(value)

            result.append(item)

        return result

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()

@router.get("/api/turma-oficial")
def listar_turmas_oficiais():

    conn = None
    cursor = None

    try:

        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                ID,
                EQUIPE,
                EQUIPE_FORMS,
                SUPERINTENDENCIA,
                EPS,
                STATUS_TURMA,
                DATA_ATIVACAO,
                DATA_DESATIVACAO,
                OBSERVACAO
            FROM
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL
            ORDER BY
                EQUIPE
        """)

        columns = [
            col[0]
            for col in cursor.description
        ]

        rows = cursor.fetchall()

        resultado = [
            dict(zip(columns, row))
            for row in rows
        ]

        return resultado

    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()



@router.get("/api/turma-oficial/consolidado")
def consolidado_turma_oficial():

    conn = None
    cursor = None

    try:

        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                COUNT(*) TOTAL_TURMAS,
                SUM(
                    CASE
                        WHEN STATUS_TURMA = 'ATIVA' THEN 1
                        ELSE 0
                    END
                ) TURMAS_ATIVAS,
                SUM(
                    CASE
                        WHEN STATUS_TURMA = 'INATIVA' THEN 1
                        ELSE 0
                    END
                ) TURMAS_INATIVAS
            FROM
            CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL
        """)

        columns = [
            col[0]
            for col in cursor.description
        ]

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


@router.put("/api/turma-oficial/{id}/ativar")
def ativar_turma(id: int):

    conn = None
    cursor = None

    try:

        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL
            SET
                STATUS_TURMA = 'ATIVA',
                DATA_ATIVACAO = CURRENT_TIMESTAMP,
                DATA_DESATIVACAO = NULL
            WHERE
                ID = ?
        """, [id])

        conn.commit()

        return {
            "sucesso": True
        }

    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()

@router.put("/api/turma-oficial/{id}/inativar")
def inativar_turma(id: int):

    conn = None
    cursor = None

    try:

        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE
                CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL
            SET
                STATUS_TURMA = 'INATIVA',
                DATA_DESATIVACAO = CURRENT_TIMESTAMP
            WHERE
                ID = ?
        """, [id])

        conn.commit()

        return {
            "sucesso": True
        }

    finally:

        if cursor:
            cursor.close()

        if conn:
            conn.close()




# =====================================================
# DASHBOARD OPERACIONAL
# =====================================================


def montar_filtros_dashboard(
    periodo="mes_atual",
    data_inicial=None,
    data_final=None,
    eps=None,
    equipe=None,
    municipio=None,
    alias_campo="C",
    alias_oficial="O",
    incluir_periodo=True,
    incluir_municipio=True,
):
    """
    Monta filtros reutilizáveis para os endpoints do dashboard operacional.

    Regras de negócio:
    - PORTAL_COMPARTILHAMENTO_TURMA_OFICIAL representa as turmas oficiais.
    - PORTAL_COMPARTILHAMENTO_TURMA_CAMPO representa os apontamentos diários.
    - A interseção correta é:
        CAMPO.EQUIPE = OFICIAL.EQUIPE_FORMS
    """

    filtros = []
    params = []

    coluna_data = f"{alias_campo}.DATA_EXECUCAO"

    if incluir_periodo:
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

    if eps:
        filtros.append(f"UPPER({alias_oficial}.EPS) = UPPER(?)")
        params.append(eps)

    if equipe:
        filtros.append(f"UPPER({alias_oficial}.EQUIPE_FORMS) LIKE UPPER(?)")
        params.append(f"%{equipe}%")

    if municipio and incluir_municipio:
        filtros.append(f"UPPER({alias_campo}.MUNICIPIO) LIKE UPPER(?)")
        params.append(f"%{municipio}%")

    where_sql = ""
    if filtros:
        where_sql = " AND " + " AND ".join(filtros)

    return where_sql, params


# =====================================================
# Edição de registros importados (correção manual, com
# permissão por funcionalidade de perfil)
# =====================================================

class RegistroTecnicoUpdate(BaseModel):
    MUNICIPIO: Optional[str] = None
    BAIRRO: Optional[str] = None
    POSTES_EXECUTADOS: Optional[int] = None
    OBSERVACAO: Optional[str] = None
    STATUS_APRESENTACAO: Optional[str] = None


class RegistroTurmaCampoUpdate(BaseModel):
    MUNICIPIO: Optional[str] = None
    BAIRRO: Optional[str] = None
    POSTES_EXECUTADOS: Optional[int] = None
    CABOS_REMOVIDOS: Optional[float] = None
    CAIXAS_REMOVIDAS: Optional[int] = None
    OBSERVACAO: Optional[str] = None
    STATUS_APRESENTACAO: Optional[str] = None


@router.put("/api/tecnico/registro/{id}")
def editar_registro_tecnico(id: int = Path(...), dados: RegistroTecnicoUpdate = Body(...), request: Request = None):
    usuario_login = _exigir_funcionalidade(request, "EDITAR_CADASTRO_TECNICO")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT ID FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO WHERE ID = ?",
            [id],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Registro não encontrado")

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO
            SET MUNICIPIO = ?, BAIRRO = ?, POSTES_EXECUTADOS = ?, OBSERVACAO = ?,
                STATUS_APRESENTACAO = ?, USUARIO_EDICAO = ?, DATA_EDICAO = CURRENT_TIMESTAMP
            WHERE ID = ?
            """,
            [
                dados.MUNICIPIO, dados.BAIRRO, dados.POSTES_EXECUTADOS, dados.OBSERVACAO,
                dados.STATUS_APRESENTACAO, usuario_login, id,
            ],
        )
        conn.commit()

        cursor.execute(
            """
            SELECT ID, MUNICIPIO, BAIRRO, POSTES_EXECUTADOS, OBSERVACAO, STATUS_APRESENTACAO,
                   USUARIO_EDICAO, DATA_EDICAO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TECNICO WHERE ID = ?
            """,
            [id],
        )
        colunas = [col[0] for col in cursor.description]
        registro = dict(zip(colunas, cursor.fetchone()))

        return {"success": True, "registro": registro}
    except HTTPException:
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao editar registro: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/api/turma-campo/registro/{id}")
def editar_registro_turma_campo(id: int = Path(...), dados: RegistroTurmaCampoUpdate = Body(...), request: Request = None):
    usuario_login = _exigir_funcionalidade(request, "EDITAR_CADASTRO_EQUIPE")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT ID FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO WHERE ID = ?",
            [id],
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Registro não encontrado")

        cursor.execute(
            """
            UPDATE CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO
            SET MUNICIPIO = ?, BAIRRO = ?, POSTES_EXECUTADOS = ?, CABOS_REMOVIDOS = ?,
                CAIXAS_REMOVIDAS = ?, OBSERVACAO = ?, STATUS_APRESENTACAO = ?,
                USUARIO_EDICAO = ?, DATA_EDICAO = CURRENT_TIMESTAMP
            WHERE ID = ?
            """,
            [
                dados.MUNICIPIO, dados.BAIRRO, dados.POSTES_EXECUTADOS, dados.CABOS_REMOVIDOS,
                dados.CAIXAS_REMOVIDAS, dados.OBSERVACAO, dados.STATUS_APRESENTACAO,
                usuario_login, id,
            ],
        )
        conn.commit()

        cursor.execute(
            """
            SELECT ID, MUNICIPIO, BAIRRO, POSTES_EXECUTADOS, CABOS_REMOVIDOS, CAIXAS_REMOVIDAS,
                   OBSERVACAO, STATUS_APRESENTACAO, USUARIO_EDICAO, DATA_EDICAO
            FROM CLB349328.PORTAL_COMPARTILHAMENTO_TURMA_CAMPO WHERE ID = ?
            """,
            [id],
        )
        colunas = [col[0] for col in cursor.description]
        registro = dict(zip(colunas, cursor.fetchone()))

        return {"success": True, "registro": registro}
    except HTTPException:
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao editar registro: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()




