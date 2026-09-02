import { describe, expect, it } from "vitest"

import {
  formatarData,
  formatarNumero,
  getEntranteId,
  getErrorMessage,
  normalizar,
  normalizarStatus,
  statusClass,
  statusLabel,
} from "./use-lista-entrantes"

describe("getEntranteId", () => {
  it("prefere ID_ENTRADA quando presente", () => {
    expect(getEntranteId({ ID_ENTRADA: 10, ID: 20 })).toBe(10)
  })

  it("cai para ID quando ID_ENTRADA está ausente", () => {
    expect(getEntranteId({ ID: 20 })).toBe(20)
  })

  it("retorna null quando nenhum dos dois existe", () => {
    expect(getEntranteId({})).toBeNull()
  })
})

describe("normalizar", () => {
  it("converte null/undefined em string vazia", () => {
    expect(normalizar(null)).toBe("")
    expect(normalizar(undefined)).toBe("")
  })

  it("converte valores não-string em string", () => {
    expect(normalizar(42)).toBe("42")
  })
})

describe("normalizarStatus", () => {
  it("normaliza para maiúsculas e remove espaços", () => {
    expect(normalizarStatus("  analisado  ")).toBe("ANALISADO")
  })

  it("usa NOVO como padrão quando vazio ou nulo", () => {
    expect(normalizarStatus(null)).toBe("NOVO")
    expect(normalizarStatus("")).toBe("NOVO")
    expect(normalizarStatus(undefined)).toBe("NOVO")
  })
})

describe("formatarData", () => {
  it("retorna '-' quando o valor é vazio", () => {
    expect(formatarData(null)).toBe("-")
    expect(formatarData(undefined)).toBe("-")
    expect(formatarData("")).toBe("-")
  })

  it("retorna o valor original quando não é uma data válida", () => {
    expect(formatarData("não-é-data")).toBe("não-é-data")
  })

  it("formata uma data válida em pt-BR", () => {
    const resultado = formatarData("2026-01-15T10:00:00Z")
    expect(resultado).not.toBe("-")
    expect(resultado).toContain("2026")
  })
})

describe("formatarNumero", () => {
  it("trata null/undefined como zero", () => {
    expect(formatarNumero(null)).toBe("0")
    expect(formatarNumero(undefined)).toBe("0")
  })

  it("formata número com separador de milhar em pt-BR", () => {
    expect(formatarNumero(1000)).toBe("1.000")
  })

  it("aceita valores em string", () => {
    expect(formatarNumero("2500")).toBe("2.500")
  })

  it("retorna '0' para valores não numéricos", () => {
    expect(formatarNumero("abc")).toBe("0")
  })
})

describe("statusClass / statusLabel", () => {
  it("NOVO usa o estilo padrão (slate) e mantém o rótulo NOVO", () => {
    expect(statusClass("NOVO")).toContain("slate")
    expect(statusLabel("NOVO")).toBe("NOVO")
  })

  it("PROVEDOR_CRIADO vira rótulo com espaço e cor verde", () => {
    expect(statusLabel("PROVEDOR_CRIADO")).toBe("PROVEDOR CRIADO")
    expect(statusClass("PROVEDOR_CRIADO")).toContain("green")
  })

  it("PROCESSO_CRIADO vira rótulo com espaço e cor azul", () => {
    expect(statusLabel("PROCESSO_CRIADO")).toBe("PROCESSO CRIADO")
    expect(statusClass("PROCESSO_CRIADO")).toContain("blue")
  })

  it("DESCARTADO usa cor vermelha", () => {
    expect(statusClass("DESCARTADO")).toContain("red")
  })

  it("ANALISADO usa cor âmbar", () => {
    expect(statusClass("ANALISADO")).toContain("amber")
  })
})

describe("getErrorMessage", () => {
  it("usa o campo detail quando presente", () => {
    expect(getErrorMessage({ detail: "Erro específico" }, "fallback")).toBe("Erro específico")
  })

  it("usa message como segunda opção", () => {
    expect(getErrorMessage({ message: "Outro erro" }, "fallback")).toBe("Outro erro")
  })

  it("usa mensagem como terceira opção", () => {
    expect(getErrorMessage({ mensagem: "Erro em português" }, "fallback")).toBe("Erro em português")
  })

  it("usa o fallback quando não há objeto ou campos reconhecidos", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback")
    expect(getErrorMessage("string qualquer", "fallback")).toBe("fallback")
    expect(getErrorMessage({}, "fallback")).toBe("fallback")
  })
})
