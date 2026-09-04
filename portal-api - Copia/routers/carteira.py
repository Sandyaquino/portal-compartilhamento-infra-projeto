# -*- coding: utf-8 -*-
"""
Carteira de Serviço das Equipes de Campo (gerador de roteiro).

Porta para o backend real o que já existia no mock (mock-api-dev/
routes-carteira.js). Mesmas rotas, mesmos formatos de resposta - o
frontend (app/(app)/operacao/carteira/*) não muda.

DDL: sql/PORTAL_COMPARTILHAMENTO_CARTEIRA.sql. As tabelas se
auto-criam na primeira chamada; o catálogo de estratégias e um
conjunto mínimo de EPS/equipes são semeados se estiverem vazios
(bases das equipes derivadas dos municípios da BASE_POSTE).

O gerador:
  - modo MANUAL: usa a lista de barramentos escolhida no mapa/lista
  - modo AUTOMATICA: aplica uma ESTRATEGIA de priorização sobre a
    Base de Postes Coelba (sinal "tem provedor" via POSTE_OCUPACAO)
e depois otimiza a rota (a equipe consome um município antes de ir
pro próximo; ordem no dia = vizinho mais próximo). Desvio/score
nunca são digitados - saem sempre do cálculo aqui.
"""
import json
import math
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query

import main

router = APIRouter()

SCHEMA = "CLB349328"
TB_EPS = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_EPS"'
TB_EPS_ATUACAO = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_EPS_ATUACAO"'
TB_EQUIPE = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_EQUIPE_CAMPO"'
TB_ESTRATEGIA = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA_ESTRATEGIA"'
TB_CARTEIRA = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA"'
TB_ESCOPO = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA_ESCOPO"'
TB_OS = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA_OS"'
TB_BASE = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_BASE_POSTE"'
TB_OCUPACAO = f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO"'

# Marca se o barramento tem provedor resolvido (mesma regra de base_postes.py).
_TEM_PROVEDOR = f"""
    CASE WHEN EXISTS (
        SELECT 1 FROM {TB_OCUPACAO} O
        WHERE O.BARRAMENTO = BP.DE_BARRAMENTO AND O.ID_OPERADORA IS NOT NULL
    ) THEN 'S' ELSE 'N' END
"""

# Teto de postes carregados no escopo de uma geração automática. Acima
# disso o usuário precisa estreitar município/localidade (o cálculo é
# feito em memória e algumas estratégias são O(n^2) por vizinhança).
LIMITE_ESCOPO = 20000

ESTRATEGIAS = [
    {
        "CODIGO": "VAO_ENTRE_PROVEDORES",
        "NOME": "Vão sem provedor entre postes com provedor",
        "DESCRICAO": (
            "Seleciona postes SEM provedor cercados por postes COM provedor num raio de rua. "
            "Num corredor de postes, se entre dois com provedor há um sem, há forte indício de "
            "ocupação não cadastrada. É a lógica de maior evidência."
        ),
        "PARAMETROS": "raio_m (60), min_vizinhos_com_provedor (2), limiar_fracao (0.5)",
    },
    {
        "CODIGO": "CORREDOR_MISTO",
        "NOME": "Corredores com postes com e sem provedor",
        "DESCRICAO": (
            "Agrupa os postes em trechos de ~150 m e prioriza os SEM provedor que estão em "
            "trechos onde também há postes COM provedor — provável expansão de rede de um ISP "
            "sem declarar todos os pontos."
        ),
        "PARAMETROS": "celula_m (150)",
    },
    {
        "CODIGO": "LOCALIDADE_ALTA_ADESAO",
        "NOME": "Localidades de alta adesão com bolsões sem provedor",
        "DESCRICAO": (
            "Ranqueia as localidades pela proporção de postes COM provedor (adesão alta = "
            "mercado maduro) e, dentro delas, seleciona os que ainda estão SEM provedor — "
            "candidatos a cadastro pendente."
        ),
        "PARAMETROS": "min_adesao (0.4)",
    },
    {
        "CODIGO": "DENSIDADE_SEM_PROVEDOR",
        "NOME": "Concentração de postes sem provedor perto de área atendida",
        "DESCRICAO": (
            "Encontra aglomerados de postes SEM provedor próximos (célula vizinha) de postes "
            "COM provedor. Aponta mercado potencial contíguo à rede existente."
        ),
        "PARAMETROS": "celula_m (200)",
    },
    {
        "CODIGO": "AMOSTRAGEM_LOCALIDADE",
        "NOME": "Amostragem simples por município/localidade",
        "DESCRICAO": (
            "Sem priorização: pega N postes SEM provedor por dia nos municípios/localidades "
            "escolhidos, na ordem do cadastro. Útil para varredura ampla."
        ),
        "PARAMETROS": "nenhum",
    },
    {
        "CODIGO": "TODOS_SEM_PROVEDOR",
        "NOME": "Todos os postes sem provedor da área",
        "DESCRICAO": (
            "Sem amostragem: inclui todos os postes SEM provedor dos municípios/localidades "
            "escolhidos, limitado pela capacidade das equipes no período."
        ),
        "PARAMETROS": "nenhum",
    },
]
CODIGOS_ESTRATEGIA = {e["CODIGO"] for e in ESTRATEGIAS}
FREQUENCIAS = {"DIARIA": 1, "SEMANAL": 5, "MENSAL": 22}
STATUS_VALIDOS = {"RASCUNHO", "PUBLICADA", "CONCLUIDA", "CANCELADA"}


# ------------------------------------------------------------------
# Serialização
# ------------------------------------------------------------------
def _num(valor: Any) -> Any:
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return valor


def _rows(cursor) -> List[dict]:
    cols = [c[0] for c in cursor.description]
    return [{cols[i]: _num(v) for i, v in enumerate(r)} for r in cursor.fetchall()]


# ------------------------------------------------------------------
# Geografia / calendário
# ------------------------------------------------------------------
def _metros(a: Dict[str, float], b: Dict[str, float]) -> float:
    d_lat = (a["lat"] - b["lat"]) * 111000
    d_lng = (a["lng"] - b["lng"]) * 108000
    return math.hypot(d_lat, d_lng)


def _centro(postes: List[dict]) -> Dict[str, float]:
    n = len(postes) or 1
    return {
        "lat": sum(p["NU_LATITUDE"] for p in postes) / n,
        "lng": sum(p["NU_LONGITUDE"] for p in postes) / n,
    }


def _pt(p: dict) -> Dict[str, float]:
    return {"lat": p["NU_LATITUDE"], "lng": p["NU_LONGITUDE"]}


def _chave_celula(p: dict, celula_graus: float) -> str:
    return f"{math.floor(p['NU_LATITUDE'] / celula_graus)}:{math.floor(p['NU_LONGITUDE'] / celula_graus)}"


def _dias_uteis(data_inicio_iso: str, frequencia: str) -> List[str]:
    n = FREQUENCIAS.get(frequencia, FREQUENCIAS["SEMANAL"])
    try:
        cur = datetime.strptime(str(data_inicio_iso)[:10], "%Y-%m-%d").date()
    except ValueError:
        cur = date.today()
    dias: List[str] = []
    guarda = 0
    while len(dias) < n and guarda < 90:
        guarda += 1
        if cur.weekday() < 5:  # seg..sex
            dias.append(cur.isoformat())
        cur += timedelta(days=1)
    return dias


