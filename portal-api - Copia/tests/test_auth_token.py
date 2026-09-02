# -*- coding: utf-8 -*-
"""
Testes das funções puras de auth (JWT caseiro, sem tocar banco):
_auth_criar_token / _auth_validar_token / _auth_hash_codigo / _auth_status_ativo.
"""
import time

import pytest
from fastapi import HTTPException

import main


class TestCriarEValidarToken:
    def test_token_valido_retorna_payload_original(self):
        token = main._auth_criar_token({"login": "CLB349328", "email": "a@b.com"})
        payload = main._auth_validar_token(token)

        assert payload["login"] == "CLB349328"
        assert payload["email"] == "a@b.com"
        assert "exp" in payload
        assert "iat" in payload

    def test_token_adulterado_e_rejeitado(self):
        token = main._auth_criar_token({"login": "CLB349328"})
        header_b64, payload_b64, assinatura_b64 = token.split(".")

        # Troca o payload sem re-assinar -> assinatura não bate mais
        payload_falso = main._auth_base64url_encode(b'{"login":"OUTRO"}')
        token_adulterado = f"{header_b64}.{payload_falso}.{assinatura_b64}"

        with pytest.raises(HTTPException) as exc:
            main._auth_validar_token(token_adulterado)

        assert exc.value.status_code == 401

    def test_token_expirado_e_rejeitado(self, monkeypatch):
        token = main._auth_criar_token({"login": "CLB349328"})

        # Fura a expiração fixando AUTH_TOKEN_MINUTOS ao criar, então testamos
        # via manipulação direta: gera um payload já expirado e assina manualmente.
        import json

        header = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "login": "CLB349328",
            "iat": int(time.time()) - 10000,
            "exp": int(time.time()) - 1,
        }
        header_b64 = main._auth_base64url_encode(json.dumps(header).encode("utf-8"))
        payload_b64 = main._auth_base64url_encode(json.dumps(payload).encode("utf-8"))

        import hmac
        import hashlib

        assinatura = hmac.new(
            main.AUTH_SECRET.encode("utf-8"),
            f"{header_b64}.{payload_b64}".encode("utf-8"),
            hashlib.sha256,
        ).digest()
        assinatura_b64 = main._auth_base64url_encode(assinatura)
        token_expirado = f"{header_b64}.{payload_b64}.{assinatura_b64}"

        with pytest.raises(HTTPException) as exc:
            main._auth_validar_token(token_expirado)

        assert exc.value.status_code == 401
        assert "expirado" in exc.value.detail.lower()

    def test_token_malformado_e_rejeitado(self):
        with pytest.raises(HTTPException) as exc:
            main._auth_validar_token("token-invalido-sem-pontos")

        assert exc.value.status_code == 401


class TestHashCodigo:
    def test_mesmo_email_e_codigo_geram_mesmo_hash(self):
        h1 = main._auth_hash_codigo("teste@empresa.com", "123456")
        h2 = main._auth_hash_codigo("teste@empresa.com", "123456")
        assert h1 == h2

    def test_codigo_diferente_gera_hash_diferente(self):
        h1 = main._auth_hash_codigo("teste@empresa.com", "123456")
        h2 = main._auth_hash_codigo("teste@empresa.com", "654321")
        assert h1 != h2


class TestStatusAtivo:
    @pytest.mark.parametrize("status", [None, "", "A", "S", "1", "ATIVO", "ativo"])
    def test_status_considerados_ativos(self, status):
        assert main._auth_status_ativo(status) is True

    @pytest.mark.parametrize("status", ["I", "N", "INATIVO", "0"])
    def test_status_considerados_inativos(self, status):
        assert main._auth_status_ativo(status) is False
