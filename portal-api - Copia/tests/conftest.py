# -*- coding: utf-8 -*-
"""
Infraestrutura de testes do backend.

O main.py chama database.get_connection() diretamente dentro de cada
endpoint (nao via Depends), entao o jeito de isolar o banco real e
substituir main.get_connection por uma conexao/cursor falsos que
gravam as chamadas e devolvem resultados pre-definidos, na ordem em
que os testes esperam que o endpoint os solicite.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import main  # noqa: E402


class FakeCursor:
    """Cursor falso: fetchone/fetchall consomem uma fila unica de
    resultados pre-carregada pelo teste, na ordem em que o endpoint
    de fato chama o banco (confirmada lendo o codigo do endpoint)."""

    def __init__(self, results=None):
        self._results = [(valor, None) for valor in (results or [])]
        self.executed = []
        self.description = []

    def queue(self, *valores):
        self._results.extend((valor, None) for valor in valores)
        return self

    def queue_described(self, colunas, valor):
        """Enfileira um resultado que, ao ser consumido por fetchone/fetchall,
        atualiza cursor.description para as colunas informadas (lista de nomes) -
        necessario para endpoints que fazem dict(zip(colunas, row))."""
        self._results.append((valor, colunas))
        return self

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        # Real drivers populam cursor.description logo apos o execute(), antes
        # do fetch (e' assim que o codigo de producao le, ex: campo.py). Por
        # isso so espiamos (sem consumir) o proximo resultado enfileirado -
        # quem de fato remove da fila e' o fetchone/fetchall, pra nao
        # desalinhar com execute()s que nunca sao seguidos de fetch (INSERT/UPDATE).
        if self._results:
            _valor, colunas = self._results[0]
            if colunas is not None:
                self.description = [(nome,) for nome in colunas]

    def _pop(self):
        if not self._results:
            return None
        valor, _colunas = self._results.pop(0)
        return valor

    def fetchone(self):
        return self._pop()

    def fetchall(self):
        resultado = self._pop()
        return resultado if resultado is not None else []

    def close(self):
        pass


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = 0
        self.rolled_back = 0

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed += 1

    def rollback(self):
        self.rolled_back += 1

    def close(self):
        pass


@pytest.fixture
def fake_db(monkeypatch):
    cursor = FakeCursor()
    conn = FakeConnection(cursor)
    monkeypatch.setattr(main, "get_connection", lambda: conn)
    return conn, cursor


@pytest.fixture
def client():
    return TestClient(main.app)