def _link_gmaps(lat: float, lng: float) -> str:
    return f"https://www.google.com/maps?q={lat},{lng}"


def _link_waze(lat: float, lng: float) -> str:
    return f"https://waze.com/ul?ll={lat},{lng}&navigate=yes"


# ------------------------------------------------------------------
# Auto-criação + seed
# ------------------------------------------------------------------
def _tabela_existe(cursor, tabela_sem_aspas: str) -> bool:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {tabela_sem_aspas}")
        cursor.fetchone()
        return True
    except Exception:
        return False


def _garantir_tabelas(cursor) -> None:
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_EPS"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_EPS} (
                "ID_EPS" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "NOME" NVARCHAR(150) NOT NULL,
                "CNPJ" NVARCHAR(20),
                "TIPO_SERVICO" NVARCHAR(20) DEFAULT 'AMBOS',
                "ATIVO" NVARCHAR(1) DEFAULT 'S',
                "CREATED_AT" LONGDATE CS_LONGDATE,
                PRIMARY KEY ("ID_EPS")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_EQUIPE_CAMPO"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_EQUIPE} (
                "ID_EQUIPE" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "ID_EPS" INTEGER NOT NULL,
                "NOME" NVARCHAR(80) NOT NULL,
                "ENCARREGADO" NVARCHAR(120),
                "MUNICIPIO_BASE" NVARCHAR(120),
                "LATITUDE_BASE" DECIMAL(18,10),
                "LONGITUDE_BASE" DECIMAL(18,10),
                "TIPO" NVARCHAR(20) DEFAULT 'FISCALIZACAO',
                "ATIVO" NVARCHAR(1) DEFAULT 'S',
                "CREATED_AT" LONGDATE CS_LONGDATE,
                PRIMARY KEY ("ID_EQUIPE")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_EPS_ATUACAO"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_EPS_ATUACAO} (
                "ID" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "ID_EPS" INTEGER NOT NULL,
                "SUPERINTENDENCIA" NVARCHAR(120),
                "UTD" NVARCHAR(120),
                "SETOR" NVARCHAR(120),
                "MUNICIPIO" NVARCHAR(120) NOT NULL,
                "ATIVO" NVARCHAR(1) DEFAULT 'S',
                "CREATED_AT" LONGDATE CS_LONGDATE,
                "CREATED_BY" NVARCHAR(100),
                "UPDATED_AT" LONGDATE CS_LONGDATE,
                PRIMARY KEY ("ID")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
        try:
            cursor.execute(
                f'CREATE UNIQUE INDEX "IX_EPSATUACAO_EPS_MUN" ON {TB_EPS_ATUACAO} ("ID_EPS", "MUNICIPIO")'
            )
        except Exception:
            pass
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA_ESTRATEGIA"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_ESTRATEGIA} (
                "CODIGO" NVARCHAR(40) NOT NULL,
                "NOME" NVARCHAR(120) NOT NULL,
                "DESCRICAO" NVARCHAR(1000),
                "PARAMETROS" NVARCHAR(500),
                "ORDEM" INTEGER DEFAULT 0,
                "ATIVO" NVARCHAR(1) DEFAULT 'S',
                PRIMARY KEY ("CODIGO")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_CARTEIRA} (
                "ID_CARTEIRA" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "TITULO" NVARCHAR(200),
                "FREQUENCIA" NVARCHAR(10) DEFAULT 'SEMANAL',
                "DATA_INICIO" DATE NOT NULL,
                "DATA_FIM" DATE NOT NULL,
                "MODO" NVARCHAR(12) DEFAULT 'AUTOMATICA',
                "ESTRATEGIA" NVARCHAR(40),
                "ID_EPS" INTEGER,
                "QTD_POSTES_DIA" INTEGER DEFAULT 12,
                "QTD_OS" INTEGER DEFAULT 0,
                "QTD_EQUIPES" INTEGER DEFAULT 0,
                "STATUS" NVARCHAR(15) DEFAULT 'RASCUNHO',
                "PARAMETROS_JSON" NVARCHAR(4000),
                "CREATED_AT" LONGDATE CS_LONGDATE,
                "CREATED_BY" NVARCHAR(100),
                "UPDATED_AT" LONGDATE CS_LONGDATE,
                PRIMARY KEY ("ID_CARTEIRA")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA_ESCOPO"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_ESCOPO} (
                "ID" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "ID_CARTEIRA" INTEGER NOT NULL,
                "MUNICIPIO" NVARCHAR(120),
                "NU_LOCALIDADE_ID" BIGINT,
                PRIMARY KEY ("ID")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )
    if not _tabela_existe(cursor, f'"{SCHEMA}"."PORTAL_COMPARTILHAMENTO_CARTEIRA_OS"'):
        cursor.execute(
            f"""
            CREATE COLUMN TABLE {TB_OS} (
                "ID_CARTEIRA_OS" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
                "ID_CARTEIRA" INTEGER NOT NULL,
                "SEQ" INTEGER,
                "NU_PG_ID" BIGINT,
                "DE_BARRAMENTO" NVARCHAR(50),
                "MUNICIPIO" NVARCHAR(120),
                "LOCALIDADE" NVARCHAR(120),
                "LATITUDE" DECIMAL(18,10),
                "LONGITUDE" DECIMAL(18,10),
                "TEM_PROVEDOR" NVARCHAR(1) DEFAULT 'N',
                "ID_EQUIPE" INTEGER,
                "NOME_EQUIPE" NVARCHAR(80),
                "EPS" NVARCHAR(150),
                "DATA_PREVISTA" DATE,
                "DIA_INDICE" INTEGER,
                "ORDEM_NO_DIA" INTEGER,
                "ESTRATEGIA" NVARCHAR(40),
                "SCORE" DECIMAL(9,4),
                "MOTIVO" NVARCHAR(300),
                "STATUS" NVARCHAR(15) DEFAULT 'PLANEJADA',
                "LINK_GMAPS" NVARCHAR(300),
                "LINK_WAZE" NVARCHAR(300),
                "EXECUTADO_EM" LONGDATE CS_LONGDATE,
                "OBSERVACAO" NVARCHAR(1000),
                "CREATED_AT" LONGDATE CS_LONGDATE,
                PRIMARY KEY ("ID_CARTEIRA_OS")
            ) UNLOAD PRIORITY 5 AUTO MERGE
            """
        )

    # catálogo de estratégias — sempre garante as 6 linhas
    cursor.execute(f"SELECT CODIGO FROM {TB_ESTRATEGIA}")
    ja = {r[0] for r in cursor.fetchall()}
    for i, e in enumerate(ESTRATEGIAS):
        if e["CODIGO"] not in ja:
            cursor.execute(
                f"""INSERT INTO {TB_ESTRATEGIA} (CODIGO, NOME, DESCRICAO, PARAMETROS, ORDEM, ATIVO)
                    VALUES (?, ?, ?, ?, ?, 'S')""",
                [e["CODIGO"], e["NOME"], e["DESCRICAO"], e["PARAMETROS"], (i + 1) * 10],
            )

    # EPS + equipes: semeia um conjunto mínimo só se estiver vazio, com as
    # bases ancoradas nos municípios com mais postes na BASE_POSTE.
    cursor.execute(f"SELECT COUNT(*) FROM {TB_EPS}")
    if int(cursor.fetchone()[0] or 0) == 0:
        _seed_eps_equipes(cursor)

    # Área de atuação (EPS x SUPERINTENDENCIA/UTD/SETOR/MUNICIPIO): semeia se vazia.
    cursor.execute(f"SELECT COUNT(*) FROM {TB_EPS_ATUACAO}")
    if int(cursor.fetchone()[0] or 0) == 0:
        _seed_eps_atuacao(cursor)


