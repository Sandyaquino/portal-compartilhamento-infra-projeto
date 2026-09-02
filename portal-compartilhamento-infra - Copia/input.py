# -*- coding: utf-8 -*-
"""
Importador SAP HANA - PORTAL_COMPARTILHAMENTO_TECNICO

Objetivo:
- Ler o Excel: Controle Diário de Campo - Técnicos(15001-19747).xlsx
- Limpar e padronizar dados
- Tratar duplicidades pela chave de negócio:
    NUMERO_OS | DATA_EXECUCAO | TECNICO
- Gerar CHAVE_NEGOCIO e HASH_NEGOCIO
- Fazer UPSERT no SAP HANA:
    - UPDATE se CHAVE_NEGOCIO já existir
    - INSERT se CHAVE_NEGOCIO não existir
- Não parar a carga quando um registro der erro
- Mostrar quais registros não subiram
- Gerar planilhas de rejeitados e erros de banco

IMPORTANTE:
- Não deixe senha fixa no código.
- Preferencialmente configure as variáveis de ambiente:
    HANA_HOST
    HANA_PORT
    HANA_USER
    HANA_PASSWORD
"""

import os
import hashlib
from datetime import datetime
from pathlib import Path

import pandas as pd
from hdbcli import dbapi


# =====================================================
# CONFIGURAÇÕES
# =====================================================

ARQUIVO = r"Controle Diário de Campo - Técnicos(15001-19747).xlsx"

HOST = os.getenv("HANA_HOST", "BRNEO695")
PORT = int(os.getenv("HANA_PORT", "30015"))
USER = os.getenv("HANA_USER", "CLB349328")
PASSWORD = os.getenv("HANA_PASSWORD", "S@ndra1960#123")
USUARIO_IMPORTACAO = os.getenv("HANA_USER", "CLB349328")

SCHEMA = "CLB349328"
TABELA = "PORTAL_COMPARTILHAMENTO_TECNICO"

# Se True, corta textos que ultrapassarem o limite da coluna.
# Se False, rejeita o registro e gera arquivo de erros.
TRUNCAR_TEXTOS_LONGOS = False

# Limites conforme DDL informado.
LIMITES_COLUNAS = {
    "ID_ORIGEM": 50,
    "EMPRESA": 200,
    "TIPO_OS": 250,
    "NUMERO_OS": 100,
    "TECNICO": 200,
    "MUNICIPIO": 200,
    #"BAIRRO": 200,
    "STATUS_APRESENTACAO": 100,
    "USUARIO_IMPORTACAO": 100,
    "HASH_NEGOCIO": 64,
    "CHAVE_NEGOCIO": 500,
}


# =====================================================
# FUNÇÕES DE LIMPEZA E CONVERSÃO
# =====================================================

def limpar_texto(valor):
    if pd.isna(valor):
        return None

    texto = str(valor).strip()

    if texto == "" or texto.lower() in {"nan", "none", "null"}:
        return None

    return texto


def limitar_texto(campo, valor):
    if valor is None:
        return None

    limite = LIMITES_COLUNAS.get(campo)

    if not limite:
        return valor

    texto = str(valor)

    if len(texto) <= limite:
        return texto

    if TRUNCAR_TEXTOS_LONGOS:
        return texto[:limite]

    raise ValueError(
        f"Valor muito grande para coluna {campo}. "
        f"Tamanho={len(texto)}, Limite={limite}, Valor='{texto[:300]}'"
    )


def converter_data(valor):
    if pd.isna(valor):
        return None

    if isinstance(valor, datetime):
        return valor.date()

    dt = pd.to_datetime(valor, errors="coerce")

    if pd.isna(dt):
        return None

    return dt.date()


def converter_int(valor):
    try:
        if pd.isna(valor):
            return 0

        texto = str(valor).strip()

        if texto == "":
            return 0

        # Evita remover ponto de OS; aqui campo é numérico de quantidade.
        texto = texto.replace(",", ".")
        return int(float(texto))

    except Exception:
        return 0


def gerar_hash(chave):
    if chave is None:
        return None

    return hashlib.sha256(chave.encode("utf-8")).hexdigest()


def normalizar_colunas(df):
    df = df.copy()
    df.columns = [
        str(col).strip().replace("\n", " ").replace("\r", " ")
        for col in df.columns
    ]
    return df


