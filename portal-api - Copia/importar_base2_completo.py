# -*- coding: utf-8 -*-
"""
Recarga completa de Postes/Ocupações (Uso Compartilhado - Coelba) a partir
da pasta `base2` - base nova, substitui a anterior por inteiro.

Diferente dos importadores antigos (incrementais, nunca apagam nada), este
script:
- Lê os N arquivos de `base2` (aba "Sheet1"), concatena tudo e deduplica
  (linha inteira) no conjunto combinado.
- Apaga TODO o conteúdo de PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO,
  PORTAL_COMPARTILHAMENTO_POSTE e PORTAL_COMPARTILHAMENTO_OPERADORA (nessa
  ordem, filhos antes dos pais).
- Recria as 3 tabelas do zero com os dados novos.

Uso:
    python importar_base2_completo.py            -> só mostra o preview
                                                      (contagens), não muda
                                                      nada no banco.
    python importar_base2_completo.py --commit    -> apaga e grava de
                                                      verdade no HANA.
"""
import argparse
import glob
import os
import sys
from datetime import datetime

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"c:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\portal-api - Copia")
import main  # noqa: E402

PASTA_BASE2 = r"C:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\base2"
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


def carregar_arquivos():
    arquivos = sorted(glob.glob(os.path.join(PASTA_BASE2, "*.xlsx")))
    if not arquivos:
        raise SystemExit(f"Nenhum .xlsx encontrado em {PASTA_BASE2}")

    partes = []
    total_bruto = 0
    for caminho in arquivos:
        df = pd.read_excel(caminho, sheet_name="Sheet1")
        total_bruto += len(df)
        print(f"  {os.path.basename(caminho)}: {len(df):,} linhas")
        partes.append(df)

    return pd.concat(partes, ignore_index=True), total_bruto


def transformar(df: pd.DataFrame, agora: datetime):
    """Deduplica (linha inteira igual, jah combinando todos os arquivos) e
    monta os 3 dataframes finais."""
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
    for idx in df.index[sem_barrament]:
        contador += 1
        df.at[idx, "BARRAMENTO"] = f"SEM_BARRAMENTO_{contador}"
    df["BARRAMENTO_OFICIAL"] = "S"
    df.loc[sem_barrament, "BARRAMENTO_OFICIAL"] = "N"

    # POSTE: um por BARRAMENTO.
    postes = (
        df[["BARRAMENTO", "X", "Y", "BARRAMENTO_OFICIAL"]]
        .drop_duplicates(subset=["BARRAMENTO"])
        .reset_index(drop=True)
    )

    # OPERADORA: uma por CNPJ, nome canonico = mais frequente p/ aquele CNPJ.
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

    return postes, operadoras, ocupacoes, duplicadas_removidas, int(sem_barrament.sum())


def mostrar_preview(postes, operadoras, ocupacoes, duplicadas_removidas, qtd_sinteticos, total_bruto, contagem_atual):
    print("\n" + "=" * 70)
    print("PREVIEW DA RECARGA - nada foi gravado no banco ainda")
    print("=" * 70)
    print(f"Linhas lidas nos {len(glob.glob(os.path.join(PASTA_BASE2, '*.xlsx')))} arquivos: {total_bruto:,}")
    print(f"Linhas duplicadas removidas:                {duplicadas_removidas:,}")
    print()
    print("Estado ATUAL do banco (sera APAGADO):")
    for tabela, qtd in contagem_atual.items():
        print(f"  {tabela}: {qtd:,}")
    print()
    print("Estado NOVO apos a recarga:")
    print(f"  POSTE: {len(postes):,} (oficiais={( postes['BARRAMENTO_OFICIAL'] == 'S').sum():,}, sinteticos={qtd_sinteticos:,})")
    print(f"  OPERADORA: {len(operadoras):,}")
    print(f"  POSTE_OCUPACAO: {len(ocupacoes):,}")