def _seed_eps_equipes(cursor) -> None:
    eps = [
        ("ORCA Serviços de Campo Ltda", "AMBOS"),
        ("Nordeste Redes Engenharia S.A.", "FISCALIZACAO"),
    ]
    ids_eps: List[int] = []
    for nome, tipo in eps:
        cursor.execute(
            f"INSERT INTO {TB_EPS} (NOME, TIPO_SERVICO, ATIVO, CREATED_AT) VALUES (?, ?, 'S', CURRENT_UTCTIMESTAMP)",
            [nome, tipo],
        )
        ids_eps.append(_ultimo_id(cursor, TB_EPS, "ID_EPS"))

    municipios: List[tuple] = []
    try:
        cursor.execute(
            f"""
            SELECT MUNICIPIO, AVG(NU_LATITUDE), AVG(NU_LONGITUDE), COUNT(*)
            FROM {TB_BASE} WHERE ATIVO = 'S' AND MUNICIPIO IS NOT NULL
            GROUP BY MUNICIPIO ORDER BY COUNT(*) DESC LIMIT 3
            """
        )
        municipios = cursor.fetchall()
    except Exception:
        municipios = []

    letra = 65
    for idx, row in enumerate(municipios):
        mun, lat, lng, _qtd = row
        for j in range(2):  # duas turmas por município
            id_eps = ids_eps[(idx + j) % len(ids_eps)]
            tipo = "REMOCAO" if j == 1 else "FISCALIZACAO"
            cursor.execute(
                f"""INSERT INTO {TB_EQUIPE}
                    (ID_EPS, NOME, ENCARREGADO, MUNICIPIO_BASE, LATITUDE_BASE, LONGITUDE_BASE, TIPO, ATIVO, CREATED_AT)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'S', CURRENT_UTCTIMESTAMP)""",
                [
                    id_eps,
                    f"Turma {chr(letra)}",
                    None,
                    mun,
                    float(lat) if lat is not None else None,
                    float(lng) if lng is not None else None,
                    tipo,
                ],
            )
            letra += 1


def _seed_eps_atuacao(cursor) -> None:
    cursor.execute(f"SELECT ID_EPS FROM {TB_EPS} WHERE ATIVO = 'S' ORDER BY ID_EPS")
    ids_eps = [int(r[0]) for r in cursor.fetchall()]
    if not ids_eps:
        return
    municipios: List[str] = []
    try:
        cursor.execute(
            f"""
            SELECT MUNICIPIO FROM {TB_BASE}
            WHERE ATIVO = 'S' AND MUNICIPIO IS NOT NULL
            GROUP BY MUNICIPIO ORDER BY COUNT(*) DESC LIMIT 8
            """
        )
        municipios = [r[0] for r in cursor.fetchall()]
    except Exception:
        municipios = []
    for idx, mun in enumerate(municipios):
        superint = "Metropolitana" if idx < 2 else ("Leste" if idx < 5 else "Sul")
        utd = (f"UTD {mun}")[:120]
        setor = f"{(mun or 'GEN')[:3].upper()}-{(idx % 3) + 1:02d}"
        alvo = [ids_eps[idx % len(ids_eps)]]
        if len(ids_eps) > 1:
            alvo.append(ids_eps[(idx + 1) % len(ids_eps)])
        for id_eps in dict.fromkeys(alvo):
            cursor.execute(
                f"""INSERT INTO {TB_EPS_ATUACAO}
                    (ID_EPS, SUPERINTENDENCIA, UTD, SETOR, MUNICIPIO, ATIVO, CREATED_AT, CREATED_BY)
                    VALUES (?, ?, ?, ?, ?, 'S', CURRENT_UTCTIMESTAMP, 'seed')""",
                [id_eps, superint, utd, setor, mun],
            )


def _ultimo_id(cursor, tabela: str, coluna_id: str) -> Optional[int]:
    try:
        cursor.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
        r = cursor.fetchone()
        if r and r[0]:
            return int(r[0])
    except Exception:
        pass
    cursor.execute(f"SELECT MAX({coluna_id}) FROM {tabela}")
    r = cursor.fetchone()
    return int(r[0]) if r and r[0] is not None else None


# ------------------------------------------------------------------
# Carga dos postes do escopo
# ------------------------------------------------------------------
_COLS_BASE = """
    BP.NU_PG_ID, BP.NU_LOCALIDADE_ID, BP.LOCALIDADE, BP.DE_BARRAMENTO,
    BP.MUNICIPIO, BP.NU_LATITUDE, BP.NU_LONGITUDE
"""


def _linha_poste(r: tuple, tem_prov: str) -> dict:
    return {
        "NU_PG_ID": int(r[0]) if r[0] is not None else None,
        "NU_LOCALIDADE_ID": int(r[1]) if r[1] is not None else None,
        "LOCALIDADE": r[2],
        "DE_BARRAMENTO": r[3],
        "MUNICIPIO": r[4],
        "NU_LATITUDE": float(r[5]) if r[5] is not None else 0.0,
        "NU_LONGITUDE": float(r[6]) if r[6] is not None else 0.0,
        "_tem_provedor": tem_prov == "S",
    }


def _carregar_escopo(cursor, municipios: List[str], localidades: List[int]) -> List[dict]:
    where = " WHERE BP.ATIVO = 'S'"
    params: List[Any] = []
    locs = [int(x) for x in (localidades or [])]
    muns = [str(x) for x in (municipios or [])]
    if locs:
        where += f" AND BP.NU_LOCALIDADE_ID IN ({','.join(['?'] * len(locs))})"
        params += locs
    elif muns:
        where += f" AND UPPER(BP.MUNICIPIO) IN ({','.join(['?'] * len(muns))})"
        params += [m.upper() for m in muns]
    else:
        return []

    cursor.execute(f"SELECT COUNT(*) FROM {TB_BASE} BP{where}", params)
    total = int(cursor.fetchone()[0] or 0)
    if total > LIMITE_ESCOPO:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Escopo com {total} postes (limite {LIMITE_ESCOPO}). "
                "Estreite o município/localidade para gerar a carteira."
            ),
        )

    cursor.execute(f"SELECT {_COLS_BASE}, {_TEM_PROVEDOR} AS TEM_PROVEDOR FROM {TB_BASE} BP{where}", params)
    return [_linha_poste(r, r[7]) for r in cursor.fetchall()]


def _carregar_barramentos(cursor, barramentos: List[str]) -> List[dict]:
    alvo = [b for b in (barramentos or []) if b]
    if not alvo:
        return []
    out: List[dict] = []
    for i in range(0, len(alvo), 800):
        lote = alvo[i : i + 800]
        marc = ",".join(["?"] * len(lote))
        cursor.execute(
            f"SELECT {_COLS_BASE}, {_TEM_PROVEDOR} AS TEM_PROVEDOR FROM {TB_BASE} BP "
            f"WHERE BP.ATIVO = 'S' AND BP.DE_BARRAMENTO IN ({marc})",
            lote,
        )
        out += [_linha_poste(r, r[7]) for r in cursor.fetchall()]
    return out


