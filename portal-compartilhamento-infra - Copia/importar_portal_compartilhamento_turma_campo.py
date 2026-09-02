# -*- coding: utf-8 -*-
"""
Importador SAP HANA - PORTAL_COMPARTILHAMENTO_TURMA_CAMPO

Processo:
- Lê o Excel 'Controle Diário de Campo(15001-18716).xlsx'
- Trata duplicidades pela chave de negócio composta:
    NUMERO_OS + '|' + DATA_EXECUCAO + '|' + EQUIPE
- Gera CHAVE_NEGOCIO e HASH_NEGOCIO (SHA256)
- Limpa e converte colunas relevantes
- Realiza UPSERT na tabela SAP HANA
"""
import hashlib
from datetime import datetime

import pandas as pd
from hdbcli import dbapi

# Parametros do arquivo e conexão
ARQUIVO = r"Controle Diário de Campo(15001-18716).xlsx"
USUARIO_IMPORTACAO = "CLB349328"

HOST = "BRNEO695"
PORT = 30015
USER = "CLB349328"
PASSWORD = "S@ndra1960#123"

# Funções auxiliares
def limpar_texto(valor):
    if pd.isna(valor):
        return None
    texto = str(valor).strip()
    return None if texto == "" else texto

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
        return int(float(str(valor).replace(",", ".")))
    except Exception:
        return 0

def converter_decimal(valor):
    try:
        if pd.isna(valor):
            return 0.0
        return float(str(valor).replace(",", "."))
    except Exception:
        return 0.0

def gerar_hash(chave):
    if chave is None:
        return None
    return hashlib.sha256(chave.encode("utf-8")).hexdigest()

# Leitura do Excel
xls = pd.ExcelFile(ARQUIVO)
sheet = xls.sheet_names[0]
df = xls.parse(sheet)

# Normalizar nomes de colunas
clean_cols = {col: col.strip() for col in df.columns}
df.rename(columns=clean_cols, inplace=True)

# Preparar registros limpos
registros = []
for _, row in df.iterrows():
    numero_os = limpar_texto(row.get("OS de Execução"))
    equipe = limpar_texto(row.get("Equipe"))
    data_execucao = converter_data(row.get("Data da Execução"))
    if not numero_os or not equipe or not data_execucao:
        continue
    id_origem_val = row.get("ID")
    id_origem = str(id_origem_val) if pd.notna(id_origem_val) else None
    responsavel = limpar_texto(row.get("Nome"))
    bairro = limpar_texto(row.get("Bairro Execução"))
    municipio = limpar_texto(row.get("Cidade Execução"))
    tipo_os = limpar_texto(row.get("Tipo de OS"))
    postes_exec = converter_int(row.get("Quantidade de Postes Executados"))
    cabos_removidos = converter_decimal(row.get("Cabos Removidos (m)"))
    caixas_removidas = converter_int(row.get("Quantidade de caixas removidas?"))
    poste_fora_os = converter_int(row.get("Poste(s) executado(s) fora da OS?"))
    observacao = limpar_texto(row.get("Observação"))

    chave = f"{numero_os}|{data_execucao}|{equipe.upper()}"
    registro = {
        'ID_ORIGEM': id_origem,
        'DATA_EXECUCAO': data_execucao,
        'DATA_ENVIO': datetime.now(),
        'EQUIPE': equipe,
        'RESPONSAVEL': responsavel,
        'EPS': None,
        'TIPO_OS': tipo_os,
        'NUMERO_OS': numero_os,
        'MUNICIPIO': municipio,
        'BAIRRO': bairro,
        'POSTES_EXECUTADOS': postes_exec,
        'CABOS_REMOVIDOS': cabos_removidos,
        'CAIXAS_REMOVIDAS': caixas_removidas,
        'POSTE_FORA_OS': poste_fora_os,
        'OBSERVACAO': observacao,
        'STATUS_APRESENTACAO': 'APRESENTADO',
        'DATA_IMPORTACAO': datetime.now(),
        'USUARIO_IMPORTACAO': USUARIO_IMPORTACAO,
        'CHAVE_NEGOCIO': chave,
        'HASH_NEGOCIO': gerar_hash(chave)
    }
    registros.append(registro)

