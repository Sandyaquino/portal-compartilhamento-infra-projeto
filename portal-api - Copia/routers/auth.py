from fastapi import APIRouter, HTTPException, Path, Body, Query, File, UploadFile, Request
from typing import Any, Optional, List, Dict, Tuple
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta
import hashlib
import io
import re
import pandas as pd
from pydantic import BaseModel

import main

router = APIRouter()

# AUTENTICACAO OTP - PORTAL COMPARTILHAMENTO
# Endpoints consumidos por:
# - app/login/page.tsx
# - app/validar-codigo/page.tsx
# =====================================================
from fastapi import Request
import base64
import hmac
import json
import os
import secrets
import smtplib
import socket
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

AUTH_SCHEMA = "CLB349328"
AUTH_TABELA_USUARIO = f'"{AUTH_SCHEMA}"."PORTAL_COMPARTILHAMENTO_USUARIO"'
AUTH_TABELA_PERFIL = f'"{AUTH_SCHEMA}"."PORTAL_COMPARTILHAMENTO_PERFIL"'
AUTH_TABELA_OTP = f'"{AUTH_SCHEMA}"."PORTAL_COMPARTILHAMENTO_OTP"'
AUTH_TABELA_LOG = f'"{AUTH_SCHEMA}"."PORTAL_COMPARTILHAMENTO_LOG_ACESSO"'
AUTH_SECRET = os.getenv("PORTAL_AUTH_SECRET", "ALTERE_ESTA_CHAVE_EM_PRODUCAO")
AUTH_TOKEN_MINUTOS = int(os.getenv("PORTAL_AUTH_TOKEN_MINUTOS", "480"))
AUTH_OTP_MINUTOS = int(os.getenv("PORTAL_AUTH_OTP_MINUTOS", "10"))
AUTH_DEV_MODE = os.getenv("PORTAL_AUTH_DEV_MODE", "S").upper() == "S"

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.office365.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_TIMEOUT = int(os.getenv("SMTP_TIMEOUT", "1000"))
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "S").upper() == "S"

# Túnel via proxy corporativo (HTTP CONNECT) até o relay SMTP interno.
# Necessário quando a máquina não tem rota direta até SMTP_SERVER (ex: fora
# da VPN). Desativado por padrão para não alterar o comportamento de quem já
# tem acesso direto (ex: servidor de produção dentro da rede interna).
SMTP_USE_PROXY = os.getenv("SMTP_USE_PROXY", "N").upper() == "S"
PROXY_HOST = os.getenv("PROXY_HOST", "proxyzsneoclb.neoenergia.net")
PROXY_PORT = int(os.getenv("PROXY_PORT", "80"))
PROXY_USER = os.getenv("PROXY_USER", "")
PROXY_PASSWORD = os.getenv("PROXY_PASSWORD", "")


class AuthEnviarCodigoRequest(BaseModel):
    email: str


class AuthValidarCodigoRequest(BaseModel):
    email: str
    codigo: str


def _conectar_smtp_via_proxy(host: str, port: int, timeout: int) -> socket.socket:
    """Abre um túnel HTTP CONNECT através do proxy corporativo até o
    SMTP_SERVER. Necessário quando a máquina não tem rota direta até ele
    (ex: fora da VPN) - o proxy corporativo permite o túnel mesmo assim."""
    sock = socket.create_connection((PROXY_HOST, PROXY_PORT), timeout=timeout)

    linhas = [f"CONNECT {host}:{port} HTTP/1.1", f"Host: {host}:{port}"]
    if PROXY_USER and PROXY_PASSWORD:
        credenciais = base64.b64encode(f"{PROXY_USER}:{PROXY_PASSWORD}".encode()).decode()
        linhas.append(f"Proxy-Authorization: Basic {credenciais}")

    requisicao = "\r\n".join(linhas) + "\r\n\r\n"
    sock.sendall(requisicao.encode())

    # Lê só até o fim do cabeçalho HTTP (\r\n\r\n) - byte a byte, pra não
    # consumir bytes que já sejam do protocolo tunelado (o "220 ..." de
    # saudação do SMTP pode chegar colado no mesmo pacote TCP da resposta
    # do CONNECT, e um recv(4096) genérico acabaria descartando esse início).
    buffer = b""
    while b"\r\n\r\n" not in buffer:
        chunk = sock.recv(1)
        if not chunk:
            sock.close()
            raise Exception("Proxy fechou a conexão antes de responder ao CONNECT")
        buffer += chunk

    status_line = buffer.split(b"\r\n", 1)[0]
    if b" 200 " not in status_line and not status_line.endswith(b" 200"):
        sock.close()
        raise Exception(f"Túnel do proxy recusado: {status_line.decode(errors='replace')}")

    return sock