# ------------------------------------------------------------------
# Estratégias -> [{ poste, score, motivo }]
# ------------------------------------------------------------------
def _tem_prov(p: dict) -> bool:
    return bool(p.get("_tem_provedor"))


def _aplicar_estrategia(estrategia: str, postes: List[dict], params: dict) -> List[dict]:
    params = params or {}
    sem = [p for p in postes if not _tem_prov(p)]

    if estrategia == "VAO_ENTRE_PROVEDORES":
        raio = float(params.get("raio_m") or 60)
        min_viz = int(params.get("min_vizinhos_com_provedor") or 2)
        limiar = float(params.get("limiar_fracao") or 0.5)
        # índice espacial: célula ~ raio, compara só a vizinhança 3x3
        cel_graus = max(raio / 111000.0, 1e-9)
        grade: Dict[tuple, List[dict]] = {}
        for p in postes:
            k = (math.floor(p["NU_LATITUDE"] / cel_graus), math.floor(p["NU_LONGITUDE"] / cel_graus))
            grade.setdefault(k, []).append(p)
        out = []
        vizinhanca = range(-2, 3)  # ±2 células cobre o raio mesmo na diferença lat/lng
        for p in sem:
            pp = _pt(p)
            ci = math.floor(p["NU_LATITUDE"] / cel_graus)
            cj = math.floor(p["NU_LONGITUDE"] / cel_graus)
            c = t = 0
            for di in vizinhanca:
                for dj in vizinhanca:
                    for q in grade.get((ci + di, cj + dj), ()):
                        if q is p:
                            continue
                        if _metros(pp, _pt(q)) <= raio:
                            t += 1
                            if _tem_prov(q):
                                c += 1
            if t > 0 and c >= min_viz and c / t >= limiar:
                out.append(
                    {
                        "poste": p,
                        "score": round(c / t + 0.1 * min(c, 5), 4),
                        "motivo": f"{c} de {t} vizinhos (raio {int(raio)} m) têm provedor",
                    }
                )
        return sorted(out, key=lambda x: x["score"], reverse=True)

    if estrategia in ("CORREDOR_MISTO", "DENSIDADE_SEM_PROVEDOR"):
        celula_m = float(params.get("celula_m") or (150 if estrategia == "CORREDOR_MISTO" else 200))
        celula_graus = celula_m / 111000.0
        mapa: Dict[str, Dict[str, list]] = {}
        for p in postes:
            k = _chave_celula(p, celula_graus)
            cel = mapa.setdefault(k, {"com": [], "sem": []})
            (cel["com"] if _tem_prov(p) else cel["sem"]).append(p)
        out = []
        if estrategia == "CORREDOR_MISTO":
            for cel in mapa.values():
                if cel["com"] and cel["sem"]:
                    score = round(min(len(cel["com"]), 5) / 5 + 0.2, 4)
                    for p in cel["sem"]:
                        out.append(
                            {
                                "poste": p,
                                "score": score,
                                "motivo": f"trecho com {len(cel['com'])} com provedor e {len(cel['sem'])} sem",
                            }
                        )
        else:
            def tem_com_vizinha(k: str) -> bool:
                i, j = (int(x) for x in k.split(":"))
                for di in (-1, 0, 1):
                    for dj in (-1, 0, 1):
                        viz = mapa.get(f"{i + di}:{j + dj}")
                        if viz and viz["com"]:
                            return True
                return False

            for k, cel in mapa.items():
                if cel["sem"] and tem_com_vizinha(k):
                    score = round(min(len(cel["sem"]), 10) / 10 + 0.1, 4)
                    for p in cel["sem"]:
                        out.append(
                            {
                                "poste": p,
                                "score": score,
                                "motivo": f"{len(cel['sem'])} sem provedor próximos a área atendida",
                            }
                        )
        return sorted(out, key=lambda x: x["score"], reverse=True)

    if estrategia == "LOCALIDADE_ALTA_ADESAO":
        min_adesao = float(params.get("min_adesao") or 0.4)
        por_loc: Dict[Any, dict] = {}
        for p in postes:
            l = por_loc.setdefault(p["NU_LOCALIDADE_ID"], {"total": 0, "com": 0, "nome": p["LOCALIDADE"]})
            l["total"] += 1
            if _tem_prov(p):
                l["com"] += 1
        out = []
        for p in sem:
            l = por_loc.get(p["NU_LOCALIDADE_ID"])
            adesao = (l["com"] / l["total"]) if l and l["total"] else 0
            if adesao >= min_adesao:
                out.append(
                    {
                        "poste": p,
                        "score": round(adesao, 4),
                        "motivo": f"localidade \"{l['nome']}\" com {round(adesao * 100)}% de adesão",
                    }
                )
        return sorted(out, key=lambda x: x["score"], reverse=True)

    # AMOSTRAGEM_LOCALIDADE | TODOS_SEM_PROVEDOR
    return [{"poste": p, "score": 0.5, "motivo": "poste sem provedor na área"} for p in sem]


# ------------------------------------------------------------------
# Otimização de rota
# ------------------------------------------------------------------
def _fatiar_por_geografia(lista: List[dict], n: int) -> List[List[dict]]:
    if n <= 1:
        return [lista]
    lats = [s["poste"]["NU_LATITUDE"] for s in lista]
    lngs = [s["poste"]["NU_LONGITUDE"] for s in lista]
    range_lat = (max(lats) - min(lats)) if lats else 0
    range_lng = (max(lngs) - min(lngs)) if lngs else 0
    chave = (
        (lambda s: s["poste"]["NU_LONGITUDE"])
        if range_lng >= range_lat
        else (lambda s: s["poste"]["NU_LATITUDE"])
    )
    ordenada = sorted(lista, key=chave)
    tam = math.ceil(len(ordenada) / n) or 1
    fatias = []
    for i in range(n):
        f = ordenada[i * tam : (i + 1) * tam]
        if f:
            fatias.append(f)
    return fatias


def _base_pt(e: dict) -> Dict[str, float]:
    return {"lat": e.get("LATITUDE_BASE") or 0.0, "lng": e.get("LONGITUDE_BASE") or 0.0}


