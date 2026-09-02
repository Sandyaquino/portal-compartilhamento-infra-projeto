import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { JornadaStepper } from "./jornada-stepper"

describe("JornadaStepper", () => {
  it("mostra o banner de descarte com o motivo quando o status é DESCARTADO", () => {
    render(<JornadaStepper status="DESCARTADO" motivoDescarte="CNPJ inválido" />)

    expect(screen.getByText("Entrante descartado")).toBeInTheDocument()
    expect(screen.getByText("Motivo: CNPJ inválido")).toBeInTheDocument()
  })

  it("mostra mensagem padrão de descarte quando não há motivo registrado", () => {
    render(<JornadaStepper status="DESCARTADO" />)

    expect(
      screen.getByText("Este registro saiu da jornada e não pode avançar.")
    ).toBeInTheDocument()
  })

  it("renderiza as 4 etapas da jornada para status ativos", () => {
    render(<JornadaStepper status="ANALISADO" />)

    expect(screen.getByText("Novo")).toBeInTheDocument()
    expect(screen.getByText("Analisado")).toBeInTheDocument()
    expect(screen.getByText("Provedor Criado")).toBeInTheDocument()
    expect(screen.getByText("Processo Criado")).toBeInTheDocument()
  })

  it("trata status nulo/vazio como NOVO (primeira etapa)", () => {
    const { container } = render(<JornadaStepper status={null} />)

    // Sem status DESCARTADO, deve renderizar o stepper normal, não o banner de erro.
    expect(container.querySelector(".border-red-200")).not.toBeInTheDocument()
    expect(screen.getByText("Novo")).toBeInTheDocument()
  })
})
