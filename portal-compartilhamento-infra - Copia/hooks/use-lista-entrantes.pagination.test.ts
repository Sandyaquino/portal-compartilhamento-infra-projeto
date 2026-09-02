import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useListaEntrantes } from "./use-lista-entrantes"

function gerarEntrantes(quantidade: number) {
  return Array.from({ length: quantidade }, (_, index) => ({
    ID_ENTRADA: index + 1,
    RAZAO_SOCIAL: `Empresa ${index + 1}`,
    STATUS_ENTRADA: "NOVO",
    DATA_RECEBIMENTO: "2026-01-01",
  }))
}

function mockFetchComEntrantes(quantidade: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => gerarEntrantes(quantidade),
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useListaEntrantes - paginação", () => {
  it("pagina 60 registros em páginas de 25, com a última página parcial", async () => {
    mockFetchComEntrantes(60)

    const { result } = renderHook(() => useListaEntrantes())

    await waitFor(() => expect(result.current.entrantes).toHaveLength(60))

    expect(result.current.totalPaginas).toBe(3)
    expect(result.current.pagina).toBe(1)
    expect(result.current.paginatedEntrantes).toHaveLength(25)

    act(() => {
      result.current.setPagina(3)
    })

    await waitFor(() => expect(result.current.pagina).toBe(3))
    expect(result.current.paginatedEntrantes).toHaveLength(10)
  })

  it("volta para a página 1 quando um filtro muda", async () => {
    mockFetchComEntrantes(60)

    const { result } = renderHook(() => useListaEntrantes())

    await waitFor(() => expect(result.current.entrantes).toHaveLength(60))

    act(() => {
      result.current.setPagina(2)
    })
    await waitFor(() => expect(result.current.pagina).toBe(2))

    act(() => {
      result.current.setFiltroRazao("Empresa 1")
    })

    await waitFor(() => expect(result.current.pagina).toBe(1))
  })

  it("não quebra quando não há nenhum registro", async () => {
    mockFetchComEntrantes(0)

    const { result } = renderHook(() => useListaEntrantes())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.totalPaginas).toBe(1)
    expect(result.current.paginatedEntrantes).toHaveLength(0)
  })
})