def _alocar_rota(
    selecionados: List[dict], equipes: List[dict], qtd_por_dia: int, dias: List[str], nome_eps: str
) -> List[dict]:
    cap_equipe = qtd_por_dia * len(dias)

    por_mun: Dict[str, List[dict]] = {}
    for s in selecionados:
        por_mun.setdefault(s["poste"]["MUNICIPIO"], []).append(s)
    municipios = sorted(
        (
            {"nome": nome, "lista": lista, "centro": _centro([s["poste"] for s in lista])}
            for nome, lista in por_mun.items()
        ),
        key=lambda m: len(m["lista"]),
        reverse=True,
    )
    municipios = list(municipios)

    buckets = [{"equipe": e, "cap": cap_equipe, "municipios": []} for e in equipes]
    max_eq_por_mun = max(1, math.ceil(len(equipes) / max(1, len(municipios))))
    livres = list(buckets)

    for mun in municipios:
        if not livres:
            break
        livres.sort(key=lambda b: _metros(_base_pt(b["equipe"]), mun["centro"]))
        n_eq = min(len(livres), max_eq_por_mun, max(1, math.ceil(len(mun["lista"]) / cap_equipe)))
        escolhidas = livres[:n_eq]
        del livres[:n_eq]
        fatias = _fatiar_por_geografia(mun["lista"], len(escolhidas))
        pend = list(escolhidas)
        for fatia in fatias:
            c = _centro([s["poste"] for s in fatia])
            pend.sort(key=lambda b: _metros(_base_pt(b["equipe"]), c))
            b = pend.pop(0)
            corte = fatia[:cap_equipe]
            b["municipios"].append(
                {"nome": mun["nome"], "centro": _centro([s["poste"] for s in corte]), "lista": corte}
            )
            b["cap"] -= len(corte)

    for mun in municipios:
        if any(any(m["nome"] == mun["nome"] for m in b["municipios"]) for b in buckets):
            continue
        lista_geo = mun["lista"]
        ordenada = (
            sorted(lista_geo, key=lambda s: s["poste"]["NU_LONGITUDE"]) if len(lista_geo) > 1 else lista_geo
        )
        idx = 0
        while idx < len(ordenada):
            buckets.sort(key=lambda b: b["cap"], reverse=True)
            alvo = buckets[0]
            if alvo["cap"] <= 0:
                break
            n = min(alvo["cap"], len(ordenada) - idx)
            fatia = ordenada[idx : idx + n]
            alvo["municipios"].append(
                {"nome": mun["nome"], "centro": _centro([s["poste"] for s in fatia]), "lista": fatia}
            )
            alvo["cap"] -= n
            idx += n

    os_lista: List[dict] = []
    seq = 0
    for b in buckets:
        atual = _base_pt(b["equipe"])
        restantes = list(b["municipios"])
        ordem_mun = []
        while restantes:
            restantes.sort(key=lambda m: _metros(atual, m["centro"]))
            prox = restantes.pop(0)
            ordem_mun.append(prox)
            atual = prox["centro"]

        dia_idx = 0
        restante_no_dia = qtd_por_dia
        ultimo = _base_pt(b["equipe"])

        for mun in ordem_mun:
            pend = list(mun["lista"])
            while pend:
                if dia_idx >= len(dias):
                    break
                pend.sort(key=lambda s: _metros(ultimo, _pt(s["poste"])))
                s = pend.pop(0)
                p = s["poste"]
                seq += 1
                os_lista.append(
                    {
                        "SEQ": seq,
                        "NU_PG_ID": p["NU_PG_ID"],
                        "DE_BARRAMENTO": p["DE_BARRAMENTO"],
                        "MUNICIPIO": p["MUNICIPIO"],
                        "LOCALIDADE": p["LOCALIDADE"],
                        "LATITUDE": p["NU_LATITUDE"],
                        "LONGITUDE": p["NU_LONGITUDE"],
                        "TEM_PROVEDOR": "S" if _tem_prov(p) else "N",
                        "ID_EQUIPE": b["equipe"]["ID_EQUIPE"],
                        "NOME_EQUIPE": b["equipe"]["NOME"],
                        "EPS": nome_eps,
                        "DATA_PREVISTA": dias[dia_idx],
                        "DIA_INDICE": dia_idx + 1,
                        "ORDEM_NO_DIA": qtd_por_dia - restante_no_dia + 1,
                        "ESTRATEGIA": s.get("estrategia"),
                        "SCORE": s.get("score"),
                        "MOTIVO": s.get("motivo"),
                        "STATUS": "PLANEJADA",
                        "LINK_GMAPS": _link_gmaps(p["NU_LATITUDE"], p["NU_LONGITUDE"]),
                        "LINK_WAZE": _link_waze(p["NU_LATITUDE"], p["NU_LONGITUDE"]),
                    }
                )
                ultimo = _pt(p)
                restante_no_dia -= 1
                if restante_no_dia == 0:
                    dia_idx += 1
                    restante_no_dia = qtd_por_dia
            if dia_idx >= len(dias):
                break
    return os_lista


# ------------------------------------------------------------------
# Monta a carteira (preview ou gravação)
# ------------------------------------------------------------------
def _agrupamentos(dias: List[str], os_lista: List[dict], equipes: List[dict]) -> dict:
    por_dia = []
    for i, d in enumerate(dias):
        do_dia = [o for o in os_lista if o["DATA_PREVISTA"] == d]
        por_dia.append(
            {
                "dia_indice": i + 1,
                "data": d,
                "qtd": len(do_dia),
                "municipios": sorted({o["MUNICIPIO"] for o in do_dia}),
                "equipes": sorted({o["NOME_EQUIPE"] for o in do_dia}),
            }
        )
    por_equipe = []
    for e in equipes:
        da_equipe = [o for o in os_lista if o["ID_EQUIPE"] == e["ID_EQUIPE"]]
        por_equipe.append(
            {
                "id_equipe": e["ID_EQUIPE"],
                "nome": e["NOME"],
                "encarregado": e.get("ENCARREGADO"),
                "qtd": len(da_equipe),
                "municipios": sorted({o["MUNICIPIO"] for o in da_equipe}),
            }
        )
    resumo = {
        "qtd_os": len(os_lista),
        "qtd_dias": len(dias),
        "qtd_equipes": len(equipes),
        "qtd_municipios": len({o["MUNICIPIO"] for o in os_lista}),
        "sem_provedor": len([o for o in os_lista if o["TEM_PROVEDOR"] == "N"]),
        "com_provedor": len([o for o in os_lista if o["TEM_PROVEDOR"] == "S"]),
    }
    return {"resumo": resumo, "por_dia": por_dia, "por_equipe": por_equipe}


