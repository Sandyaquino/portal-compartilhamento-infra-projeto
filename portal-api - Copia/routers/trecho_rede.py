# -*- coding: utf-8 -*-
"""
Rede de distribuição (trechos de média e baixa tensão) e a análise de
"postes na rota não faturados".

Espelha o mock (mock-api-dev/routes-trecho-rede.js) — mesmas rotas e
formatos, o frontend (app/(app)/mapa-postes/rede) não muda.

DDL: sql/PORTAL_COMPARTILHAMENTO_TRECHO_REDE.sql. A tabela se auto-cria
vazia na primeira chamada; a carga dos trechos é feita à parte (extração
do GIS). Sem trechos carregados, os endpoints respondem zerado.

Lógica da análise
-----------------
Monta o grafo (nós = barramentos, arestas = trechos MT/BT) no escopo
escolhido (município [+ alimentador] [+ tipo]). Para cada nó SEM ocupação
declarada, faz uma BFS que só atravessa outros nós sem ocupação; ao
esbarrar num nó ocupado, registra-o como "extremo". Se o nó está entre
dois extremos (lados diferentes), com poucos trechos, mesmo alimentador e
vão curto, ele é sinalizado:
  - modo MESMO_PROVEDOR: os dois extremos precisam ter um provedor em
    comum (a fibra desse provedor teoricamente passa pelo nó do meio).
  - modo CORREDOR: basta os dois extremos terem qualquer provedor.
"""
import math
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query

import main

router = APIRouter()

SCHEMA = "CLB349328"
TB_TRECHO = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE"'
TB_OCUPACAO = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO"'
TB_OPERADORA = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_OPERADORA"'

ENTIDADES = ("TRECHO DE MT", "TRECHO DE BT")


