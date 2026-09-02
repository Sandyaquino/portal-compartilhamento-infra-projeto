# -*- coding: utf-8 -*-
"""
Administração do portal: usuários, perfis, funcionalidades e permissões.
Endpoints consumidos por app/(app)/administracao/**.

Regra de negócio explícita (não usa o catálogo de funcionalidades como as
demais telas): só usuários com o perfil ADMINISTRADOR acessam qualquer rota
deste router, mesmo que algum outro perfil tenha alguma funcionalidade
atribuída. Ver _exigir_perfil_administrador.
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import main
from routers.auth import (
    _auth_extrair_bearer_token,
    _auth_validar_token,
    _auth_buscar_usuario_por_email,
    _auth_status_ativo,
)

router = APIRouter()

ADMIN_SCHEMA = "CLB349328"
TB_USUARIO = f'"{ADMIN_SCHEMA}"."PORTAL_COMPARTILHAMENTO_USUARIO"'
TB_PERFIL = f'"{ADMIN_SCHEMA}"."PORTAL_COMPARTILHAMENTO_PERFIL"'
TB_MODULO = f'"{ADMIN_SCHEMA}"."PORTAL_COMPARTILHAMENTO_MODULO"'
TB_FUNCIONALIDADE = f'"{ADMIN_SCHEMA}"."PORTAL_COMPARTILHAMENTO_FUNCIONALIDADE"'
TB_PERFIL_FUNCIONALIDADE = f'"{ADMIN_SCHEMA}"."PORTAL_COMPARTILHAMENTO_PERFIL_FUNCIONALIDADE"'
TB_PERMISSAO = f'"{ADMIN_SCHEMA}"."PORTAL_COMPARTILHAMENTO_PERMISSAO"'

PERFIL_ADMINISTRADOR = "ADMINISTRADOR"


def _exigir_perfil_administrador(request: Request) -> str:
    """Bloqueia com 403 se o perfil do usuário do token não for ADMINISTRADOR.
    Acesso à Administração é restrito só a esse perfil por decisão de negócio
    explícita - independe de qualquer funcionalidade atribuída ao perfil."""
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

        perfil_nome = str(usuario.get("PERFIL") or "").strip().upper()
        if perfil_nome != PERFIL_ADMINISTRADOR:
            raise HTTPException(status_code=403, detail="Acesso restrito ao perfil Administrador")

        return usuario.get("LOGIN")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _linhas_para_dicts(cursor) -> List[dict]:
    colunas = [col[0] for col in cursor.description]
    return [dict(zip(colunas, row)) for row in cursor.fetchall()]


class UsuarioCreate(BaseModel):
    login: str
    nome: str
    email: str
    perfil_id: int
    empresa: Optional[str] = None
    telefone: Optional[str] = None


class UsuarioUpdate(BaseModel):
    nome: str
    email: str
    perfil_id: int
    status: str
    empresa: Optional[str] = None
    telefone: Optional[str] = None


class PerfilCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None


class PerfilUpdate(BaseModel):
    nome: str
    descricao: Optional[str] = None


class FuncionalidadesUpdate(BaseModel):
    funcionalidade_ids: List[int]


class PermissaoModulo(BaseModel):
    modulo_id: int
    visualizar: bool = False
    editar: bool = False
    excluir: bool = False
    exportar: bool = False


class PermissoesUpdate(BaseModel):
    permissoes: List[PermissaoModulo]


def _s(valor: bool) -> str:
    return "S" if valor else "N"


# =====================================================
# USUÁRIOS
# =====================================================
@router.get("/api/admin/usuarios")
def listar_usuarios(request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT
                U."LOGIN", U."NOME", U."EMAIL", U."PERFIL_ID", P."NOME" AS "PERFIL",
                U."STATUS", U."ULTIMO_LOGIN", U."EMPRESA", U."TELEFONE"
            FROM {TB_USUARIO} U
            LEFT JOIN {TB_PERFIL} P ON P."ID" = U."PERFIL_ID"
            ORDER BY U."NOME"
        """)
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/admin/usuarios")
def criar_usuario(dados: UsuarioCreate, request: Request):
    _exigir_perfil_administrador(request)

    login = (dados.login or "").strip()
    nome = (dados.nome or "").strip()
    email = (dados.email or "").strip()

    if not login or not nome or not email:
        raise HTTPException(status_code=400, detail="Login, nome e e-mail são obrigatórios")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "ID" FROM {TB_PERFIL} WHERE "ID" = ?', [dados.perfil_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="Perfil informado não existe")

        cursor.execute(f'SELECT "LOGIN" FROM {TB_USUARIO} WHERE "LOGIN" = ?', [login])
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Já existe um usuário com esse login")

        cursor.execute(
            f'SELECT "LOGIN" FROM {TB_USUARIO} WHERE UPPER(TRIM("EMAIL")) = UPPER(TRIM(?))',
            [email],
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Já existe um usuário com esse e-mail")

        cursor.execute(f"""
            INSERT INTO {TB_USUARIO}
                ("LOGIN", "NOME", "EMAIL", "PERFIL_ID", "STATUS", "EMPRESA", "TELEFONE")
            VALUES (?, ?, ?, ?, 'A', ?, ?)
        """, [login, nome, email, dados.perfil_id, dados.empresa, dados.telefone])
        conn.commit()

        return {
            "success": True,
            "usuario": {
                "LOGIN": login, "NOME": nome, "EMAIL": email, "PERFIL_ID": dados.perfil_id,
                "STATUS": "A", "EMPRESA": dados.empresa, "TELEFONE": dados.telefone,
            },
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao criar usuário: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/api/admin/usuarios/{login}")
def editar_usuario(login: str, dados: UsuarioUpdate, request: Request):
    _exigir_perfil_administrador(request)

    nome = (dados.nome or "").strip()
    email = (dados.email or "").strip()
    status = (dados.status or "").strip().upper()

    if not nome or not email:
        raise HTTPException(status_code=400, detail="Nome e e-mail são obrigatórios")
    if status not in ("A", "I"):
        raise HTTPException(status_code=400, detail="Status deve ser 'A' (ativo) ou 'I' (inativo)")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "LOGIN" FROM {TB_USUARIO} WHERE "LOGIN" = ?', [login])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        cursor.execute(f'SELECT "ID" FROM {TB_PERFIL} WHERE "ID" = ?', [dados.perfil_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="Perfil informado não existe")

        cursor.execute(
            f'SELECT "LOGIN" FROM {TB_USUARIO} WHERE UPPER(TRIM("EMAIL")) = UPPER(TRIM(?)) AND "LOGIN" <> ?',
            [email, login],
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Já existe outro usuário com esse e-mail")

        cursor.execute(f"""
            UPDATE {TB_USUARIO}
               SET "NOME" = ?, "EMAIL" = ?, "PERFIL_ID" = ?, "STATUS" = ?,
                   "EMPRESA" = ?, "TELEFONE" = ?
             WHERE "LOGIN" = ?
        """, [nome, email, dados.perfil_id, status, dados.empresa, dados.telefone, login])
        conn.commit()

        return {
            "success": True,
            "usuario": {
                "LOGIN": login, "NOME": nome, "EMAIL": email, "PERFIL_ID": dados.perfil_id,
                "STATUS": status, "EMPRESA": dados.empresa, "TELEFONE": dados.telefone,
            },
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao editar usuário: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# =====================================================
# PERFIS
# =====================================================
@router.get("/api/admin/perfis")
def listar_perfis(request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT
                P."ID", P."NOME", P."DESCRICAO",
                COUNT(U."LOGIN") AS "QTD_USUARIOS"
            FROM {TB_PERFIL} P
            LEFT JOIN {TB_USUARIO} U ON U."PERFIL_ID" = P."ID"
            GROUP BY P."ID", P."NOME", P."DESCRICAO"
            ORDER BY P."NOME"
        """)
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/admin/perfis")
def criar_perfil(dados: PerfilCreate, request: Request):
    _exigir_perfil_administrador(request)

    nome = (dados.nome or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome do perfil é obrigatório")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "ID" FROM {TB_PERFIL} WHERE UPPER(TRIM("NOME")) = UPPER(TRIM(?))', [nome])
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Já existe um perfil com esse nome")

        cursor.execute(f'SELECT COALESCE(MAX("ID"), 0) + 1 FROM {TB_PERFIL}')
        novo_id = cursor.fetchone()[0]

        cursor.execute(
            f'INSERT INTO {TB_PERFIL} ("ID", "NOME", "DESCRICAO") VALUES (?, ?, ?)',
            [novo_id, nome, dados.descricao],
        )
        conn.commit()

        return {"success": True, "perfil": {"ID": novo_id, "NOME": nome, "DESCRICAO": dados.descricao, "QTD_USUARIOS": 0}}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao criar perfil: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/api/admin/perfis/{perfil_id}")
def editar_perfil(perfil_id: int, dados: PerfilUpdate, request: Request):
    _exigir_perfil_administrador(request)

    nome = (dados.nome or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome do perfil é obrigatório")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "NOME" FROM {TB_PERFIL} WHERE "ID" = ?', [perfil_id])
        perfil_atual = cursor.fetchone()
        if not perfil_atual:
            raise HTTPException(status_code=404, detail="Perfil não encontrado")

        nome_atual = str(perfil_atual[0] or "").strip().upper()
        if nome_atual == PERFIL_ADMINISTRADOR and nome.strip().upper() != PERFIL_ADMINISTRADOR:
            raise HTTPException(
                status_code=400,
                detail="O perfil Administrador não pode ser renomeado: o acesso à Administração depende desse nome exato",
            )

        cursor.execute(
            f'SELECT "ID" FROM {TB_PERFIL} WHERE UPPER(TRIM("NOME")) = UPPER(TRIM(?)) AND "ID" <> ?',
            [nome, perfil_id],
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Já existe outro perfil com esse nome")

        cursor.execute(
            f'UPDATE {TB_PERFIL} SET "NOME" = ?, "DESCRICAO" = ? WHERE "ID" = ?',
            [nome, dados.descricao, perfil_id],
        )
        conn.commit()

        return {"success": True, "perfil": {"ID": perfil_id, "NOME": nome, "DESCRICAO": dados.descricao}}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao editar perfil: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/api/admin/perfis/{perfil_id}")
def excluir_perfil(perfil_id: int, request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "NOME" FROM {TB_PERFIL} WHERE "ID" = ?', [perfil_id])
        perfil_atual = cursor.fetchone()
        if not perfil_atual:
            raise HTTPException(status_code=404, detail="Perfil não encontrado")

        if str(perfil_atual[0] or "").strip().upper() == PERFIL_ADMINISTRADOR:
            raise HTTPException(status_code=400, detail="O perfil Administrador não pode ser excluído")

        cursor.execute(f'SELECT COUNT(*) FROM {TB_USUARIO} WHERE "PERFIL_ID" = ?', [perfil_id])
        qtd_usuarios = cursor.fetchone()[0] or 0
        if qtd_usuarios > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Não é possível excluir: {qtd_usuarios} usuário(s) vinculado(s) a este perfil",
            )

        cursor.execute(f'DELETE FROM {TB_PERFIL_FUNCIONALIDADE} WHERE "PERFIL_ID" = ?', [perfil_id])
        cursor.execute(f'DELETE FROM {TB_PERMISSAO} WHERE "PERFIL_ID" = ?', [perfil_id])
        cursor.execute(f'DELETE FROM {TB_PERFIL} WHERE "ID" = ?', [perfil_id])
        conn.commit()

        return {"success": True}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao excluir perfil: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# =====================================================
# MÓDULOS E FUNCIONALIDADES (catálogo somente leitura)
# =====================================================
@router.get("/api/admin/modulos")
def listar_modulos(request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f'SELECT "ID", "CODIGO", "NOME" FROM {TB_MODULO} ORDER BY "NOME"')
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/admin/funcionalidades")
def listar_funcionalidades(request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT
                F."ID", F."CODIGO", F."NOME", F."DESCRICAO",
                F."MODULO_ID", M."NOME" AS "MODULO_NOME"
            FROM {TB_FUNCIONALIDADE} F
            LEFT JOIN {TB_MODULO} M ON M."ID" = F."MODULO_ID"
            ORDER BY M."NOME", F."NOME"
        """)
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# =====================================================
# FUNCIONALIDADES / PERMISSÕES POR PERFIL
# =====================================================
@router.get("/api/admin/perfis/{perfil_id}/funcionalidades")
def listar_funcionalidades_do_perfil(perfil_id: int, request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f'SELECT "FUNCIONALIDADE_ID" FROM {TB_PERFIL_FUNCIONALIDADE} WHERE "PERFIL_ID" = ?',
            [perfil_id],
        )
        return {"funcionalidade_ids": [row[0] for row in cursor.fetchall()]}
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/api/admin/perfis/{perfil_id}/funcionalidades")
def substituir_funcionalidades_do_perfil(perfil_id: int, dados: FuncionalidadesUpdate, request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "ID" FROM {TB_PERFIL} WHERE "ID" = ?', [perfil_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Perfil não encontrado")

        cursor.execute(f'SELECT COALESCE(MAX("ID"), 0) FROM {TB_PERFIL_FUNCIONALIDADE}')
        proximo_id = cursor.fetchone()[0] or 0

        cursor.execute(f'DELETE FROM {TB_PERFIL_FUNCIONALIDADE} WHERE "PERFIL_ID" = ?', [perfil_id])

        for funcionalidade_id in dados.funcionalidade_ids:
            proximo_id += 1
            cursor.execute(
                f'INSERT INTO {TB_PERFIL_FUNCIONALIDADE} ("ID", "PERFIL_ID", "FUNCIONALIDADE_ID") VALUES (?, ?, ?)',
                [proximo_id, perfil_id, funcionalidade_id],
            )

        conn.commit()
        return {"success": True, "funcionalidade_ids": dados.funcionalidade_ids}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar funcionalidades do perfil: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/admin/perfis/{perfil_id}/permissoes")
def listar_permissoes_do_perfil(perfil_id: int, request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT "MODULO_ID", "VISUALIZAR", "EDITAR", "EXCLUIR", "EXPORTAR"
            FROM {TB_PERMISSAO}
            WHERE "PERFIL_ID" = ?
        """, [perfil_id])
        return _linhas_para_dicts(cursor)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.put("/api/admin/perfis/{perfil_id}/permissoes")
def salvar_permissoes_do_perfil(perfil_id: int, dados: PermissoesUpdate, request: Request):
    _exigir_perfil_administrador(request)

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()

        cursor.execute(f'SELECT "ID" FROM {TB_PERFIL} WHERE "ID" = ?', [perfil_id])
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Perfil não encontrado")

        cursor.execute(f'SELECT COALESCE(MAX("ID"), 0) FROM {TB_PERMISSAO}')
        proximo_id = cursor.fetchone()[0] or 0

        cursor.execute(f'DELETE FROM {TB_PERMISSAO} WHERE "PERFIL_ID" = ?', [perfil_id])

        for item in dados.permissoes:
            proximo_id += 1
            cursor.execute(f"""
                INSERT INTO {TB_PERMISSAO}
                    ("ID", "PERFIL_ID", "MODULO_ID", "VISUALIZAR", "EDITAR", "EXCLUIR", "EXPORTAR")
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                proximo_id, perfil_id, item.modulo_id,
                _s(item.visualizar), _s(item.editar), _s(item.excluir), _s(item.exportar),
            ])

        conn.commit()
        return {"success": True}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar permissões do perfil: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