def _montar_carteira(cursor, corpo: dict) -> dict:
    frequencia = corpo.get("frequencia") if corpo.get("frequencia") in FREQUENCIAS else "SEMANAL"
    data_inicio = str(corpo.get("data_inicio") or date.today().isoformat())[:10]
    dias = _dias_uteis(data_inicio, frequencia)
    data_fim = dias[-1] if dias else data_inicio
    modo = "MANUAL" if corpo.get("modo") == "MANUAL" else "AUTOMATICA"
    qtd_por_dia = max(1, int(corpo.get("qtd_postes_dia") or 12))

    ids_equipes = [int(x) for x in (corpo.get("ids_equipes") or [])]
    id_eps = int(corpo["id_eps"]) if corpo.get("id_eps") else None

    equipes: List[dict] = []
    if ids_equipes:
        marc = ",".join(["?"] * len(ids_equipes))
        cursor.execute(
            f"SELECT * FROM {TB_EQUIPE} WHERE ATIVO = 'S' AND ID_EQUIPE IN ({marc})", ids_equipes
        )
        equipes = _rows(cursor)
    if not equipes and id_eps:
        cursor.execute(f"SELECT * FROM {TB_EQUIPE} WHERE ATIVO = 'S' AND ID_EPS = ?", [id_eps])
        equipes = _rows(cursor)
    if not equipes:
        return {"erro": "Selecione ao menos uma equipe (ou uma EPS com equipes)."}

    nome_eps = "-"
    if id_eps:
        cursor.execute(f"SELECT NOME FROM {TB_EPS} WHERE ID_EPS = ?", [id_eps])
        r = cursor.fetchone()
        if r and r[0]:
            nome_eps = r[0]

    if modo == "MANUAL":
        postes = _carregar_barramentos(cursor, corpo.get("barramentos") or [])
        selecionados = [
            {"poste": p, "score": 1, "motivo": "seleção manual", "estrategia": "MANUAL"} for p in postes
        ]
        if not selecionados:
            return {"erro": "Nenhum poste na seleção manual."}
        estrategia_cod = None
    else:
        estrategia_cod = (
            corpo.get("estrategia") if corpo.get("estrategia") in CODIGOS_ESTRATEGIA else "VAO_ENTRE_PROVEDORES"
        )
        escopo = _carregar_escopo(cursor, corpo.get("municipios") or [], corpo.get("localidades") or [])
        if not escopo:
            return {"erro": "Nenhum poste no escopo (município/localidade)."}
        selecionados = _aplicar_estrategia(estrategia_cod, escopo, corpo.get("params") or {})
        for s in selecionados:
            s["estrategia"] = estrategia_cod
        if not selecionados:
            return {"erro": f'A estratégia "{estrategia_cod}" não encontrou postes com o critério nesta área.'}

    os_lista = _alocar_rota(selecionados, equipes, qtd_por_dia, dias, nome_eps)

    titulo = corpo.get("titulo") or (
        f"Carteira {frequencia.lower()} - {data_inicio}"
        + (f" ({estrategia_cod or 'VAO_ENTRE_PROVEDORES'})" if modo == "AUTOMATICA" else "")
    )
    cabecalho = {
        "TITULO": titulo,
        "FREQUENCIA": frequencia,
        "DATA_INICIO": data_inicio,
        "DATA_FIM": data_fim,
        "MODO": modo,
        "ESTRATEGIA": (estrategia_cod or "VAO_ENTRE_PROVEDORES") if modo == "AUTOMATICA" else None,
        "ID_EPS": id_eps,
        "EPS": nome_eps,
        "QTD_POSTES_DIA": qtd_por_dia,
        "QTD_OS": len(os_lista),
        "QTD_EQUIPES": len(equipes),
        "STATUS": "RASCUNHO",
    }
    agr = _agrupamentos(dias, os_lista, equipes)
    agr["resumo"]["candidatos_estrategia"] = len(selecionados)
    agr["resumo"]["capacidade"] = qtd_por_dia * len(dias) * len(equipes)
    return {"cabecalho": cabecalho, "os": os_lista, **agr}


def _params_json(corpo: dict) -> str:
    return json.dumps(
        {
            "municipios": corpo.get("municipios") or [],
            "localidades": corpo.get("localidades") or [],
            "params": corpo.get("params") or {},
            "ids_equipes": corpo.get("ids_equipes") or [],
            "barramentos": corpo.get("barramentos") or [],
        }
    )


def _conflitos_duplicidade(cursor, os_lista: List[dict], excluir_id: Optional[int]) -> dict:
    barras = sorted({o["DE_BARRAMENTO"] for o in os_lista if o.get("DE_BARRAMENTO")})
    if not barras:
        return {"tem_conflito": False, "total_postes": 0, "total_carteiras": 0, "carteiras": [], "ultima": None}

    por_carteira: Dict[int, set] = {}
    for i in range(0, len(barras), 800):
        lote = barras[i : i + 800]
        marc = ",".join(["?"] * len(lote))
        sql = f"SELECT ID_CARTEIRA, DE_BARRAMENTO FROM {TB_OS} WHERE DE_BARRAMENTO IN ({marc})"
        params: List[Any] = list(lote)
        if excluir_id is not None:
            sql += " AND ID_CARTEIRA <> ?"
            params.append(int(excluir_id))
        cursor.execute(sql, params)
        for idc, barra in cursor.fetchall():
            por_carteira.setdefault(int(idc), set()).add(barra)

    if not por_carteira:
        return {"tem_conflito": False, "total_postes": 0, "total_carteiras": 0, "carteiras": [], "ultima": None}

    ids = list(por_carteira.keys())
    marc = ",".join(["?"] * len(ids))
    cursor.execute(
        f"SELECT ID_CARTEIRA, TITULO, STATUS, DATA_INICIO, DATA_FIM FROM {TB_CARTEIRA} WHERE ID_CARTEIRA IN ({marc})",
        ids,
    )
    metas = {int(r[0]): r for r in cursor.fetchall()}

    repetidos: set = set()
    lista = []
    for idc, conj in por_carteira.items():
        m = metas.get(idc)
        if not m:
            continue
        repetidos |= conj
        lista.append(
            {
                "id_carteira": idc,
                "titulo": m[1],
                "status": m[2],
                "data_inicio": _num(m[3]),
                "data_fim": _num(m[4]),
                "qtd_postes": len(conj),
            }
        )
    lista.sort(key=lambda x: str(x["data_inicio"]), reverse=True)
    return {
        "tem_conflito": len(repetidos) > 0,
        "total_postes": len(repetidos),
        "total_carteiras": len(lista),
        "carteiras": lista,
        "ultima": lista[0] if lista else None,
    }


# ------------------------------------------------------------------
# Persistência
# ------------------------------------------------------------------
def _inserir_os(cursor, id_carteira: int, os_lista: List[dict]) -> None:
    for o in os_lista:
        cursor.execute(
            f"""
            INSERT INTO {TB_OS}
                (ID_CARTEIRA, SEQ, NU_PG_ID, DE_BARRAMENTO, MUNICIPIO, LOCALIDADE, LATITUDE, LONGITUDE,
                 TEM_PROVEDOR, ID_EQUIPE, NOME_EQUIPE, EPS, DATA_PREVISTA, DIA_INDICE, ORDEM_NO_DIA,
                 ESTRATEGIA, SCORE, MOTIVO, STATUS, LINK_GMAPS, LINK_WAZE, CREATED_AT)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TO_DATE(?, 'YYYY-MM-DD'), ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_UTCTIMESTAMP)
            """,
            [
                id_carteira, o["SEQ"], o["NU_PG_ID"], o["DE_BARRAMENTO"], o["MUNICIPIO"], o["LOCALIDADE"],
                o["LATITUDE"], o["LONGITUDE"], o["TEM_PROVEDOR"], o["ID_EQUIPE"], o["NOME_EQUIPE"], o["EPS"],
                o["DATA_PREVISTA"], o["DIA_INDICE"], o["ORDEM_NO_DIA"], o["ESTRATEGIA"], o["SCORE"], o["MOTIVO"],
                o["STATUS"], o["LINK_GMAPS"], o["LINK_WAZE"],
            ],
        )


def _inserir_escopo(cursor, id_carteira: int, corpo: dict) -> None:
    for loc in corpo.get("localidades") or []:
        cursor.execute(
            f"INSERT INTO {TB_ESCOPO} (ID_CARTEIRA, MUNICIPIO, NU_LOCALIDADE_ID) VALUES (?, NULL, ?)",
            [id_carteira, int(loc)],
        )
    if not (corpo.get("localidades") or []):
        for mun in corpo.get("municipios") or []:
            cursor.execute(
                f"INSERT INTO {TB_ESCOPO} (ID_CARTEIRA, MUNICIPIO, NU_LOCALIDADE_ID) VALUES (?, ?, NULL)",
                [id_carteira, str(mun)],
            )


