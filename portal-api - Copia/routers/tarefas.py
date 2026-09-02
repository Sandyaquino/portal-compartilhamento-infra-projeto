# -*- coding: utf-8 -*-
"""
Caixa de Tarefas.

Agrega, num so lugar, as pendencias acionaveis de varios modulos
(Projetos, Jornada de Entrantes, Operacao) - "o que eu preciso fazer hoje".
Le as tabelas que ja existem; nao guarda estado proprio.
Espelha mock-api-dev/routes-tarefas.js.

Consumido por app/(app)/tarefas/page.tsx.
"""
from typing import Any, Optional, List
from datetime import datetime, date

from fastapi import APIRouter, Query

import main

router = APIRouter()

SCHEMA = "CLB349328"
_ORDEM_SITUACAO = {"ATRASADO": 0, "VENCENDO": 1, "EM_DIA": 2, "SEM_PRAZO": 3}


def _para_data(prazo: Any) -> Optional[date]:
    if prazo is None:
        return None
    if isinstance(prazo, datetime):
        return prazo.date()
    if isinstance(prazo, date):
        return prazo
    try:
        return datetime.strptime(str(prazo)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _dias_para_prazo(prazo: Any) -> Optional[int]:
    d = _para_data(prazo)
    return (d - date.today()).days if d is not None else None


def _situacao_prazo(prazo: Any) -> str:
    dias = _dias_para_prazo(prazo)
    if dias is None:
        return "SEM_PRAZO"
    if dias < 0:
        return "ATRASADO"
    if dias <= 2:
        return "VENCENDO"
    return "EM_DIA"


def _iso(valor: Any) -> Any:
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return valor


def _tarefa(
    tipo: str,
    entidade: Any,
    titulo: str,
    descricao: Optional[str],
    modulo: str,
    responsavel: Optional[str],
    prioridade: Optional[str],
    prazo: Any,
    link: str,
    data_referencia: Any,
) -> dict:
    data_prazo = _para_data(prazo)
    return {
        "ID": f"{tipo}:{entidade}",
        "TIPO": tipo,
        "TITULO": titulo,
        "DESCRICAO": descricao or None,
        "MODULO": modulo,
        "RESPONSAVEL": responsavel or None,
        "PRIORIDADE": prioridade or None,
        "PRAZO": data_prazo.isoformat() if data_prazo else None,
        "DIAS_PARA_PRAZO": _dias_para_prazo(prazo),
        "SITUACAO_PRAZO": _situacao_prazo(prazo),
        "LINK": link,
        "DATA_REFERENCIA": _iso(data_referencia),
    }


def _coletar(cursor) -> List[dict]:
    """Roda as consultas de cada fonte. Cada bloco e tolerante a falha
    (tabela ainda nao criada, etc.) para nao derrubar a caixa inteira."""
    tarefas: List[dict] = []

    # --- Projetos: analise da carteira + nao atribuidos ---
    try:
        cursor.execute(
            f"""
            SELECT ID_PROJETO, NUMERO_PROJETO,
                   COALESCE(NOME_FANTASIA, RAZAO_SOCIAL) AS NOME,
                   MUNICIPIO, DOCS_VALIDADOS, DOCS_OBRIGATORIOS,
                   PRIORIDADE, RESPONSAVEL_ANALISE, PRAZO_ANALISE, DATA_RECEBIMENTO
            FROM {SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO
            WHERE ATIVO = 'S'
              AND STATUS_PROJETO NOT IN ('CONCLUIDO', 'VINCULADO', 'CANCELADO')
            """
        )
        for (id_p, numero, nome, municipio, docs_v, docs_o, prio, resp, prazo, receb) in cursor.fetchall():
            if resp:
                tarefas.append(
                    _tarefa(
                        "PROJETO_ANALISE", id_p,
                        f"{numero} — {nome}",
                        f"Analisar projeto · docs {docs_v or 0}/{docs_o or 0} · {municipio or '-'}",
                        "Projetos", resp, prio, prazo, f"/projetos/{id_p}", receb,
                    )
                )
            else:
                tarefas.append(
                    _tarefa(
                        "PROJETO_ATRIBUIR", id_p,
                        f"{numero} — {nome}", "Atribuir responsável de análise",
                        "Projetos", None, prio, prazo, "/projetos/carteira", receb,
                    )
                )
    except Exception as error:  # pragma: no cover - defensivo
        print(f"[tarefas] projetos: {error}")

    # --- Projetos: submissoes novas (caixa de entrada) ---
    try:
        cursor.execute(
            f"""
            SELECT ID_SUBMISSAO, ASSUNTO, EMAIL_REMETENTE, DATA_EMAIL
            FROM {SCHEMA}.PORTAL_COMPARTILHAMENTO_PROJETO_SUBMISSAO
            WHERE STATUS_SUBMISSAO = 'NOVO'
            """
        )
        for (id_s, assunto, remetente, data_email) in cursor.fetchall():
            tarefas.append(
                _tarefa(
                    "SUBMISSAO_TRIAR", id_s,
                    assunto or f"Submissão #{id_s}",
                    f"Triar e-mail e gerar projeto · {remetente or '-'}",
                    "Projetos", None, None, None, "/projetos/entrada", data_email,
                )
            )
    except Exception as error:  # pragma: no cover
        print(f"[tarefas] submissoes: {error}")

    # --- Jornada de Entrantes: analise da carteira + nao atribuidos ---
    try:
        cursor.execute(
            f"""
            SELECT ID_ENTRADA, RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, MUNICIPIO, UF,
                   PRIORIDADE, RESPONSAVEL_ANALISE, PRAZO_ANALISE, DATA_RECEBIMENTO
            FROM {SCHEMA}.PORTAL_COMPARTILHAMENTO_ENTRADA
            WHERE ATIVO = 'S'
              AND STATUS_ENTRADA IN ('NOVO', 'ANALISADO')
            """
        )
        for (id_e, razao, fantasia, cnpj, municipio, uf, prio, resp, prazo, receb) in cursor.fetchall():
            titulo = f"{razao or fantasia or 'Entrante'} — {cnpj or ''}".strip()
            if resp:
                tarefas.append(
                    _tarefa(
                        "ENTRANTE_ANALISE", id_e, titulo,
                        f"Analisar entrante · {municipio or '-'}/{uf or '-'}",
                        "Jornada de Entrantes", resp, prio, prazo,
                        f"/comercial/novosentrantes/{id_e}", receb,
                    )
                )
            else:
                tarefas.append(
                    _tarefa(
                        "ENTRANTE_ATRIBUIR", id_e, titulo,
                        "Atribuir responsável de análise",
                        "Jornada de Entrantes", None, prio, prazo,
                        "/comercial/carteira-analise", receb,
                    )
                )
    except Exception as error:  # pragma: no cover
        print(f"[tarefas] entrantes: {error}")

    # --- Operacao: solicitacoes de acao abertas ---
    try:
        cursor.execute(
            f"""
            SELECT S.ID_SOLICITACAO, S.ID_PROVEDOR, S.TIPO_ACAO, S.TIME_RESPONSAVEL,
                   S.DESCRICAO, S.PRIORIDADE, S.RESPONSAVEL_EXECUCAO, S.DATA_SOLICITACAO,
                   COALESCE(PR.NOME_FANTASIA, PR.RAZAO_SOCIAL) AS PROVEDOR
            FROM {SCHEMA}.PORTAL_COMPARTILHAMENTO_SOLICITACAO_ACAO S
            LEFT JOIN {SCHEMA}.PORTAL_COMPARTILHAMENTO_PROVEDOR PR
                ON PR.ID_PROVEDOR = S.ID_PROVEDOR
            WHERE S.STATUS = 'ABERTA'
            """
        )
        for (id_s, id_prov, tipo_acao, time_resp, descricao, prio, resp_exec, data_sol, provedor) in cursor.fetchall():
            tarefas.append(
                _tarefa(
                    "ACAO_EXECUTAR", id_s,
                    f"{tipo_acao} — {provedor or f'Provedor #{id_prov}'}",
                    f"{descricao or 'Executar ação solicitada'} · time {time_resp}",
                    "Operação", resp_exec, prio, None,
                    f"/comercial/provedores/{id_prov}" if id_prov else "/operacao/carteira",
                    data_sol,
                )
            )
    except Exception as error:  # pragma: no cover
        print(f"[tarefas] solicitacoes: {error}")

    return tarefas


def _filtrar(tarefas: List[dict], responsavel: Optional[str]) -> List[dict]:
    if not responsavel:
        return tarefas
    if responsavel == "__sem__":
        return [t for t in tarefas if not t["RESPONSAVEL"]]
    return [t for t in tarefas if t["RESPONSAVEL"] == responsavel]


def _ordenar(tarefas: List[dict]) -> List[dict]:
    # Sem prazo: mais recente primeiro (sort estavel -> aplicado antes).
    ordenadas = sorted(tarefas, key=lambda t: str(t["DATA_REFERENCIA"] or ""), reverse=True)
    ordenadas.sort(
        key=lambda t: (_ORDEM_SITUACAO.get(t["SITUACAO_PRAZO"], 9), t["PRAZO"] or "9999-99-99")
    )
    return ordenadas


@router.get("/api/tarefas", response_model=List[dict])
def listar_tarefas(
    responsavel: Optional[str] = Query(None),
    modulo: Optional[str] = Query(None),
):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        lista = _filtrar(_coletar(cursor), responsavel)
        if modulo:
            lista = [t for t in lista if t["MODULO"] == modulo]
        return _ordenar(lista)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/tarefas/resumo", response_model=dict)
def resumo_tarefas(responsavel: Optional[str] = Query(None)):
    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        lista = _filtrar(_coletar(cursor), responsavel)
        por_modulo: dict = {}
        for tarefa in lista:
            por_modulo[tarefa["MODULO"]] = por_modulo.get(tarefa["MODULO"], 0) + 1
        return {
            "total": len(lista),
            "atrasadas": sum(1 for t in lista if t["SITUACAO_PRAZO"] == "ATRASADO"),
            "vencendo": sum(1 for t in lista if t["SITUACAO_PRAZO"] == "VENCENDO"),
            "sem_prazo": sum(1 for t in lista if t["SITUACAO_PRAZO"] == "SEM_PRAZO"),
            "por_modulo": por_modulo,
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