# DataFrame de registros
base = pd.DataFrame(registros)
base.drop_duplicates(subset=['CHAVE_NEGOCIO'], keep='last', inplace=True)

# Conectar ao SAP HANA
conn = dbapi.connect(address=HOST, port=PORT, user=USER, password=PASSWORD)
cursor = conn.cursor()

# UPSERT por CHAVE_NEGOCIO
update_sql = """
UPDATE "CLB349328"."PORTAL_COMPARTILHAMENTO_TURMA_CAMPO"
SET "ID_ORIGEM" = ?, "DATA_EXECUCAO" = ?, "DATA_ENVIO" = ?, "EQUIPE" = ?, "RESPONSAVEL" = ?, "EPS" = ?, "TIPO_OS" = ?, "NUMERO_OS" = ?, "MUNICIPIO" = ?, "BAIRRO" = ?, "POSTES_EXECUTADOS" = ?, "CABOS_REMOVIDOS" = ?, "CAIXAS_REMOVIDAS" = ?, "POSTE_FORA_OS" = ?, "OBSERVACAO" = ?, "STATUS_APRESENTACAO" = ?, "DATA_IMPORTACAO" = ?, "USUARIO_IMPORTACAO" = ?, "HASH_NEGOCIO" = ?
WHERE "CHAVE_NEGOCIO" = ?"""
insert_sql = """
INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_TURMA_CAMPO"
("ID_ORIGEM", "DATA_EXECUCAO", "DATA_ENVIO", "EQUIPE", "RESPONSAVEL", "EPS", "TIPO_OS", "NUMERO_OS", "MUNICIPIO", "BAIRRO", "POSTES_EXECUTADOS", "CABOS_REMOVIDOS", "CAIXAS_REMOVIDAS", "POSTE_FORA_OS", "OBSERVACAO", "STATUS_APRESENTACAO", "DATA_IMPORTACAO", "USUARIO_IMPORTACAO", "HASH_NEGOCIO", "CHAVE_NEGOCIO")
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""

for _, row in base.iterrows():
    chave_neg = row['CHAVE_NEGOCIO']
    cursor.execute(
        'SELECT "ID" FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TURMA_CAMPO" WHERE "CHAVE_NEGOCIO" = ?',
        [chave_neg]
    )
    existe = cursor.fetchone()
    if existe:
        cursor.execute(update_sql, [
            row['ID_ORIGEM'], row['DATA_EXECUCAO'], row['DATA_ENVIO'],
            row['EQUIPE'], row['RESPONSAVEL'], row['EPS'],
            row['TIPO_OS'], row['NUMERO_OS'], row['MUNICIPIO'], row['BAIRRO'],
            row['POSTES_EXECUTADOS'], row['CABOS_REMOVIDOS'], row['CAIXAS_REMOVIDAS'],
            row['POSTE_FORA_OS'], row['OBSERVACAO'], row['STATUS_APRESENTACAO'],
            row['DATA_IMPORTACAO'], row['USUARIO_IMPORTACAO'], row['HASH_NEGOCIO'],
            chave_neg
        ])
    else:
        cursor.execute(insert_sql, [
            row['ID_ORIGEM'], row['DATA_EXECUCAO'], row['DATA_ENVIO'], row['EQUIPE'],
            row['RESPONSAVEL'], row['EPS'], row['TIPO_OS'], row['NUMERO_OS'],
            row['MUNICIPIO'], row['BAIRRO'], row['POSTES_EXECUTADOS'],
            row['CABOS_REMOVIDOS'], row['CAIXAS_REMOVIDAS'], row['POSTE_FORA_OS'],
            row['OBSERVACAO'], row['STATUS_APRESENTACAO'], row['DATA_IMPORTACAO'],
            row['USUARIO_IMPORTACAO'], row['HASH_NEGOCIO'], row['CHAVE_NEGOCIO']
        ])
conn.commit()
cursor.close()
conn.close()

print(f"Carga concluída. Registros processados: {len(base)}")