def _detalhe(cursor, id_carteira: int) -> Optional[dict]:
    cursor.execute(
        f"""
        SELECT C.ID_CARTEIRA, C.TITULO, C.FREQUENCIA, C.DATA_INICIO, C.DATA_FIM, C.MODO, C.ESTRATEGIA,
               C.ID_EPS, E.NOME AS EPS, C.QTD_POSTES_DIA, C.QTD_OS, C.QTD_EQUIPES, C.STATUS,
               C.PARAMETROS_JSON, C.CREATED_AT, C.CREATED_BY, C.UPDATED_AT
        FROM {TB_CARTEIRA} C LEFT JOIN {TB_EPS} E ON E.ID_EPS = C.ID_EPS
        WHERE C.ID_CARTEIRA = ?
        """,
        [id_carteira],
    )
    linhas = _rows(cursor)
    if not linhas:
        return None
    carteira = linhas[0]

    cursor.execute(f"SELECT * FROM {TB_OS} WHERE ID_CARTEIRA = ? ORDER BY SEQ", [id_carteira])
    os_lista = _rows(cursor)

    dias = sorted({o["DATA_PREVISTA"] for o in os_lista})
    nomes_equipe = sorted({o["NOME_EQUIPE"] for o in os_lista})
    resumo = {
        "qtd_os": len(os_lista),
        "qtd_dias": len(dias),
        "qtd_equipes": len(nomes_equipe),
        "qtd_municipios": len({o["MUNICIPIO"] for o in os_lista}),
        "sem_provedor": len([o for o in os_lista if o["TEM_PROVEDOR"] == "N"]),
        "com_provedor": len([o for o in os_lista if o["TEM_PROVEDOR"] == "S"]),
    }
    por_dia = []
    for i, d in enumerate(dias):
        do_dia = [o for o in os_lista if o["DATA_PREVISTA"] == d]
        por_dia.append(
            {
                "dia_indice": i + 1,
                "data": d,
                "qtd": len(do_dia),
                "municipios": sorted({o["MUNICIPIO"] for o in do_dia}),
                "equipes": sorted({o["NOME_EQUIPE"] for o in do_dia}),
            }
        )
    por_equipe = [
        {
            "nome": nome,
            "qtd": len([o for o in os_lista if o["NOME_EQUIPE"] == nome]),
            "municipios": sorted({o["MUNICIPIO"] for o in os_lista if o["NOME_EQUIPE"] == nome}),
        }
        for nome in nomes_equipe
    ]
    return {"carteira": carteira, "os": os_lista, "resumo": resumo, "por_dia": por_dia, "por_equipe": por_equipe}


# ==================================================================
# Endpoints
# ==================================================================
def _conn():
    conn = main.get_connection()
    return conn, conn.cursor()


