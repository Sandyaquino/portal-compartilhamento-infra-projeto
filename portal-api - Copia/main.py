from fastapi import HTTPException, Path
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Body
from database import get_connection
from fastapi import Query
from typing import Optional
import hashlib
import os
import pandas as pd
import io
from datetime import datetime, date, timedelta

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, List, Dict, Tuple
import re
from decimal import (
    Decimal,
    InvalidOperation
)
from pydantic import BaseModel
from typing import Optional




# =====================================================
# Sentry (error tracking) — fica inativo até SENTRY_DSN
# ser definido no .env. Ver README/instrução de ativação.
# =====================================================
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
    )


app = FastAPI(
    title="Portal Compartilhamento API"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:1240",
        "http://127.0.0.1:1240",
        "http://localhost:1270",
        "http://10.208.195.204:3000",
        "http://HORC3YLBZ3:3000",
        "http://horc3ylbz3:3000",
        "http://10.208.195.204:1270",
        "http://HORC3YLBZ3:1270",
        "http://horc3ylbz3:1270",
        "http://HORC3YLBZ3.amer.iberdrola.local:1270",
        "http://horc3ylbz3.amer.iberdrola.local:1270",
        "http://10.208.195.204:1240",
        "http://HORC3YLBZ3:1240",
        "http://horc3ylbz3:1240",
        "http://HORC3YLBZ3.amer.iberdrola.local:1240",
        "http://horc3ylbz3.amer.iberdrola.local:1240",
        # Navegadores sempre mandam o header Origin em minusculo, mesmo se a
        # URL foi digitada com maiusculas - o CORSMiddleware compara string
        # exata, entao as variantes MAIUSCULA acima nunca batem de verdade
        # com requisicao real de navegador. Mantidas por retrocompatibilidade
        # com o que ja existia; as minusculas sao as que realmente importam.
        # Wi-Fi de casa via VPN - so pra validar o fluxo de login agora;
        # nao vale para a rede do escritorio (endereco muda por DHCP).
        "http://192.168.0.138:1270",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def limpar_texto(valor):
    if pd.isna(valor):
        return None

    valor = str(valor).strip()

    if valor == "" or valor.lower() in ["nan", "none"]:
        return None

    return valor


def limpar_decimal(valor):
    if pd.isna(valor):
        return 0

    valor = str(valor).strip()

    if valor == "" or valor.lower() in ["nan", "none"]:
        return 0

    valor = valor.replace(",", ".")

    try:
        return float(valor)
    except Exception:
        return 0


def limpar_inteiro(valor):
    if pd.isna(valor):
        return 0

    try:
        return int(float(str(valor).replace(",", ".")))
    except Exception:
        return 0




def converter_data(valor):

    if pd.isna(valor):
        return None

    try:
        texto = str(valor).strip()

        # Formato exportado pelo Forms:
        # 7/9/2026 2:00 AM
        # 7/10/2026 12:00 AM
        data = pd.to_datetime(
            texto,
            format="%m/%d/%Y %I:%M %p",
            errors="coerce"
        )

        if pd.isna(data):

            data = pd.to_datetime(
                texto,
                errors="coerce"
            )

        if pd.isna(data):
            return None
        return data.date()
    except Exception:
        return None



def converter_timestamp(valor):

    if pd.isna(valor):
        return None
    try:

        texto = str(valor).strip()
        # Formato exportado pelo Forms:
        # 7/9/2026 2:00 AM
        # 7/10/2026 12:00 AM
        data = pd.to_datetime(
            texto,
            format="%m/%d/%Y %I:%M %p",
            errors="coerce"
        )
        if pd.isna(data):
            data = pd.to_datetime(
                texto,
                errors="coerce"
            )
        if pd.isna(data):
            return None
        return data.to_pydatetime()

    except Exception:
        return None
    


@app.get("/")
def home():
    return {
        "status": "online"
    }




# =====================================================
# Routers por domínio (Fase 5 do plano de refatoração)
# =====================================================
from routers.campo import router as campo_router
from routers.dashboards import router as dashboards_router
from routers.entrantes import router as entrantes_router
from routers.processos import router as processos_router
from routers.auth import router as auth_router
from routers.provedores import router as provedores_router
from routers.admin import router as admin_router
from routers.plano_medidas import router as plano_medidas_router
from routers.kpis_mensal import router as kpis_mensal_router
from routers.postes import router as postes_router
from routers.projetos import router as projetos_router
from routers.tarefas import router as tarefas_router
from routers.base_postes import router as base_postes_router

app.include_router(campo_router)
app.include_router(dashboards_router)
app.include_router(entrantes_router)
app.include_router(processos_router)
app.include_router(auth_router)
app.include_router(provedores_router)
app.include_router(admin_router)
app.include_router(plano_medidas_router)
app.include_router(kpis_mensal_router)
app.include_router(postes_router)
app.include_router(projetos_router)
app.include_router(tarefas_router)
app.include_router(base_postes_router)

# Reexportados para compatibilidade com quem importa direto de main
# (inclui os testes automatizados de tests/test_auth_token.py).
from routers.auth import (  # noqa: E402,F401
    AUTH_SECRET,
    _auth_base64url_decode,
    _auth_base64url_encode,
    _auth_criar_token,
    _auth_hash_codigo,
    _auth_status_ativo,
    _auth_validar_token,
)
