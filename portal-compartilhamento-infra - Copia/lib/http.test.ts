import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchJsonOrNull, fetchJsonOrThrow } from "./http"

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fullResponse = {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({}),
    ...response,
  } as Response

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fullResponse))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("fetchJsonOrNull", () => {
  it("retorna o JSON quando a resposta é ok", async () => {
    mockFetch({ ok: true, json: async () => ({ nome: "teste" }) })

    const resultado = await fetchJsonOrNull<{ nome: string }>("/api/qualquer")

    expect(resultado).toEqual({ nome: "teste" })
  })

  it("retorna null quando a resposta não é ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch({ ok: false, status: 500, text: async () => "erro interno" })

    const resultado = await fetchJsonOrNull("/api/qualquer")

    expect(resultado).toBeNull()
  })

  it("retorna null quando o fetch lança uma exceção", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    const resultado = await fetchJsonOrNull("/api/qualquer")

    expect(resultado).toBeNull()
  })
})

describe("fetchJsonOrThrow", () => {
  it("retorna o JSON quando a resposta é ok", async () => {
    mockFetch({ ok: true, json: async () => ({ id: 1 }) })

    const resultado = await fetchJsonOrThrow<{ id: number }>("/api/qualquer", "Erro ao buscar")

    expect(resultado).toEqual({ id: 1 })
  })

  it("lança um erro com a mensagem, status e corpo da resposta quando não é ok", async () => {
    mockFetch({ ok: false, status: 404, text: async () => "não encontrado" })

    await expect(fetchJsonOrThrow("/api/qualquer", "Erro ao buscar")).rejects.toThrow(
      "Erro ao buscar | Status 404 | não encontrado"
    )
  })
})