def _enviar_email_smtp(destinatario: str, assunto: str, texto: str, html: str) -> None:
    """Envia um e-mail via SMTP usando as credenciais do .env. Genérico -
    usado tanto pelo código de acesso (OTP) quanto por outros envios do portal."""
    if not SMTP_SERVER:
        raise HTTPException(status_code=500, detail="SMTP_SERVER não configurado")
    if not SMTP_FROM:
        raise HTTPException(status_code=500, detail="SMTP_FROM não configurado")
    # if not SMTP_USER or not SMTP_PASSWORD:
        # raise HTTPException(status_code=500, detail="Credenciais SMTP não configuradas")

    mensagem = MIMEMultipart("alternative")
    mensagem["From"] = SMTP_FROM
    mensagem["To"] = destinatario
    mensagem["Subject"] = assunto
    mensagem.attach(MIMEText(texto, "plain", "utf-8"))
    mensagem.attach(MIMEText(html, "html", "utf-8"))

    servidor = smtplib.SMTP(timeout=SMTP_TIMEOUT)

    try:
        if SMTP_USE_PROXY:
            # Conecta o socket manualmente via túnel do proxy e faz smtplib
            # assumir essa conexão já aberta, sem deixar o smtplib tentar
            # conectar direto (o que ignoraria o túnel e falharia igual
            # a uma conexão direta).
            sock = _conectar_smtp_via_proxy(SMTP_SERVER, SMTP_PORT, SMTP_TIMEOUT)
            servidor.sock = sock
            servidor.file = sock.makefile("rb")
            codigo, msg = servidor.getreply()
            if codigo != 220:
                raise Exception(f"SMTP não respondeu corretamente após o túnel: {codigo} {msg}")
        else:
            servidor.connect(SMTP_SERVER, SMTP_PORT)

        # TLS somente se configurado
        if SMTP_USE_TLS:
            servidor.starttls()

        # Faz login apenas se houver credenciais
        if SMTP_USER and SMTP_PASSWORD:
            servidor.login(
                SMTP_USER,
                SMTP_PASSWORD
            )

        servidor.send_message(mensagem)

    finally:
        # Só tenta encerrar a sessão SMTP se de fato chegou a conectar -
        # senão o proprio quit() falha com "please run connect() first" e
        # mascara o erro real que aconteceu antes (ex: falha no túnel do proxy).
        if servidor.sock is not None:
            try:
                servidor.quit()
            except Exception:
                pass


def enviar_email_otp(destinatario: str, codigo: str) -> None:
    assunto = "Portal Compartilhamento - Código de Acesso"

    texto = f"""
Olá,

Seu código de acesso ao Portal de Compartilhamento é: {codigo}

Validade: {AUTH_OTP_MINUTOS} minutos.

Se você não solicitou este código, ignore esta mensagem.

Neoenergia
""".strip()

    html = f"""
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937;">
    <div style="max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: #006B3F; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">Portal de Compartilhamento</h2>
        <p style="margin: 6px 0 0 0;">Código de acesso</p>
      </div>
      <div style="padding: 24px; background: #ffffff;">
        <p>Olá,</p>
        <p>Seu código de acesso ao Portal de Compartilhamento é:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #006B3F; padding: 16px; text-align: center; border: 1px dashed #7CC142; border-radius: 10px; background: #f7fff0;">
          {codigo}
        </div>
        <p style="margin-top: 20px;">Validade: <strong>{AUTH_OTP_MINUTOS} minutos</strong>.</p>
        <p style="font-size: 12px; color: #6b7280;">Se você não solicitou este código, ignore esta mensagem.</p>
      </div>
      <div style="background: #f3f4f6; padding: 12px; text-align: center; font-size: 12px; color: #6b7280;">
        Neoenergia
      </div>
    </div>
  </body>
</html>
""".strip()

    _enviar_email_smtp(destinatario, assunto, texto, html)