def _num(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def _rows(cursor) -> List[dict]:
    cols = [c[0] for c in cursor.description]
    return [{cols[i]: _num(v) for i, v in enumerate(r)} for r in cursor.fetchall()]


def _conn():
    conn = main.get_connection()
    return conn, conn.cursor()


def _tabela_existe(cursor, tabela: str) -> bool:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {tabela}")
        cursor.fetchone()
        return True
    except Exception:
        return False


def _garantir_tabela(cursor) -> None:
    if _tabela_existe(cursor, TB_TRECHO):
        return
    cursor.execute(
        f"""
        CREATE COLUMN TABLE {TB_TRECHO} (
            "ID_TRECHO"           BIGINT NOT NULL,
            "MUNICIPIO"           NVARCHAR(120),
            "ID_TBT"             BIGINT,
            "PG_INICIAL"          BIGINT,
            "PG_FINAL"            BIGINT,
            "BARRAMENTO_INICIAL"  NVARCHAR(50),
            "LONGITUDE_INICIAL"   DECIMAL(18,10),
            "LATITUDE_INICIAL"    DECIMAL(18,10),
            "BARRAMENTO_FINAL"    NVARCHAR(50),
            "LONGITUDE_FINAL"     DECIMAL(18,10),
            "LATITUDE_FINAL"      DECIMAL(18,10),
            "ALIMENTADOR"         NVARCHAR(30),
            "EXTENSAO_M"          DECIMAL(12,2),
            "ENTIDADE"            NVARCHAR(20),
            "DATA_ATUALIZACAO"    LONGDATE CS_LONGDATE,
            "CARGA_ID"            NVARCHAR(40),
            "ATIVO"             NVARCHAR(1) DEFAULT 'S',
            "CREATED_AT"          LONGDATE CS_LONGDATE,
            PRIMARY KEY ("ID_TRECHO")
        )
        """
    )
    for col in ("BARRAMENTO_INICIAL", "BARRAMENTO_FINAL", "ALIMENTADOR", "MUNICIPIO", "ENTIDADE"):
        try:
            cursor.execute(
                f'CREATE INDEX "IX_TRECHOREDE_{col[:12]}" ON {TB_TRECHO} ("{col}")'
            )
        except Exception:
            pass


def _mts(ax: float, ay: float, bx: float, by: float) -> float:
    return math.hypot((ay - by) * 111000.0, (ax - bx) * 108000.0)


# ------------------------------------------------------------------
# Carga do escopo + grafo
# ------------------------------------------------------------------
def _carregar_trechos(cursor, municipio: str, alimentador: Optional[str], entidade: Optional[str]) -> List[dict]:
    sql = f"""
        SELECT "ID_TRECHO", "MUNICIPIO", "BARRAMENTO_INICIAL", "LONGITUDE_INICIAL", "LATITUDE_INICIAL",
               "BARRAMENTO_FINAL", "LONGITUDE_FINAL", "LATITUDE_FINAL", "ALIMENTADOR",
               "EXTENSAO_M", "ENTIDADE"
        FROM {TB_TRECHO}
        WHERE "ATIVO" = 'S' AND "MUNICIPIO" = ?
          AND "BARRAMENTO_INICIAL" IS NOT NULL AND "BARRAMENTO_FINAL" IS NOT NULL
    """
    params: List[Any] = [municipio]
    if alimentador:
        sql += ' AND "ALIMENTADOR" = ?'
        params.append(alimentador)
    if entidade in ENTIDADES:
        sql += ' AND "ENTIDADE" = ?'
        params.append(entidade)
    cursor.execute(sql, params)
    return _rows(cursor)


def _grafo(trechos: List[dict]):
    adj: Dict[str, List[dict]] = {}
    nos: Dict[str, dict] = {}

    def add_no(barr, x, y, mun, alim, ent):
        if barr not in nos:
            nos[barr] = {
                "BARRAMENTO": barr, "X": x, "Y": y,
                "MUNICIPIO": mun, "ALIMENTADOR": alim, "ENTIDADE": ent,
            }

    for t in trechos:
        a, c = t["BARRAMENTO_INICIAL"], t["BARRAMENTO_FINAL"]
        add_no(a, t["LONGITUDE_INICIAL"], t["LATITUDE_INICIAL"], t["MUNICIPIO"], t["ALIMENTADOR"], t["ENTIDADE"])
        add_no(c, t["LONGITUDE_FINAL"], t["LATITUDE_FINAL"], t["MUNICIPIO"], t["ALIMENTADOR"], t["ENTIDADE"])
        meta_m = float(t["EXTENSAO_M"] or 0.0)
        adj.setdefault(a, []).append({"to": c, "alim": t["ALIMENTADOR"], "ent": t["ENTIDADE"], "m": meta_m})
        adj.setdefault(c, []).append({"to": a, "alim": t["ALIMENTADOR"], "ent": t["ENTIDADE"], "m": meta_m})
    return adj, nos


def _provedores_por_no(cursor, barramentos: List[str]):
    """barr -> {chave: razao} (só ocupações com operadora) e set de barr
    com ocupação SEM operadora (org desconhecida)."""
    prov: Dict[str, Dict[str, str]] = {}
    sem_operadora: set = set()
    if not barramentos:
        return prov, sem_operadora
    lote = 900
    for i in range(0, len(barramentos), lote):
        parte = barramentos[i : i + lote]
        marc = ",".join(["?"] * len(parte))
        cursor.execute(
            f"""
            SELECT O."BARRAMENTO", O."ID_OPERADORA", OP."CNPJ", OP."RAZAO_SOCIAL"
            FROM {TB_OCUPACAO} O
            LEFT JOIN {TB_OPERADORA} OP ON OP."ID" = O."ID_OPERADORA"
            WHERE O."BARRAMENTO" IN ({marc})
            """,
            parte,
        )
        for r in cursor.fetchall():
            barr, id_op, cnpj, razao = r[0], r[1], r[2], r[3]
            if id_op is None:
                sem_operadora.add(barr)
                continue
            chave = cnpj or str(id_op)
            prov.setdefault(barr, {})[chave] = razao or cnpj or str(id_op)
    return prov, sem_operadora


def _chave_da_operadora(cursor, id_operadora: int) -> Optional[str]:
    cursor.execute(f'SELECT "CNPJ" FROM {TB_OPERADORA} WHERE "ID" = ?', [id_operadora])
    row = cursor.fetchone()
    if not row:
        return None
    return row[0] or str(id_operadora)


# ------------------------------------------------------------------
# Análise
# ------------------------------------------------------------------
def _analisar(cursor, corpo: dict) -> dict:
    municipio = (corpo.get("municipio") or "").strip()
    if not municipio:
        raise HTTPException(status_code=400, detail="Informe o município.")
    alimentador = (corpo.get("alimentador") or "").strip() or None
    entidade = corpo.get("entidade") if corpo.get("entidade") in ENTIDADES else None
    modo = "CORREDOR" if corpo.get("modo") == "CORREDOR" else "MESMO_PROVEDOR"
    max_trechos = min(10, max(2, int(corpo.get("max_trechos") or 4)))
    max_lado = max_trechos - 1
    exigir_mesmo_alim = corpo.get("exigir_mesmo_alimentador") is not False
    max_metros_vao = max(50.0, float(corpo.get("max_metros_vao") or 500))
    min_score = max(0, int(corpo.get("min_score") or 1))
    chave_operadora = (
        _chave_da_operadora(cursor, int(corpo["id_operadora"]))
        if corpo.get("id_operadora")
        else None
    )

    trechos = _carregar_trechos(cursor, municipio, alimentador, entidade)
    adj, nos = _grafo(trechos)
    prov, sem_operadora = _provedores_por_no(cursor, list(nos.keys()))
    ocupado = lambda b: bool(prov.get(b))

    corredor: set = set()
    postes: List[dict] = []
    processados = 0

    for g, info in nos.items():
        if ocupado(g):
            continue
        processados += 1
        if processados > 8000:
            break

        alcance: List[dict] = []
        visitado = {g}
        fila = [{"barr": g, "dist": 0, "first": None, "alims": frozenset(), "metros": 0.0}]
        while fila:
            prox = []
            for cur in fila:
                if cur["dist"] >= max_lado:
                    continue
                for e in adj.get(cur["barr"], ()):
                    if e["to"] in visitado:
                        continue
                    visitado.add(e["to"])
                    first = cur["first"] or e["to"]
                    alims = cur["alims"] | {e["alim"]}
                    metros = cur["metros"] + e["m"]
                    reg = {"barr": e["to"], "dist": cur["dist"] + 1, "first": first, "alims": alims, "metros": metros}
                    if ocupado(e["to"]):
                        alcance.append(reg)
                    else:
                        prox.append(reg)
            fila = prox
        if len(alcance) < 2:
            continue

        evidencias: List[dict] = []
        for i in range(len(alcance)):
            for j in range(i + 1, len(alcance)):
                A, C = alcance[i], alcance[j]
                if A["first"] == C["first"]:
                    continue
                hops = A["dist"] + C["dist"]
                if hops > max_trechos:
                    continue
                metros = round(A["metros"] + C["metros"], 1)
                if metros > max_metros_vao:
                    continue
                alims = A["alims"] | C["alims"]
                mesmo_alim = len(alims) == 1
                if exigir_mesmo_alim and not mesmo_alim:
                    continue

                pa, pc = prov.get(A["barr"], {}), prov.get(C["barr"], {})
                if modo == "MESMO_PROVEDOR":
                    comuns = [k for k in pa if k in pc]
                    if chave_operadora and chave_operadora not in comuns:
                        continue
                    if not comuns:
                        continue
                    if chave_operadora:
                        comuns = [chave_operadora]
                else:
                    comuns = list({*pa.keys(), *pc.keys()})
                    if chave_operadora and chave_operadora not in comuns:
                        continue

                evidencias.append(
                    {
                        "poste_a": A["barr"],
                        "poste_c": C["barr"],
                        "trechos": hops,
                        "metros": metros,
                        "alimentador": next(iter(A["alims"]), None),
                        "mesmo_alimentador": mesmo_alim,
                        "provedores": [
                            {"chave": k, "razao": pa.get(k) or pc.get(k) or k} for k in comuns
                        ],
                    }
                )
        if not evidencias:
            continue

        implicados: Dict[str, str] = {}
        for ev in evidencias:
            for p in ev["provedores"]:
                implicados[p["chave"]] = p["razao"]

        ocup_nao_id = g in sem_operadora
        score = 0
        score += 3 * len(implicados)
        score += min(len(evidencias), 4)
        score += 1 if ocup_nao_id else 2
        if all(e["mesmo_alimentador"] for e in evidencias):
            score += 2
        if (info.get("ENTIDADE") or "") == "TRECHO DE BT":
            score += 1
        if min(e["metros"] for e in evidencias) > 400:
            score -= 2
        if min(e["trechos"] for e in evidencias) >= 5:
            score -= 1
        score = max(0, score)
        if score < min_score:
            continue

        corredor.add(g)
        for ev in evidencias:
            corredor.add(ev["poste_a"])
            corredor.add(ev["poste_c"])

        evidencias.sort(key=lambda e: e["trechos"])
        postes.append(
            {
                "BARRAMENTO": g,
                "X": info["X"],
                "Y": info["Y"],
                "MUNICIPIO": info["MUNICIPIO"],
                "ALIMENTADOR": info["ALIMENTADOR"],
                "ENTIDADE": info["ENTIDADE"],
                "SCORE": score,
                "GRAU": len(adj.get(g, ())),
                "SEM_OCUPACAO": not ocup_nao_id,
                "provedores": [{"chave": k, "razao": v} for k, v in implicados.items()],
                "evidencias": evidencias[:8],
            }
        )

    postes.sort(key=lambda p: (-p["SCORE"], len(p["evidencias"])))
    top = postes[:300]

    segmentos = [
        {
            "ax": t["LONGITUDE_INICIAL"], "ay": t["LATITUDE_INICIAL"],
            "bx": t["LONGITUDE_FINAL"], "by": t["LATITUDE_FINAL"],
            "entidade": t["ENTIDADE"], "alimentador": t["ALIMENTADOR"],
            "implicado": t["BARRAMENTO_INICIAL"] in corredor and t["BARRAMENTO_FINAL"] in corredor,
        }
        for t in trechos[:4000]
    ]
    provedores_implicados = {pr["razao"] for p in top for pr in p["provedores"]}

    return {
        "parametros": {
            "municipio": municipio,
            "alimentador": alimentador,
            "entidade": entidade or "AMBOS",
            "modo": modo,
            "max_trechos": max_trechos,
            "exigir_mesmo_alimentador": exigir_mesmo_alim,
            "max_metros_vao": max_metros_vao,
            "min_score": min_score,
            "id_operadora": int(corpo["id_operadora"]) if corpo.get("id_operadora") else None,
        },
        "resumo": {
            "trechos_no_escopo": len(trechos),
            "nos": len(nos),
            "nos_sem_ocupacao": sum(1 for b in nos if not ocupado(b)),
            "postes_sinalizados": len(top),
            "provedores_implicados": len(provedores_implicados),
        },
        "postes": top,
        "segmentos": segmentos,
    }


# ------------------------------------------------------------------
# Rotas
# ------------------------------------------------------------------
@router.get("/api/trecho-rede/resumo", response_model=dict)
def resumo_rede():
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabela(cursor)
        conn.commit()
        cursor.execute(
            f"""
            SELECT "ENTIDADE", COUNT(*) AS QTD, COALESCE(SUM("EXTENSAO_M"), 0) AS EXT
            FROM {TB_TRECHO} WHERE "ATIVO" = 'S' GROUP BY "ENTIDADE"
            """
        )
        por_ent = {r[0]: (int(r[1]), float(r[2] or 0)) for r in cursor.fetchall()}
        mt = por_ent.get("TRECHO DE MT", (0, 0.0))
        bt = por_ent.get("TRECHO DE BT", (0, 0.0))
        cursor.execute(
            f"""
            SELECT COUNT(DISTINCT "MUNICIPIO"), COUNT(DISTINCT "ALIMENTADOR")
            FROM {TB_TRECHO} WHERE "ATIVO" = 'S'
            """
        )
        muns, alims = cursor.fetchone() or (0, 0)
        cursor.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT "BARRAMENTO_INICIAL" AS B FROM {TB_TRECHO} WHERE "ATIVO" = 'S'
                UNION SELECT "BARRAMENTO_FINAL" FROM {TB_TRECHO} WHERE "ATIVO" = 'S'
            )
            """
        )
        nos = (cursor.fetchone() or [0])[0]
        return {
            "trechos": mt[0] + bt[0],
            "trechos_mt": mt[0],
            "trechos_bt": bt[0],
            "km_total": round((mt[1] + bt[1]) / 1000, 1),
            "km_mt": round(mt[1] / 1000, 1),
            "km_bt": round(bt[1] / 1000, 1),
            "municipios": int(muns or 0),
            "alimentadores": int(alims or 0),
            "nos": int(nos or 0),
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/trecho-rede/municipios", response_model=List[dict])
def municipios_rede():
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabela(cursor)
        conn.commit()
        cursor.execute(
            f"""
            SELECT "MUNICIPIO", COUNT(*) AS TRECHOS
            FROM {TB_TRECHO} WHERE "ATIVO" = 'S' AND "MUNICIPIO" IS NOT NULL
            GROUP BY "MUNICIPIO" ORDER BY TRECHOS DESC, "MUNICIPIO"
            """
        )
        return [{"MUNICIPIO": r[0], "TRECHOS": int(r[1])} for r in cursor.fetchall()]
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/trecho-rede/alimentadores", response_model=List[dict])
def alimentadores_rede(municipio: Optional[str] = Query(None)):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabela(cursor)
        conn.commit()
        sql = f"""
            SELECT "ALIMENTADOR", COUNT(*) AS TRECHOS
            FROM {TB_TRECHO} WHERE "ATIVO" = 'S' AND "ALIMENTADOR" IS NOT NULL
        """
        params: List[Any] = []
        if municipio:
            sql += ' AND "MUNICIPIO" = ?'
            params.append(municipio)
        sql += ' GROUP BY "ALIMENTADOR" ORDER BY "ALIMENTADOR"'
        cursor.execute(sql, params)
        return [{"ALIMENTADOR": r[0], "TRECHOS": int(r[1])} for r in cursor.fetchall()]
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/trecho-rede/mapa", response_model=dict)
def mapa_rede(
    municipio: str = Query(...),
    alimentador: Optional[str] = Query(None),
    entidade: Optional[str] = Query(None),
):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabela(cursor)
        conn.commit()
        trechos = _carregar_trechos(cursor, municipio, alimentador or None, entidade)
        _, nos = _grafo(trechos)
        prov, _sem = _provedores_por_no(cursor, list(nos.keys()))
        return {
            "total": len(trechos),
            "truncado": len(trechos) > 6000,
            "segmentos": [
                {
                    "ax": t["LONGITUDE_INICIAL"], "ay": t["LATITUDE_INICIAL"],
                    "bx": t["LONGITUDE_FINAL"], "by": t["LATITUDE_FINAL"],
                    "entidade": t["ENTIDADE"], "alimentador": t["ALIMENTADOR"], "implicado": False,
                }
                for t in trechos[:6000]
            ],
            "nos": [
                {**n, "TEM_PROVEDOR": "S" if prov.get(n["BARRAMENTO"]) else "N"}
                for n in list(nos.values())[:8000]
            ],
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/trecho-rede/analise", response_model=dict)
def analise_rede(corpo: dict = Body(...)):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabela(cursor)
        conn.commit()
        return _analisar(cursor, corpo or {})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
