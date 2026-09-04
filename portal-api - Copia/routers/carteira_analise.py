# -*- coding: utf-8 -*-
"""
Tabela de apoio do gerador automático da Carteira de Análise Comercial:
tempo médio de execução por atividade (Análise de Entrante, Análise
Cadastral, Documentação, Aprovação, Contratação, Contato com Provedor).

DDL: sql/PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO.sql.

A distribuição em si (quem recebe o quê, prazo factível, carregamento por
responsável) é calculada no front
(components/comercial/gerar-carteira-modal.tsx) a partir dos endpoints de
carteira/analistas que já existem em routers/entrantes.py e
routers/processos.py; aqui só fica o dado de apoio que alimenta essa conta.
"""
from typing import Any, List
from datetime import datetime, date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Body

import main

router = APIRouter()

SCHEMA = "CLB349328"
TB_ATIVIDADE = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"'

_SEED = [
    ("ENTRANTE", "Análise de Entrante", "Triagem inicial do cadastro recebido pelo formulário/e-mail.", 90),
    ("ETAPA_1", "Análise Cadastral", "Conferência dos dados cadastrais do provedor.", 60),
    ("ETAPA_2", "Documentação", "Validação da documentação exigida.", 120),
    ("ETAPA_3", "Aprovação", "Parecer final de aprovação.", 45),
    ("ETAPA_4", "Contratação", "Elaboração e formalização da minuta contratual.", 150),
    ("CONTATO", "Contato com Provedor", "Ligação/e-mail de acompanhamento com o provedor.", 20),
]


def _num(valor: Any) -> Any:
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return valor


def _linhas(cursor) -> List[dict]:
    cols = [c[0] for c in cursor.description]
    return [{cols[i]: _num(v) for i, v in enumerate(r)} for r in cursor.fetchall()]


def _garantir_tabela(cursor) -> None:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {TB_ATIVIDADE}")
        n = cursor.fetchone()[0] or 0
    except Exception:
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_ATIVIDADE}
            (
                "CODIGO_ATIVIDADE" NVARCHAR(20) NOT NULL,
                "NOME" NVARCHAR(120) NOT NULL,
                "DESCRICAO" NVARCHAR(300),
                "TEMPO_MEDIO_MINUTOS" INTEGER NOT NULL,
                "ATIVO" NVARCHAR(1) DEFAULT 'S',
                "UPDATED_AT" LONGDATE CS_LONGDATE,
                "UPDATED_BY" NVARCHAR(100),
                PRIMARY KEY ("CODIGO_ATIVIDADE")
            )
            UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
        n = 0
    if n == 0:
        for codigo, nome, descricao, minutos in _SEED:
            cursor.execute(
                f'INSERT INTO {TB_ATIVIDADE} ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES (?, ?, ?, ?, \'S\')',
                [codigo, nome, descricao, minutos],
            )


@router.get("/api/carteira-analise/atividades", response_model=List[dict])
def listar_atividades():
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela(cursor)
        conn.commit()
        cursor.execute(
            f'SELECT "CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO" FROM {TB_ATIVIDADE} WHERE "ATIVO" = \'S\''
        )
        return _linhas(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/carteira-analise/atividades/{codigo}", response_model=dict)
def atualizar_atividade(codigo: str, payload: dict = Body(...)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _garantir_tabela(cursor)
        cursor.execute(f'SELECT "CODIGO_ATIVIDADE" FROM {TB_ATIVIDADE} WHERE "CODIGO_ATIVIDADE" = ?', [codigo])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Atividade não encontrada")

        minutos = payload.get("tempo_medio_minutos")
        if minutos is not None:
            try:
                minutos = int(round(float(minutos)))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="tempo_medio_minutos deve ser um número positivo")
            if minutos <= 0:
                raise HTTPException(status_code=400, detail="tempo_medio_minutos deve ser um número positivo")
            cursor.execute(
                f'UPDATE {TB_ATIVIDADE} SET "TEMPO_MEDIO_MINUTOS" = ?, "UPDATED_AT" = CURRENT_UTCTIMESTAMP, "UPDATED_BY" = ? WHERE "CODIGO_ATIVIDADE" = ?',
                [minutos, str(payload.get("usuario") or "CLB349328"), codigo],
            )
            conn.commit()

        cursor.execute(
            f'SELECT "CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO" FROM {TB_ATIVIDADE} WHERE "CODIGO_ATIVIDADE" = ?',
            [codigo],
        )
        linhas = _linhas(cursor)
        return {"success": True, "atividade": linhas[0] if linhas else None}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar a atividade: {error}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