def inserir_em_lote(cursor, sql, linhas):
    for inicio in range(0, len(linhas), TAMANHO_LOTE):
        lote = linhas[inicio: inicio + TAMANHO_LOTE]
        cursor.executemany(sql, lote)


def contar_atual(cursor):
    contagens = {}
    for nome, tabela in [
        ("PORTAL_COMPARTILHAMENTO_POSTE", TB_POSTE),
        ("PORTAL_COMPARTILHAMENTO_OPERADORA", TB_OPERADORA),
        ("PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO", TB_OCUPACAO),
    ]:
        cursor.execute(f"SELECT COUNT(*) FROM {tabela}")
        contagens[nome] = cursor.fetchone()[0] or 0
    return contagens


def apagar_e_gravar(postes, operadoras, ocupacoes, agora):
    conn = main.get_connection()
    cursor = conn.cursor()
    try:
        print("\nApagando dados atuais (filhos antes dos pais)...")
        cursor.execute(f"DELETE FROM {TB_OCUPACAO}")
        print(f"  {TB_OCUPACAO}: apagado")
        cursor.execute(f"DELETE FROM {TB_POSTE}")
        print(f"  {TB_POSTE}: apagado")
        cursor.execute(f"DELETE FROM {TB_OPERADORA}")
        print(f"  {TB_OPERADORA}: apagado")

        print("\nGravando dados novos (pais antes dos filhos)...")
        linhas_postes = [
            [row.BARRAMENTO, row.X, row.Y, row.BARRAMENTO_OFICIAL, agora, USUARIO_IMPORTACAO]
            for row in postes.itertuples(index=False)
        ]
        inserir_em_lote(
            cursor,
            f'INSERT INTO {TB_POSTE} ("BARRAMENTO","X","Y","BARRAMENTO_OFICIAL","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?,?)',
            linhas_postes,
        )
        print(f"  POSTE: {len(linhas_postes):,} linhas gravadas.")

        linhas_operadoras = [
            [row.ID, row.CNPJ, row.RAZAO_SOCIAL, agora, USUARIO_IMPORTACAO]
            for row in operadoras.itertuples(index=False)
        ]
        inserir_em_lote(
            cursor,
            f'INSERT INTO {TB_OPERADORA} ("ID","CNPJ","RAZAO_SOCIAL","CREATED_AT","CREATED_BY") VALUES (?,?,?,?,?)',
            linhas_operadoras,
        )
        print(f"  OPERADORA: {len(linhas_operadoras):,} linhas gravadas.")

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
        print(f"  POSTE_OCUPACAO: {len(linhas_ocupacoes):,} linhas gravadas.")

        conn.commit()
        print("\nCommit realizado com sucesso.")
    except Exception:
        conn.rollback()
        print("\nERRO - rollback realizado, banco preservado no estado anterior.")
        raise
    finally:
        cursor.close()
        conn.close()


def main_importador():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Apaga e grava de verdade no HANA (sem isso, so mostra o preview)")
    args = parser.parse_args()

    print(f"Lendo arquivos de {PASTA_BASE2} ...")
    df, total_bruto = carregar_arquivos()

    agora = datetime.now()
    postes, operadoras, ocupacoes, duplicadas_removidas, qtd_sinteticos = transformar(df, agora)

    conn = main.get_connection()
    cursor = conn.cursor()
    contagem_atual = contar_atual(cursor)
    cursor.close()
    conn.close()

    mostrar_preview(postes, operadoras, ocupacoes, duplicadas_removidas, qtd_sinteticos, total_bruto, contagem_atual)

    if not args.commit:
        print("\n(rodado sem --commit: nenhuma escrita foi feita no banco)")
        return

    print("\n--commit informado: apagando e gravando no HANA...")
    apagar_e_gravar(postes, operadoras, ocupacoes, agora)


if __name__ == "__main__":
    main_importador()