def obter_valor(row, *nomes):
    for nome in nomes:
        if nome in row.index:
            return row.get(nome)
    return None


def montar_chave(numero_os, data_execucao, tecnico):
    # Mantém exatamente o padrão usado no SAP HANA: NUMERO_OS + DATA_EXECUCAO + TECNICO
    return f"{numero_os}|{data_execucao}|{tecnico}"


def salvar_erros(erros, prefixo):
    if not erros:
        return None

    df_erros = pd.DataFrame(erros)
    nome_arquivo = f"{prefixo}_{datetime.now():%Y%m%d_%H%M%S}.xlsx"
    df_erros.to_excel(nome_arquivo, index=False)
    return nome_arquivo


# =====================================================
# LEITURA DO EXCEL
# =====================================================

def carregar_excel():
    caminho = Path(ARQUIVO)

    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {ARQUIVO}")

    xls = pd.ExcelFile(caminho)
    sheet = xls.sheet_names[0]
    df = xls.parse(sheet)
    df = normalizar_colunas(df)

    return df, sheet


# =====================================================
# PREPARAÇÃO DA BASE
# =====================================================

def preparar_base(df):
    registros = []
    rejeitados_validacao = []

    for idx, row in df.iterrows():
        linha_excel = idx + 2

        try:
            id_origem_raw = obter_valor(row, "ID", "Id", "id")
            id_origem = limpar_texto(id_origem_raw)

            empresa = limpar_texto(obter_valor(row, "Empresa", "EMPRESA"))
            tipo_os = limpar_texto(obter_valor(row, "Tipo de OS", "TIPO DE OS", "Tipo OS"))
            tecnico = limpar_texto(obter_valor(row, "Técnicos", "TECNICOS", "TECNICO DE EQUIPE", "Técnico", "TECNICO"))
            municipio = limpar_texto(obter_valor(row, "Cidade", "MUNICIPIO", "Município"))
            bairro = limpar_texto(obter_valor(row, "Bairro", "BAIRRO"))
            numero_os = limpar_texto(obter_valor(row, "OS de Execução", "OS DE EXECUCAO", "OS de Execucao", "NUMERO_OS"))
            data_execucao = converter_data(obter_valor(row, "Data da Execução", "DATA DE EXECUCAO", "Data da Execucao", "DATA_EXECUCAO"))
            postes_executados = converter_int(obter_valor(row, "Quantidade de Postes Executados", "QUANTIDADE DE POSTES EXECUTADOS", "POSTES_EXECUTADOS"))
            observacao = limpar_texto(obter_valor(row, "Observação", "OBSERVACOES", "OBSERVACAO"))
            apoio = limpar_texto(obter_valor(row, "Precisaremos de apoio para atuar no local?", "APOIO"))

            if not numero_os or not data_execucao or not tecnico:
                rejeitados_validacao.append({
                    "LINHA_EXCEL": linha_excel,
                    "MOTIVO": "Campos obrigatórios ausentes para chave de negócio",
                    "NUMERO_OS": numero_os,
                    "DATA_EXECUCAO": data_execucao,
                    "TECNICO": tecnico,
                    "EMPRESA": empresa,
                    "MUNICIPIO": municipio,
                    "BAIRRO": bairro,
                })
                continue

            chave_negocio = montar_chave(numero_os, data_execucao, tecnico)
            hash_negocio = gerar_hash(chave_negocio)

            registro = {
                "LINHA_EXCEL": linha_excel,
                "ID_ORIGEM": limitar_texto("ID_ORIGEM", id_origem),
                "DATA_EXECUCAO": data_execucao,
                "DATA_IMPORTACAO": datetime.now(),
                "DATA_ENVIO": datetime.now(),
                "EMPRESA": limitar_texto("EMPRESA", empresa),
                "TIPO_OS": limitar_texto("TIPO_OS", tipo_os),
                "NUMERO_OS": limitar_texto("NUMERO_OS", numero_os),
                "TECNICO": limitar_texto("TECNICO", tecnico),
                "MUNICIPIO": limitar_texto("MUNICIPIO", municipio),
                "BAIRRO": limitar_texto("BAIRRO", bairro),
                "POSTES_EXECUTADOS": postes_executados,
                "OBSERVACAO": observacao,
                "APOIO": apoio,
                "STATUS_APRESENTACAO": limitar_texto("STATUS_APRESENTACAO", "APRESENTADO"),
                "USUARIO_IMPORTACAO": limitar_texto("USUARIO_IMPORTACAO", USUARIO_IMPORTACAO),
                "HASH_NEGOCIO": limitar_texto("HASH_NEGOCIO", hash_negocio),
                "CHAVE_NEGOCIO": limitar_texto("CHAVE_NEGOCIO", chave_negocio),
            }

            registros.append(registro)

        except Exception as e:
            rejeitados_validacao.append({
                "LINHA_EXCEL": linha_excel,
                "MOTIVO": "Erro na preparação/validação do registro",
                "ERRO": str(e),
                "NUMERO_OS": limpar_texto(obter_valor(row, "OS de Execução", "NUMERO_OS")),
                "DATA_EXECUCAO": converter_data(obter_valor(row, "Data da Execução", "DATA_EXECUCAO")),
                "TECNICO": limpar_texto(obter_valor(row, "Técnicos", "TECNICO")),
                "EMPRESA": limpar_texto(obter_valor(row, "Empresa", "EMPRESA")),
                "MUNICIPIO": limpar_texto(obter_valor(row, "Cidade", "MUNICIPIO")),
                "BAIRRO": limpar_texto(obter_valor(row, "Bairro", "BAIRRO")),
            })

    base = pd.DataFrame(registros)

    if base.empty:
        return base, rejeitados_validacao, 0

    qtd_antes = len(base)
    base = base.drop_duplicates(subset=["CHAVE_NEGOCIO"], keep="last")
    qtd_duplicados = qtd_antes - len(base)

    return base, rejeitados_validacao, qtd_duplicados


