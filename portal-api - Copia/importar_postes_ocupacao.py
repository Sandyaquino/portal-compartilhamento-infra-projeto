# -*- coding: utf-8 -*-
"""
Importador SAP HANA - Postes e Ocupações (Uso Compartilhado - Coelba).

Lê o Excel de origem, normaliza em 3 tabelas (POSTE, OPERADORA,
POSTE_OCUPACAO) e grava em lote no HANA (nunca linha a linha).

Uso:
    python importar_postes_ocupacao.py            -> só mostra o preview
                                                       (contagens + 10 linhas),
                                                       não escreve nada no banco.
    python importar_postes_ocupacao.py --commit    -> roda o preview e, se
                                                       tudo bater, grava de
                                                       verdade em lote.
"""
import argparse
import sys
from datetime import datetime

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, r"c:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\portal-api - Copia")
import main  # noqa: E402

ARQUIVO = r"C:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\Uso Compartilhado - Coelba_parte_2.xlsx"
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


def transformar(df: pd.DataFrame, agora: datetime):
    """Deduplica (linha inteira igual) e monta os 3 dataframes finais."""
    antes = len(df)
    df = df.drop_duplicates().reset_index(drop=True)
    duplicadas_removidas = antes - len(df)

    df["BOARD_NAME"] = df["BoardName"].apply(limpar_texto)
    df["ORGANIZATION_NAME"] = df["OrganizationName"].apply(limpar_texto)
    df["CNPJ"] = df["OrgCnpj"].apply(limpar_cnpj)

    # Barrament ausente -> codigo sintetico unico por linha, mantendo a
    # coordenada real (sao postes fisicos distintos, so sem codigo oficial).
    sem_barrament = df["Barrament"].isna()
    df["BARRAMENTO"] = df["Barrament"].apply(limpar_texto)
    contador = 0
    indices_sinteticos = df.index[sem_barrament].tolist()
    for idx in indices_sinteticos:
        contador += 1
        df.at[idx, "BARRAMENTO"] = f"SEM_BARRAMENTO_{contador}"
    df["BARRAMENTO_OFICIAL"] = "S"
    df.loc[sem_barrament, "BARRAMENTO_OFICIAL"] = "N"

    # POSTE: um por BARRAMENTO. X/Y ja confirmados fixos por Barrament real;
    # os sinteticos sao 1 linha cada, entao tambem viram 1 poste cada.
    postes = (
        df[["BARRAMENTO", "X", "Y", "BARRAMENTO_OFICIAL"]]
        .drop_duplicates(subset=["BARRAMENTO"])
        .reset_index(drop=True)
    )

    # OPERADORA: uma por CNPJ, nome canonico = mais frequente p/ aquele CNPJ
    # (empate: ordem alfabetica), para o caso raro de grafias diferentes.
    com_cnpj = df.dropna(subset=["CNPJ"])
    nomes_por_cnpj = (
        com_cnpj.groupby("CNPJ")["ORGANIZATION_NAME"]
        .agg(lambda serie: serie.value_counts().sort_index().idxmax())
        .reset_index()
        .rename(columns={"ORGANIZATION_NAME": "RAZAO_SOCIAL"})
    )
    operadoras = nomes_por_cnpj.reset_index(drop=True)
    operadoras.insert(0, "ID", range(1, len(operadoras) + 1))
    cnpj_para_id = dict(zip(operadoras["CNPJ"], operadoras["ID"]))

    df["ID_OPERADORA"] = df["CNPJ"].map(cnpj_para_id)

    ocupacoes = df[["BARRAMENTO", "BOARD_NAME", "ORGANIZATION_NAME", "ID_OPERADORA"]].copy()

    return postes, operadoras, ocupacoes, duplicadas_removidas, len(indices_sinteticos)


def mostrar_preview(postes, operadoras, ocupacoes, duplicadas_removidas, qtd_sinteticos, total_bruto):
    print("=" * 70)
    print("PREVIEW DA IMPORTACAO - nada foi gravado no banco ainda")
    print("=" * 70)
    print(f"Linhas no arquivo original:          {total_bruto:,}")
    print(f"Linhas duplicadas removidas:          {duplicadas_removidas:,}")
    print(f"Ocupacoes a inserir (POSTE_OCUPACAO): {len(ocupacoes):,}")
    print(f"Postes unicos a inserir (POSTE):      {len(postes):,}")
    print(f"  - com codigo oficial:               {(postes['BARRAMENTO_OFICIAL'] == 'S').sum():,}")
    print(f"  - sinteticos (sem Barrament):        {qtd_sinteticos:,}")
    print(f"Operadoras unicas a inserir (OPERADORA): {len(operadoras):,}")
    print()
    print("--- 10 primeiras linhas de POSTE_OCUPACAO (ja tratadas) ---")
    preview = ocupacoes.head(10).merge(postes[["BARRAMENTO", "X", "Y"]], on="BARRAMENTO", how="left")
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(preview.to_string())


def inserir_em_lote(cursor, sql, linhas):
    for inicio in range(0, len(linhas), TAMANHO_LOTE):
        lote = linhas[inicio: inicio + TAMANHO_LOTE]
        cursor.executemany(sql, lote)


def gravar(postes, operadoras, ocupacoes, agora):
    conn = main.get_connection()
    cursor = conn.cursor()
    try:
        linhas_postes = [
            [row.BARRAMENTO, row.X, row.Y, row.BARRAMENTO_OFICIAL, agora, USUARIO_IMPORTACAO]
            for row in postes.itertuples(index=False)
        ]
        inserir_em_lote(
            cursor,
            f'INSERT INTO {TB_POSTE} ("BARRAMENTO","X","Y","BARRAMENTO_OFICIAL","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?,?)',
            linhas_postes,
        )
        print(f"POSTE: {len(linhas_postes):,} linhas gravadas.")

        linhas_operadoras = [
            [row.ID, row.CNPJ, row.RAZAO_SOCIAL, agora, USUARIO_IMPORTACAO]
            for row in operadoras.itertuples(index=False)
        ]
        inserir_em_lote(
            cursor,
            f'INSERT INTO {TB_OPERADORA} ("ID","CNPJ","RAZAO_SOCIAL","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?)',
            linhas_operadoras,
        )
        print(f"OPERADORA: {len(linhas_operadoras):,} linhas gravadas.")

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
        print(f"POSTE_OCUPACAO: {len(linhas_ocupacoes):,} linhas gravadas.")

        conn.commit()
        print("\nCommit realizado com sucesso.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def main_importador():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Grava de verdade no HANA (sem isso, so mostra o preview)")
    args = parser.parse_args()

    print(f"Lendo {ARQUIVO} ...")
    df = pd.read_excel(ARQUIVO, sheet_name="Dados")
    total_bruto = len(df)

    agora = datetime.now()
    postes, operadoras, ocupacoes, duplicadas_removidas, qtd_sinteticos = transformar(df, agora)

    mostrar_preview(postes, operadoras, ocupacoes, duplicadas_removidas, qtd_sinteticos, total_bruto)

    if not args.commit:
        print("\n(rodado sem --commit: nenhuma escrita foi feita no banco)")
        return

    print("\n--commit informado: gravando no HANA...")
    gravar(postes, operadoras, ocupacoes, agora)


if __name__ == "__main__":
    main_importador()