def _auth_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _auth_base64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")


def _auth_base64url_decode(payload: str) -> bytes:
    padding = "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode(payload + padding)


def _auth_criar_token(payload: dict) -> str:
    header = {
        "alg": "HS256",
        "typ": "JWT",
    }
    agora = datetime.utcnow()
    payload_final = {
        **payload,
        "iat": int(agora.timestamp()),
        "exp": int((agora + timedelta(minutes=AUTH_TOKEN_MINUTOS)).timestamp()),
    }
    header_b64 = _auth_base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _auth_base64url_encode(json.dumps(payload_final, separators=(",", ":"), default=str).encode("utf-8"))
    assinatura = hmac.new(
        AUTH_SECRET.encode("utf-8"),
        f"{header_b64}.{payload_b64}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    assinatura_b64 = _auth_base64url_encode(assinatura)
    return f"{header_b64}.{payload_b64}.{assinatura_b64}"


def _auth_validar_token(token: str) -> dict:
    try:
        header_b64, payload_b64, assinatura_b64 = token.split(".")
        assinatura_esperada = hmac.new(
            AUTH_SECRET.encode("utf-8"),
            f"{header_b64}.{payload_b64}".encode("utf-8"),
            hashlib.sha256,
        ).digest()
        assinatura_recebida = _auth_base64url_decode(assinatura_b64)
        if not hmac.compare_digest(assinatura_esperada, assinatura_recebida):
            raise HTTPException(status_code=401, detail="Token inválido")
        payload = json.loads(_auth_base64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(datetime.utcnow().timestamp()):
            raise HTTPException(status_code=401, detail="Token expirado")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")


def _auth_hash_codigo(email: str, codigo: str) -> str:
    base = f"{email.strip().lower()}|{codigo.strip()}|{AUTH_SECRET}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _auth_status_ativo(status: Any) -> bool:
    if status is None:
        return True
    status_texto = str(status).strip().upper()
    return status_texto in ("", "A", "S", "1", "ATIVO")


def _auth_garantir_tabela_otp(cursor) -> None:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {AUTH_TABELA_OTP}")
        cursor.fetchone()
        return
    except Exception:
        pass

    cursor.execute(f"""
        CREATE COLUMN TABLE {AUTH_TABELA_OTP}
        (
            "ID" INTEGER CS_INT GENERATED BY DEFAULT AS IDENTITY,
            "EMAIL" NVARCHAR(200) NOT NULL,
            "CODIGO_HASH" NVARCHAR(128) NOT NULL,
            "EXPIRA_EM" LONGDATE CS_LONGDATE,
            "UTILIZADO" NVARCHAR(1) DEFAULT 'N',
            "DATA_GERACAO" LONGDATE CS_LONGDATE,
            "DATA_UTILIZACAO" LONGDATE CS_LONGDATE,
            PRIMARY KEY ("ID")
        )
        UNLOAD PRIORITY 5 AUTO MERGE
    """)


def _auth_buscar_usuario_por_email(cursor, email: str) -> Optional[dict]:
    cursor.execute(f"""
        SELECT
            U."LOGIN",
            U."NOME",
            U."EMAIL",
            U."PERFIL_ID",
            U."STATUS",
            P."NOME" AS "PERFIL"
        FROM {AUTH_TABELA_USUARIO} U
        LEFT JOIN {AUTH_TABELA_PERFIL} P
            ON P."ID" = U."PERFIL_ID"
        WHERE UPPER(TRIM(U."EMAIL")) = UPPER(TRIM(?))
        LIMIT 1
    """, [email])
    row = cursor.fetchone()
    if not row:
        return None
    columns = [col[0] for col in cursor.description]
    return {
        columns[index]: _auth_json_value(value)
        for index, value in enumerate(row)
    }


def _auth_log_acesso(cursor, login: Optional[str], pagina: str) -> None:
    try:
        cursor.execute(f"""
            INSERT INTO {AUTH_TABELA_LOG}
            (
                "LOGIN",
                "DATA_ACESSO",
                "PAGINA"
            )
            VALUES
            (
                ?,
                CURRENT_TIMESTAMP,
                ?
            )
        """, [login, pagina])
    except Exception:
        pass


def _auth_extrair_bearer_token(request: Request) -> str:
    authorization = request.headers.get("authorization") or ""
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    token_cookie = request.cookies.get("token")
    if token_cookie:
        return token_cookie
    raise HTTPException(status_code=401, detail="Token não informado")


@router.post("/api/auth/enviar-codigo")
@router.post("/auth/enviar-codigo")
def auth_enviar_codigo(payload: AuthEnviarCodigoRequest, request: Request):
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _auth_garantir_tabela_otp(cursor)

        usuario = _auth_buscar_usuario_por_email(cursor, email)
        if not usuario:
            _auth_log_acesso(cursor, None, "/auth/enviar-codigo:FALHA_USUARIO_NAO_CADASTRADO")
            conn.commit()
            raise HTTPException(status_code=404, detail="E-mail não cadastrado para acesso ao portal")

        if not _auth_status_ativo(usuario.get("STATUS")):
            _auth_log_acesso(cursor, usuario.get("LOGIN"), "/auth/enviar-codigo:FALHA_USUARIO_INATIVO")
            conn.commit()
            raise HTTPException(status_code=403, detail="Usuário inativo para acesso ao portal")

        codigo = str(secrets.randbelow(900000) + 100000)
        codigo_hash = _auth_hash_codigo(email, codigo)
        expira_em = datetime.now() + timedelta(minutes=AUTH_OTP_MINUTOS)

        print(codigo_hash)

        cursor.execute(f"""
            UPDATE {AUTH_TABELA_OTP}
               SET "UTILIZADO" = 'S',
                   "DATA_UTILIZACAO" = CURRENT_TIMESTAMP
             WHERE UPPER(TRIM("EMAIL")) = UPPER(TRIM(?))
               AND COALESCE("UTILIZADO", 'N') = 'N'
        """, [email])

        cursor.execute(f"""
            INSERT INTO {AUTH_TABELA_OTP}
            (
                "EMAIL",
                "CODIGO_HASH",
                "EXPIRA_EM",
                "UTILIZADO",
                "DATA_GERACAO"
            )
            VALUES
            (
                ?,
                ?,
                ?,
                'N',
                CURRENT_TIMESTAMP
            )
        """, [email, codigo_hash, expira_em])

        if not AUTH_DEV_MODE:
            enviar_email_otp(email, codigo)

        _auth_log_acesso(cursor, usuario.get("LOGIN"), "/auth/enviar-codigo:SUCESSO")
        conn.commit()

        resposta = {
            "success": True,
            "mensagem": "Código enviado para o e-mail informado.",
            "email": email,
            "expira_em": expira_em.isoformat(),
        }

        # Modo desenvolvimento: retorna o código para teste local sem serviço de e-mail.
        # Para envio real, configure PORTAL_AUTH_DEV_MODE=N e as variáveis SMTP_*.
        if AUTH_DEV_MODE:
            resposta["codigo_teste"] = codigo
            resposta["mensagem"] = "Código de acesso gerado com sucesso em modo desenvolvimento."

        return resposta

    except HTTPException:
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao gerar código de acesso: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.post("/api/auth/validar-codigo")
@router.post("/auth/validar-codigo")
def auth_validar_codigo(payload: AuthValidarCodigoRequest, request: Request):
    email = (payload.email or "").strip().lower()
    codigo = (payload.codigo or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido")
    if not codigo or len(codigo) != 6 or not codigo.isdigit():
        raise HTTPException(status_code=400, detail="Informe o código de 6 dígitos")

    conn = None
    cursor = None
    try:
        conn = main.get_connection()
        cursor = conn.cursor()
        _auth_garantir_tabela_otp(cursor)

        usuario = _auth_buscar_usuario_por_email(cursor, email)
        if not usuario:
            _auth_log_acesso(cursor, None, "/auth/validar-codigo:FALHA_USUARIO_NAO_CADASTRADO")
            conn.commit()
            raise HTTPException(status_code=404, detail="E-mail não cadastrado para acesso ao portal")

        if not _auth_status_ativo(usuario.get("STATUS")):
            _auth_log_acesso(cursor, usuario.get("LOGIN"), "/auth/validar-codigo:FALHA_USUARIO_INATIVO")
            conn.commit()
            raise HTTPException(status_code=403, detail="Usuário inativo para acesso ao portal")

        codigo_hash = _auth_hash_codigo(email, codigo)

        print(codigo_hash)


        cursor.execute(f"""
            SELECT
                "ID"
            FROM {AUTH_TABELA_OTP}
            WHERE UPPER(TRIM("EMAIL")) = UPPER(TRIM(?))
              AND "CODIGO_HASH" = ?
              AND COALESCE("UTILIZADO", 'N') = 'N'
              AND "EXPIRA_EM" >= CURRENT_TIMESTAMP
            ORDER BY "DATA_GERACAO" DESC
            LIMIT 1
        """, [email, codigo_hash])
        otp = cursor.fetchone()

        if not otp:
            _auth_log_acesso(cursor, usuario.get("LOGIN"), "/auth/validar-codigo:FALHA_CODIGO_INVALIDO")
            conn.commit()
            raise HTTPException(status_code=401, detail="Código inválido ou expirado")

        otp_id = otp[0]
        cursor.execute(f"""
            UPDATE {AUTH_TABELA_OTP}
               SET "UTILIZADO" = 'S',
                   "DATA_UTILIZACAO" = CURRENT_TIMESTAMP
             WHERE "ID" = ?
        """, [otp_id])

        token_payload = {
            "login": usuario.get("LOGIN"),
            "nome": usuario.get("NOME"),
            "email": usuario.get("EMAIL"),
            "perfil_id": usuario.get("PERFIL_ID"),
            "perfil": usuario.get("PERFIL"),
        }
        token = _auth_criar_token(token_payload)

        _auth_log_acesso(cursor, usuario.get("LOGIN"), "/auth/validar-codigo:SUCESSO")
        conn.commit()

        return {
            "success": True,
            "token": token,
            "usuario": token_payload,
        }

    except HTTPException:
        raise
    except Exception as error:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao validar código de acesso: {str(error)}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.get("/api/auth/me")
@router.get("/auth/me")
def auth_me_token(request: Request):
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

        permissoes = []
        try:
            cursor.execute("""
                SELECT
                    "PERFIL_ID",
                    "MODULO_ID",
                    "VISUALIZAR",
                    "EDITAR",
                    "EXCLUIR",
                    "EXPORTAR"
                FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_PERMISSAO"
                WHERE "PERFIL_ID" = ?
            """, [usuario.get("PERFIL_ID")])
            columns = [col[0] for col in cursor.description]
            permissoes = [
                {columns[index]: _auth_json_value(value) for index, value in enumerate(row)}
                for row in cursor.fetchall()
            ]
        except Exception:
            permissoes = []

        funcionalidades = []
        try:
            cursor.execute("""
                SELECT F."CODIGO"
                FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_PERFIL_FUNCIONALIDADE" PF
                JOIN "CLB349328"."PORTAL_COMPARTILHAMENTO_FUNCIONALIDADE" F
                    ON F."ID" = PF."FUNCIONALIDADE_ID"
                WHERE PF."PERFIL_ID" = ?
            """, [usuario.get("PERFIL_ID")])
            funcionalidades = [row[0] for row in cursor.fetchall()]
        except Exception:
            funcionalidades = []

        return {
            "success": True,
            "usuario": usuario,
            "permissoes": permissoes,
            "funcionalidades": funcionalidades,
        }
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
