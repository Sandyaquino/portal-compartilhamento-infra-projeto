import * as XLSX from "xlsx"

import {
  LABEL_INDICADOR_FIN,
  ORDEM_INDICADOR_FIN,
  type IndicadorFinanceiro,
  type IndicadorFinanceiroSerie,
  type LinhaImportFinanceiro,
} from "@/lib/types/resultado-financeiro"

const CABECALHO = ["Ano", "Mes", "Indicador", "Meta", "Realizado", "REV"] as const

// "R$ 1.234.567,89" | "1234567.89" | 1234567 -> number | null
function parseNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null
  let t = String(valor).trim().replace(/r\$/i, "").replace(/\s/g, "")
  if (!t) return null
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function normalizarIndicador(valor: unknown): IndicadorFinanceiro | null {
  const t = String(valor ?? "")
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
  if (t.startsWith("FATURAMENTO") || t.startsWith("RECEITABRUTA")) return "FATURAMENTO"
  if (t.startsWith("CUSTO") || t.startsWith("DESPESA")) return "CUSTOS"
  if (t.startsWith("RECEITALIQUIDA") || t === "RL") return "RECEITA_LIQUIDA"
  return null
}

// Baixa a planilha modelo já preenchida com os valores atuais do ano,
// pronta para o usuário atualizar e reimportar.
export function baixarModeloFinanceiro(ano: number, indicadores: IndicadorFinanceiroSerie[]) {
  const porIndicador = new Map(indicadores.map((i) => [i.indicador, i]))

  const linhas: (string | number)[][] = [CABECALHO as unknown as string[]]
  for (const cod of ORDEM_INDICADOR_FIN) {
    const serie = porIndicador.get(cod)
    for (let mes = 1; mes <= 12; mes++) {
      const m = serie?.meses.find((x) => x.mes === mes)
      linhas.push([
        ano,
        mes,
        LABEL_INDICADOR_FIN[cod],
        m?.meta ?? 0,
        m?.realizado ?? "",
        m?.rev ?? "",
      ])
    }
  }

  const wb = XLSX.utils.book_new()
  const wsDados = XLSX.utils.aoa_to_sheet(linhas)
  wsDados["!cols"] = [{ wch: 6 }, { wch: 5 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsDados, "Dados")

  const instr = XLSX.utils.aoa_to_sheet([
    ["Modelo de atualização — Resultado Financeiro"],
    [],
    ["1. Edite apenas as colunas Meta, Realizado e REV na aba \"Dados\"."],
    ["2. Não renomeie as colunas nem a aba \"Dados\"."],
    ["3. Mes = número de 1 a 12. Indicador = Faturamento, Custos ou Receita Líquida."],
    ["4. Deixe Realizado/REV em branco para meses ainda sem valor."],
    ["5. Valores em reais, sem símbolo (ex.: 2350000 ou 2.350.000,00)."],
    ["6. Salve e use \"Importar planilha\" na tela para carregar os dados."],
  ])
  instr["!cols"] = [{ wch: 90 }]
  XLSX.utils.book_append_sheet(wb, instr, "Instruções")

  XLSX.writeFile(wb, `modelo-resultado-financeiro-${ano}.xlsx`)
}

// Lê a planilha preenchida e devolve as linhas para POST /importar.
export async function lerPlanilhaFinanceiro(file: File): Promise<LinhaImportFinanceiro[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  const nomeAba = wb.SheetNames.find((n) => n.toLowerCase() === "dados") ?? wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws) throw new Error("Planilha sem aba de dados")

  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
  const chave = (row: Record<string, unknown>, ...nomes: string[]) => {
    for (const n of nomes) {
      const k = Object.keys(row).find((x) => x.trim().toLowerCase() === n.toLowerCase())
      if (k !== undefined) return row[k]
    }
    return undefined
  }

  const out: LinhaImportFinanceiro[] = []
  for (const row of linhas) {
    const indicador = normalizarIndicador(chave(row, "Indicador", "KPI"))
    const mes = parseNumero(chave(row, "Mes", "Mês"))
    if (!indicador || !mes || mes < 1 || mes > 12) continue
    const ano = parseNumero(chave(row, "Ano"))
    out.push({
      ano: ano ?? undefined,
      mes,
      indicador,
      meta: parseNumero(chave(row, "Meta", "Orçado", "Orcado")),
      realizado: parseNumero(chave(row, "Realizado")),
      rev: parseNumero(chave(row, "REV", "Rev", "Revisão", "Revisao", "Projeção", "Projecao")),
    })
  }
  if (!out.length) throw new Error("Nenhuma linha válida encontrada na planilha")
  return out
}