@router.get("/api/carteira/estrategias", response_model=List[dict])
def listar_estrategias():
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(f"SELECT CODIGO, NOME, DESCRICAO, PARAMETROS FROM {TB_ESTRATEGIA} WHERE ATIVO = 'S' ORDER BY ORDEM")
        return _rows(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/carteira/eps", response_model=List[dict])
def listar_eps():
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(f"SELECT ID_EPS, NOME, CNPJ, TIPO_SERVICO, ATIVO FROM {TB_EPS} WHERE ATIVO = 'S' ORDER BY NOME")
        return _rows(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/carteira/eps-atuacao", response_model=List[dict])
def listar_eps_atuacao(
    superintendencia: Optional[str] = Query(None),
    utd: Optional[str] = Query(None),
    setor: Optional[str] = Query(None),
    municipios: Optional[str] = Query(None),
):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        where = " WHERE A.ATIVO = 'S' AND E.ATIVO = 'S'"
        params: List[Any] = []
        if superintendencia:
            where += " AND A.SUPERINTENDENCIA = ?"
            params.append(superintendencia)
        if utd:
            where += " AND A.UTD = ?"
            params.append(utd)
        if setor:
            where += " AND A.SETOR = ?"
            params.append(setor)
        muns = [m.strip().upper() for m in (municipios or "").split(",") if m.strip()]
        if muns:
            where += f" AND UPPER(A.MUNICIPIO) IN ({','.join(['?'] * len(muns))})"
            params += muns
        cursor.execute(
            f"""
            SELECT A.ID_EPS, E.NOME, A.SUPERINTENDENCIA, A.UTD, A.SETOR, A.MUNICIPIO
            FROM {TB_EPS_ATUACAO} A JOIN {TB_EPS} E ON E.ID_EPS = A.ID_EPS
            {where}
            ORDER BY A.SUPERINTENDENCIA, A.UTD, A.SETOR, A.MUNICIPIO, E.NOME
            """,
            params,
        )
        return _rows(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/carteira/equipes", response_model=List[dict])
def listar_equipes(eps: Optional[int] = Query(None)):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        sql = (
            f"SELECT ID_EQUIPE, ID_EPS, NOME, ENCARREGADO, MUNICIPIO_BASE, LATITUDE_BASE, LONGITUDE_BASE, TIPO "
            f"FROM {TB_EQUIPE} WHERE ATIVO = 'S'"
        )
        params: List[Any] = []
        if eps:
            sql += " AND ID_EPS = ?"
            params.append(int(eps))
        sql += " ORDER BY NOME"
        cursor.execute(sql, params)
        return _rows(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/carteira/areas", response_model=List[dict])
def listar_areas():
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(
            f"""
            SELECT BP.MUNICIPIO, BP.NU_LOCALIDADE_ID, MAX(BP.LOCALIDADE) AS LOCALIDADE,
                   COUNT(*) AS TOTAL,
                   SUM(CASE WHEN {_TEM_PROVEDOR} = 'N' THEN 1 ELSE 0 END) AS SEM_PROVEDOR
            FROM {TB_BASE} BP
            WHERE BP.ATIVO = 'S'
            GROUP BY BP.MUNICIPIO, BP.NU_LOCALIDADE_ID
            """
        )
        por_mun: Dict[str, dict] = {}
        for mun, loc_id, loc, total, sem_prov in cursor.fetchall():
            m = por_mun.setdefault(mun, {"MUNICIPIO": mun, "TOTAL": 0, "SEM_PROVEDOR": 0, "_loc": {}})
            total = int(total or 0)
            sem_prov = int(sem_prov or 0)
            m["TOTAL"] += total
            m["SEM_PROVEDOR"] += sem_prov
            m["_loc"][loc_id] = {
                "NU_LOCALIDADE_ID": int(loc_id) if loc_id is not None else None,
                "LOCALIDADE": loc,
                "TOTAL": total,
                "SEM_PROVEDOR": sem_prov,
            }
        lista = []
        for m in por_mun.values():
            locs = sorted(m.pop("_loc").values(), key=lambda x: (x["LOCALIDADE"] or ""))
            lista.append({**m, "localidades": locs})
        lista.sort(key=lambda x: x["SEM_PROVEDOR"], reverse=True)
        return lista
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/carteira/preview")
def preview(corpo: dict = Body(...)):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        r = _montar_carteira(cursor, corpo or {})
        if "erro" in r:
            raise HTTPException(status_code=400, detail=r["erro"])
        dup = _conflitos_duplicidade(cursor, r["os"], corpo.get("id_carteira"))
        return {
            "carteira": r["cabecalho"],
            "os": r["os"],
            "resumo": r["resumo"],
            "por_dia": r["por_dia"],
            "por_equipe": r["por_equipe"],
            "duplicidade": dup,
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


@router.post("/api/carteira/gerar")
def gerar(corpo: dict = Body(...)):
    corpo = corpo or {}
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        r = _montar_carteira(cursor, corpo)
        if "erro" in r:
            raise HTTPException(status_code=400, detail=r["erro"])

        dup = _conflitos_duplicidade(cursor, r["os"], None)
        if dup["tem_conflito"] and corpo.get("forcar") is not True:
            conn.rollback()
            return _resposta_409(dup)

        cab = r["cabecalho"]
        cursor.execute(
            f"""
            INSERT INTO {TB_CARTEIRA}
                (TITULO, FREQUENCIA, DATA_INICIO, DATA_FIM, MODO, ESTRATEGIA, ID_EPS, QTD_POSTES_DIA,
                 QTD_OS, QTD_EQUIPES, STATUS, PARAMETROS_JSON, CREATED_AT, CREATED_BY, UPDATED_AT)
            VALUES (?, ?, TO_DATE(?, 'YYYY-MM-DD'), TO_DATE(?, 'YYYY-MM-DD'), ?, ?, ?, ?, ?, ?, 'RASCUNHO', ?,
                    CURRENT_UTCTIMESTAMP, ?, CURRENT_UTCTIMESTAMP)
            """,
            [
                cab["TITULO"], cab["FREQUENCIA"], cab["DATA_INICIO"], cab["DATA_FIM"], cab["MODO"],
                cab["ESTRATEGIA"], cab["ID_EPS"], cab["QTD_POSTES_DIA"], cab["QTD_OS"], cab["QTD_EQUIPES"],
                _params_json(corpo), corpo.get("usuario") or "api",
            ],
        )
        id_carteira = _ultimo_id(cursor, TB_CARTEIRA, "ID_CARTEIRA")
        _inserir_escopo(cursor, id_carteira, corpo)
        _inserir_os(cursor, id_carteira, r["os"])
        conn.commit()

        det = _detalhe(cursor, id_carteira)
        return {
            "success": True,
            "id_carteira": id_carteira,
            "carteira": det["carteira"],
            "resumo": {**r["resumo"]},
            "por_dia": r["por_dia"],
            "por_equipe": r["por_equipe"],
            "duplicidade": dup,
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


def _resposta_409(dup: dict):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=409,
        content={
            "erro_duplicidade": True,
            "detail": f"{dup['total_postes']} poste(s) já estão em {dup['total_carteiras']} outra(s) carteira(s).",
            "duplicidade": dup,
        },
    )


@router.post("/api/carteira/{id_carteira}/regerar")
def regerar(id_carteira: int, corpo: dict = Body(...)):
    corpo = corpo or {}
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(f"SELECT STATUS FROM {TB_CARTEIRA} WHERE ID_CARTEIRA = ?", [id_carteira])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Carteira não encontrada")
        if row[0] != "RASCUNHO":
            raise HTTPException(status_code=409, detail="Só é possível regerar uma carteira em rascunho.")

        r = _montar_carteira(cursor, corpo)
        if "erro" in r:
            raise HTTPException(status_code=400, detail=r["erro"])

        dup = _conflitos_duplicidade(cursor, r["os"], id_carteira)
        if dup["tem_conflito"] and corpo.get("forcar") is not True:
            conn.rollback()
            return _resposta_409(dup)

        cab = r["cabecalho"]
        cursor.execute(
            f"""
            UPDATE {TB_CARTEIRA}
               SET TITULO = ?, FREQUENCIA = ?, DATA_INICIO = TO_DATE(?, 'YYYY-MM-DD'),
                   DATA_FIM = TO_DATE(?, 'YYYY-MM-DD'), MODO = ?, ESTRATEGIA = ?, ID_EPS = ?,
                   QTD_POSTES_DIA = ?, QTD_OS = ?, QTD_EQUIPES = ?, STATUS = 'RASCUNHO',
                   PARAMETROS_JSON = ?, UPDATED_AT = CURRENT_UTCTIMESTAMP
             WHERE ID_CARTEIRA = ?
            """,
            [
                cab["TITULO"], cab["FREQUENCIA"], cab["DATA_INICIO"], cab["DATA_FIM"], cab["MODO"],
                cab["ESTRATEGIA"], cab["ID_EPS"], cab["QTD_POSTES_DIA"], cab["QTD_OS"], cab["QTD_EQUIPES"],
                _params_json(corpo), id_carteira,
            ],
        )
        cursor.execute(f"DELETE FROM {TB_OS} WHERE ID_CARTEIRA = ?", [id_carteira])
        cursor.execute(f"DELETE FROM {TB_ESCOPO} WHERE ID_CARTEIRA = ?", [id_carteira])
        _inserir_escopo(cursor, id_carteira, corpo)
        _inserir_os(cursor, id_carteira, r["os"])
        conn.commit()

        det = _detalhe(cursor, id_carteira)
        return {
            "success": True,
            "id_carteira": id_carteira,
            "carteira": det["carteira"],
            "resumo": r["resumo"],
            "por_dia": r["por_dia"],
            "por_equipe": r["por_equipe"],
            "duplicidade": dup,
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


@router.get("/api/carteira", response_model=List[dict])
def listar_carteiras():
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(
            f"""
            SELECT C.ID_CARTEIRA, C.TITULO, C.FREQUENCIA, C.DATA_INICIO, C.DATA_FIM, C.MODO, C.ESTRATEGIA,
                   C.ID_EPS, E.NOME AS EPS, C.QTD_POSTES_DIA, C.QTD_OS, C.QTD_EQUIPES, C.STATUS,
                   C.PARAMETROS_JSON, C.CREATED_AT, C.CREATED_BY, C.UPDATED_AT
            FROM {TB_CARTEIRA} C LEFT JOIN {TB_EPS} E ON E.ID_EPS = C.ID_EPS
            ORDER BY C.CREATED_AT DESC
            """
        )
        return _rows(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/carteira/{id_carteira}")
def obter_carteira(id_carteira: int):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        det = _detalhe(cursor, id_carteira)
        if not det:
            raise HTTPException(status_code=404, detail="Carteira não encontrada")
        return det
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.patch("/api/carteira/{id_carteira}/status")
def mudar_status(id_carteira: int, corpo: dict = Body(...)):
    novo = (corpo or {}).get("status")
    if novo not in STATUS_VALIDOS:
        raise HTTPException(status_code=400, detail="status inválido")
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(f"SELECT 1 FROM {TB_CARTEIRA} WHERE ID_CARTEIRA = ?", [id_carteira])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Carteira não encontrada")
        cursor.execute(
            f"UPDATE {TB_CARTEIRA} SET STATUS = ?, UPDATED_AT = CURRENT_UTCTIMESTAMP WHERE ID_CARTEIRA = ?",
            [novo, id_carteira],
        )
        conn.commit()
        return {"success": True, "status": novo}
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


@router.delete("/api/carteira/{id_carteira}")
def excluir_carteira(id_carteira: int):
    conn = cursor = None
    try:
        conn, cursor = _conn()
        _garantir_tabelas(cursor)
        conn.commit()
        cursor.execute(f"SELECT 1 FROM {TB_CARTEIRA} WHERE ID_CARTEIRA = ?", [id_carteira])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Carteira não encontrada")
        cursor.execute(f"DELETE FROM {TB_OS} WHERE ID_CARTEIRA = ?", [id_carteira])
        cursor.execute(f"DELETE FROM {TB_ESCOPO} WHERE ID_CARTEIRA = ?", [id_carteira])
        cursor.execute(f"DELETE FROM {TB_CARTEIRA} WHERE ID_CARTEIRA = ?", [id_carteira])
        conn.commit()
        return {"success": True, "id_carteira": id_carteira}
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
