# -*- coding: utf-8 -*-
"""
Importador incremental dos 14 arquivos restantes de Uso Compartilhado -
Coelba (pasta `base/`), complementando o que já foi importado da parte_2.

Diferente do importar_postes_ocupacao.py (arquivo único, banco vazio), este
script:
- Processa vários arquivos, um de cada vez, com commit ao final de cada um
  (se cair no meio, os arquivos já processados ficam gravados).
- Consulta o estado atual do banco (BARRAMENTOs e CNPJs já existentes) antes
  de cada arquivo, pra nunca tentar inserir poste/operadora duplicado.
- Continua a numeracao dos postes sinteticos (SEM_BARRAMENTO_N) e dos IDs de
  OPERADORA de onde a carga anterior parou.

Uso:
    python importar_postes_ocupacao_lote.py            -> só mostra o preview
                                                            agregado (todos os
                                                            14 arquivos), sem
                                                            gravar nada.
    python importar_postes_ocupacao_lote.py --commit    -> grava de verdade,
                                                            arquivo por arquivo.
"""
import argparse
import glob
import os
import re
import sys
from datetime import datetime

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"c:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\portal-api - Copia")
import main  # noqa: E402

PASTA_BASE = r"C:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\base"
USUARIO_IMPORTACAO = "CLB349328"
TAMANHO_LOTE = 5000

TB_POSTE = 'CLB349328."PORTAL_COMPARTILHAMENTO_POSTE"'
TB_OPERADORA = 'CLB349328."PORTAL_COMPARTILHAMENTO_OPERADORA"'
TB_OCUPACAO = 'CLB349328."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO"'


def limpar_texto(valor):
    if pd.isna(valor):
        return None
    texto = str(valor).strip()
    return texto or None


def limpar_cnpj(valor):
    if pd.isna(valor):
        return None
    digitos = "".join(ch for ch in str(valor) if ch.isdigit())
    return digitos or None


def carregar_estado_atual(cursor):
    """Le do banco o que ja existe, pra evitar duplicar poste/operadora
    ja gravados nas cargas anteriores (parte_2 e/ou execucoes parciais
    deste mesmo script)."""
    cursor.execute(f'SELECT "BARRAMENTO" FROM {TB_POSTE}')
    barramentos_existentes = {row[0] for row in cursor.fetchall()}

    cursor.execute(f'SELECT "CNPJ", "ID" FROM {TB_OPERADORA}')
    cnpj_para_id = {row[0]: row[1] for row in cursor.fetchall()}

    cursor.execute(f'SELECT MAX("ID") FROM {TB_OPERADORA}')
    proximo_id_operadora = (cursor.fetchone()[0] or 0) + 1

    maior_sintetico = 0
    for barramento in barramentos_existentes:
        m = re.match(r"^SEM_BARRAMENTO_(\d+)$", barramento or "")
        if m:
            maior_sintetico = max(maior_sintetico, int(m.group(1)))

    return barramentos_existentes, cnpj_para_id, proximo_id_operadora, maior_sintetico