# =====================================================
# CONEXÃO SAP HANA
# =====================================================

def conectar_hana():
    if not PASSWORD:
        raise ValueError(
            "Senha do HANA não informada. Configure a variável de ambiente HANA_PASSWORD "
            "ou preencha PASSWORD no script."
        )

    return dbapi.connect(
        address=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
    )


# =====================================================
# UPSERT SAP HANA
# =====================================================

def executar_upsert(base):
    conn = None
    cursor = None

    inseridos = 0
    atualizados = 0
    erros_banco = []

    try:
        conn = conectar_hana()
        cursor = conn.cursor()

        for _, row in base.iterrows():
            chave_negocio = row["CHAVE_NEGOCIO"]

            try:
                cursor.execute(
                    """
                    SELECT "ID"
                    FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TECNICO"
                    WHERE "CHAVE_NEGOCIO" = ?
                    """,
                    [chave_negocio],
                )

                existe = cursor.fetchone()

                parametros_comuns = [
                    row["ID_ORIGEM"],
                    row["DATA_EXECUCAO"],
                    row["DATA_IMPORTACAO"],
                    row["DATA_ENVIO"],
                    row["EMPRESA"],
                    row["TIPO_OS"],
                    row["NUMERO_OS"],
                    row["TECNICO"],
                    row["MUNICIPIO"],
                    row["BAIRRO"],
                    row["POSTES_EXECUTADOS"],
                    row["OBSERVACAO"],
                    row["APOIO"],
                    row["STATUS_APRESENTACAO"],
                    row["USUARIO_IMPORTACAO"],
                    row["HASH_NEGOCIO"],
                ]

                if existe:
                    cursor.execute(
                        """
                        UPDATE "CLB349328"."PORTAL_COMPARTILHAMENTO_TECNICO"
                           SET "ID_ORIGEM" = ?,
                               "DATA_EXECUCAO" = ?,
                               "DATA_IMPORTACAO" = ?,
                               "DATA_ENVIO" = ?,
                               "EMPRESA" = ?,
                               "TIPO_OS" = ?,
                               "NUMERO_OS" = ?,
                               "TECNICO" = ?,
                               "MUNICIPIO" = ?,
                               "BAIRRO" = ?,
                               "POSTES_EXECUTADOS" = ?,
                               "OBSERVACAO" = ?,
                               "APOIO" = ?,
                               "STATUS_APRESENTACAO" = ?,
                               "USUARIO_IMPORTACAO" = ?,
                               "HASH_NEGOCIO" = ?
                         WHERE "CHAVE_NEGOCIO" = ?
                        """,
                        parametros_comuns + [chave_negocio],
                    )
                    atualizados += 1

                else:
                    cursor.execute(
                        """
                        INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_TECNICO"
                        (
                            "ID_ORIGEM",
                            "DATA_EXECUCAO",
                            "DATA_IMPORTACAO",
                            "DATA_ENVIO",
                            "EMPRESA",
                            "TIPO_OS",
                            "NUMERO_OS",
                            "TECNICO",
                            "MUNICIPIO",
                            "BAIRRO",
                            "POSTES_EXECUTADOS",
                            "OBSERVACAO",
                            "APOIO",
                            "STATUS_APRESENTACAO",
                            "USUARIO_IMPORTACAO",
                            "HASH_NEGOCIO",
                            "CHAVE_NEGOCIO"
                        )
                        VALUES
                        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        parametros_comuns + [chave_negocio],
                    )
                    inseridos += 1

            except Exception as e:
                erros_banco.append({
                    "LINHA_EXCEL": row.get("LINHA_EXCEL"),
                    "NUMERO_OS": row.get("NUMERO_OS"),
                    "DATA_EXECUCAO": row.get("DATA_EXECUCAO"),
                    "TECNICO": row.get("TECNICO"),
                    "EMPRESA": row.get("EMPRESA"),
                    "MUNICIPIO": row.get("MUNICIPIO"),
                    "BAIRRO": row.get("BAIRRO"),
                    "POSTES_EXECUTADOS": row.get("POSTES_EXECUTADOS"),
                    "CHAVE_NEGOCIO": row.get("CHAVE_NEGOCIO"),
                    "ERRO": str(e),
                })
                continue

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return inseridos, atualizados, erros_banco


# =====================================================
# EXECUÇÃO PRINCIPAL
# =====================================================

def main():
    print("=" * 100)
    print("IMPORTADOR - PORTAL_COMPARTILHAMENTO_TECNICO")
    print("=" * 100)

    df, sheet = carregar_excel()

    print(f"Arquivo: {ARQUIVO}")
    print(f"Aba lida: {sheet}")
    print(f"Linhas lidas no Excel: {len(df)}")

    base, erros_validacao, qtd_duplicados = preparar_base(df)

    print(f"Registros válidos após preparação: {len(base)}")
    print(f"Duplicidades removidas por CHAVE_NEGOCIO: {qtd_duplicados}")
    print(f"Rejeitados na validação: {len(erros_validacao)}")

    if base.empty:
        arquivo_validacao = salvar_erros(erros_validacao, "ERROS_VALIDACAO_TECNICO")
        print("Nenhum registro válido para carga.")
        if arquivo_validacao:
            print(f"Arquivo de rejeitados gerado: {arquivo_validacao}")
        return

    inseridos, atualizados, erros_banco = executar_upsert(base)

    arquivo_validacao = salvar_erros(erros_validacao, "ERROS_VALIDACAO_TECNICO")
    arquivo_banco = salvar_erros(erros_banco, "ERROS_BANCO_TECNICO")

    print("=" * 100)
    print("RESUMO DA CARGA")
    print("=" * 100)
    print(f"Linhas lidas no Excel           : {len(df)}")
    print(f"Registros válidos processados   : {len(base)}")
    print(f"Duplicidades removidas          : {qtd_duplicados}")
    print(f"Inseridos no HANA               : {inseridos}")
    print(f"Atualizados no HANA             : {atualizados}")
    print(f"Rejeitados na validação         : {len(erros_validacao)}")
    print(f"Erros no banco                  : {len(erros_banco)}")


    if inseridos:
        print(f"Arquivo de dados inseridos   : {inseridos}")
        print(inseridos)
        print(type(inseridos))
        print(pd.DataFrame(inseridos).to_excel("inseridos.xlsx"))

    if arquivo_validacao:
        print(f"Arquivo de erros de validação   : {arquivo_validacao}")

    if arquivo_banco:
        print(f"Arquivo de erros do banco       : {arquivo_banco}")

    if erros_banco:
        print("\nPrimeiros erros de banco:")
        print(pd.DataFrame(erros_banco).head(10).to_string(index=False))

    if erros_validacao:
        print("\nPrimeiros rejeitados de validação:")
        print(pd.DataFrame(erros_validacao).head(10).to_string(index=False))

    print("=" * 100)
    print("Processo finalizado.")
    print("=" * 100)


if __name__ == "__main__":
    main()