def transformar_arquivo(caminho, barramentos_existentes, cnpj_para_id, proximo_id_operadora, contador_sintetico):
    """Le e transforma um arquivo, retornando so o que e NOVO (nao gravado
    ainda): postes novos, operadoras novas, e todas as ocupacoes do arquivo
    (deduplicadas por linha inteira)."""
    df = pd.read_excel(caminho, sheet_name="Dados")
    total_bruto = len(df)

    df = df.drop_duplicates().reset_index(drop=True)
    duplicadas_removidas = total_bruto - len(df)

    df["BOARD_NAME"] = df["BoardName"].apply(limpar_texto)
    df["ORGANIZATION_NAME"] = df["OrganizationName"].apply(limpar_texto)
    df["CNPJ"] = df["OrgCnpj"].apply(limpar_cnpj)

    sem_barrament = df["Barrament"].isna()
    df["BARRAMENTO"] = df["Barrament"].apply(limpar_texto)
    for idx in df.index[sem_barrament]:
        contador_sintetico += 1
        df.at[idx, "BARRAMENTO"] = f"SEM_BARRAMENTO_{contador_sintetico}"
    df["BARRAMENTO_OFICIAL"] = "S"
    df.loc[sem_barrament, "BARRAMENTO_OFICIAL"] = "N"

    # Postes: novos = ainda nao existem no banco nem em arquivos ja
    # processados nesta mesma execucao.
    postes_arquivo = df[["BARRAMENTO", "X", "Y", "BARRAMENTO_OFICIAL"]].drop_duplicates(subset=["BARRAMENTO"])
    postes_novos = postes_arquivo[~postes_arquivo["BARRAMENTO"].isin(barramentos_existentes)].reset_index(drop=True)

    # Operadoras: mesmo raciocinio, chave e o CNPJ.
    com_cnpj = df.dropna(subset=["CNPJ"])
    nomes_por_cnpj = (
        com_cnpj.groupby("CNPJ")["ORGANIZATION_NAME"]
        .agg(lambda serie: serie.value_counts().sort_index().idxmax())
        .reset_index()
        .rename(columns={"ORGANIZATION_NAME": "RAZAO_SOCIAL"})
    )
    operadoras_novas_df = nomes_por_cnpj[~nomes_por_cnpj["CNPJ"].isin(cnpj_para_id)].reset_index(drop=True)
    operadoras_novas_df.insert(0, "ID", range(proximo_id_operadora, proximo_id_operadora + len(operadoras_novas_df)))

    # Mapa CNPJ->ID valido pra este arquivo = o que ja existia + o que
    # acabou de ser descoberto como novo aqui.
    mapa_cnpj_id_arquivo = dict(cnpj_para_id)
    mapa_cnpj_id_arquivo.update(dict(zip(operadoras_novas_df["CNPJ"], operadoras_novas_df["ID"])))
    df["ID_OPERADORA"] = df["CNPJ"].map(mapa_cnpj_id_arquivo)

    ocupacoes = df[["BARRAMENTO", "BOARD_NAME", "ORGANIZATION_NAME", "ID_OPERADORA"]].copy()

    return {
        "total_bruto": total_bruto,
        "duplicadas_removidas": duplicadas_removidas,
        "postes_novos": postes_novos,
        "operadoras_novas": operadoras_novas_df,
        "ocupacoes": ocupacoes,
        "qtd_sinteticos": int(sem_barrament.sum()),
        "contador_sintetico_final": contador_sintetico,
    }


def inserir_em_lote(cursor, sql, linhas):
    for inicio in range(0, len(linhas), TAMANHO_LOTE):
        lote = linhas[inicio: inicio + TAMANHO_LOTE]
        cursor.executemany(sql, lote)


def gravar_arquivo(cursor, resultado, agora):
    postes_novos = resultado["postes_novos"]
    operadoras_novas = resultado["operadoras_novas"]
    ocupacoes = resultado["ocupacoes"]

    linhas_postes = [
        [row.BARRAMENTO, row.X, row.Y, row.BARRAMENTO_OFICIAL, agora, USUARIO_IMPORTACAO]
        for row in postes_novos.itertuples(index=False)
    ]
    inserir_em_lote(
        cursor,
        f'INSERT INTO {TB_POSTE} ("BARRAMENTO","X","Y","BARRAMENTO_OFICIAL","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?,?)',
        linhas_postes,
    )

    linhas_operadoras = [
        [row.ID, row.CNPJ, row.RAZAO_SOCIAL, agora, USUARIO_IMPORTACAO]
        for row in operadoras_novas.itertuples(index=False)
    ]
    inserir_em_lote(
        cursor,
        f'INSERT INTO {TB_OPERADORA} ("ID","CNPJ","RAZAO_SOCIAL","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?)',
        linhas_operadoras,
    )

    linhas_ocupacoes = [
        [
            row.BARRAMENTO,
            row.BOARD_NAME,
            row.ORGANIZATION_NAME,
            None if pd.isna(row.ID_OPERADORA) else int(row.ID_OPERADORA),
            agora,
            USUARIO_IMPORTACAO,
        ]
        for row in ocupacoes.itertuples(index=False)
    ]
    inserir_em_lote(
        cursor,
        f'INSERT INTO {TB_OCUPACAO} ("BARRAMENTO","BOARD_NAME","ORGANIZATION_NAME","ID_OPERADORA","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?,?)',
        linhas_ocupacoes,
    )

    return len(linhas_postes), len(linhas_operadoras), len(linhas_ocupacoes)


def main_importador():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Grava de verdade no HANA (sem isso, so mostra o preview)")
    args = parser.parse_args()

    arquivos = sorted(glob.glob(os.path.join(PASTA_BASE, "*.xlsx")))
    print(f"{len(arquivos)} arquivos encontrados em {PASTA_BASE}")

    conn = main.get_connection()
    cursor = conn.cursor()
    barramentos_existentes, cnpj_para_id, proximo_id_operadora, contador_sintetico = carregar_estado_atual(cursor)
    print(
        f"Estado atual do banco: {len(barramentos_existentes)} postes, "
        f"{len(cnpj_para_id)} operadoras, proximo ID operadora={proximo_id_operadora}, "
        f"maior SEM_BARRAMENTO existente={contador_sintetico}"
    )

    agora = datetime.now()
    total_postes_novos = 0
    total_operadoras_novas = 0
    total_ocupacoes = 0
    total_bruto_geral = 0
    total_duplicadas_geral = 0

    for indice, caminho in enumerate(arquivos, start=1):
        nome = os.path.basename(caminho)
        print(f"\n[{indice}/{len(arquivos)}] Lendo {nome} ...")

        resultado = transformar_arquivo(
            caminho, barramentos_existentes, cnpj_para_id, proximo_id_operadora, contador_sintetico
        )

        qtd_postes = len(resultado["postes_novos"])
        qtd_operadoras = len(resultado["operadoras_novas"])
        qtd_ocupacoes = len(resultado["ocupacoes"])

        print(
            f"  linhas={resultado['total_bruto']:,} duplicadas_removidas={resultado['duplicadas_removidas']:,} "
            f"postes_novos={qtd_postes:,} operadoras_novas={qtd_operadoras:,} ocupacoes={qtd_ocupacoes:,} "
            f"sinteticos={resultado['qtd_sinteticos']}"
        )

        total_bruto_geral += resultado["total_bruto"]
        total_duplicadas_geral += resultado["duplicadas_removidas"]
        total_postes_novos += qtd_postes
        total_operadoras_novas += qtd_operadoras
        total_ocupacoes += qtd_ocupacoes

        if args.commit:
            n_postes, n_operadoras, n_ocupacoes = gravar_arquivo(cursor, resultado, agora)
            conn.commit()
            print(f"  gravado: {n_postes:,} postes, {n_operadoras:,} operadoras, {n_ocupacoes:,} ocupacoes (commit ok)")

            barramentos_existentes.update(resultado["postes_novos"]["BARRAMENTO"])
            cnpj_para_id.update(dict(zip(resultado["operadoras_novas"]["CNPJ"], resultado["operadoras_novas"]["ID"])))
            proximo_id_operadora += qtd_operadoras
        else:
            # Preview: assume que os "novos" deste arquivo passam a existir
            # pros proximos arquivos do loop, pra nao contar 2x entre arquivos.
            barramentos_existentes = barramentos_existentes | set(resultado["postes_novos"]["BARRAMENTO"])
            cnpj_para_id = {**cnpj_para_id, **dict(zip(resultado["operadoras_novas"]["CNPJ"], resultado["operadoras_novas"]["ID"]))}
            proximo_id_operadora += qtd_operadoras

        contador_sintetico = resultado["contador_sintetico_final"]

    print("\n" + "=" * 70)
    print("RESUMO GERAL" + ("" if args.commit else " (PREVIEW - nada foi gravado)"))
    print("=" * 70)
    print(f"Linhas lidas no total: {total_bruto_geral:,}")
    print(f"Duplicatas removidas: {total_duplicadas_geral:,}")
    print(f"Postes novos: {total_postes_novos:,}")
    print(f"Operadoras novas: {total_operadoras_novas:,}")
    print(f"Ocupacoes novas: {total_ocupacoes:,}")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main_importador()
