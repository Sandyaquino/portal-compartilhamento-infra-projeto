// Resultado Financeiro mensal (Faturamento, Custos, Receita Líquida).
// Espelha sql/PORTAL_COMPARTILHAMENTO_RESULTADO_FINANCEIRO.sql e
// mock-api-dev/routes-resultado-financeiro.js.
// YTD e desvio nunca são digitados — sempre recalculados no backend.

export type IndicadorFinanceiro = "FATURAMENTO" | "CUSTOS" | "RECEITA_LIQUIDA"

export const ORDEM_INDICADOR_FIN: IndicadorFinanceiro[] = [
  "FATURAMENTO",
  "CUSTOS",
  "RECEITA_LIQUIDA",
]

export const LABEL_INDICADOR_FIN: Record<IndicadorFinanceiro, string> = {
  FATURAMENTO: "Faturamento",
  CUSTOS: "Custos",
  RECEITA_LIQUIDA: "Receita Líquida",
}

// Custos: quanto menor o realizado frente à meta, melhor.
export const MENOR_MELHOR_FIN: Record<IndicadorFinanceiro, boolean> = {
  FATURAMENTO: false,
  CUSTOS: true,
  RECEITA_LIQUIDA: false,
}

export const MESES_FIN = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export type MesFinanceiro = {
  mes: number
  meta: number
  realizado: number | null
  rev: number | null
  meta_ytd: number
  realizado_ytd: number | null
  rev_ytd: number
  desvio: number | null
  desvio_pct: number | null
  desvio_ytd: number | null
  desvio_ytd_pct: number | null
}

export type ResumoFinanceiro = {
  meta: number
  realizado: number | null
  rev: number | null
  desvio: number | null
  desvio_pct: number | null
}

export type IndicadorFinanceiroSerie = {
  indicador: IndicadorFinanceiro
  label: string
  meses: MesFinanceiro[]
  mensal: ResumoFinanceiro
  ytd: ResumoFinanceiro
  ano_total: { meta: number; realizado: number | null; rev: number | null }
}

export type ResultadoFinanceiroResposta = {
  ano: number
  mes_ref: number
  meses_fechados: number
  indicadores: IndicadorFinanceiroSerie[]
}

// Linha da planilha modelo (export) e do import.
export type LinhaImportFinanceiro = {
  ano?: number
  mes: number
  indicador: IndicadorFinanceiro
  meta?: number | null
  realizado?: number | null
  rev?: number | null
}

export type ImportResultadoFinanceiro = {
  success: boolean
  criados: number
  atualizados: number
  ignorados: { linha: number; motivo: string }[]
  total: number
  dados: ResultadoFinanceiroResposta
}

export function fmtMoedaFin(valor?: number | null, compacto = false) {
  if (valor === null || valor === undefined) return "—"
  if (compacto) {
    const abs = Math.abs(valor)
    if (abs >= 1_000_000)
      return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`
    if (abs >= 1_000)
      return `R$ ${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
  }
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

export function fmtPctFin(valor?: number | null) {
  if (valor === null || valor === undefined) return "—"
  const s = (valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${valor > 0 ? "+" : ""}${s}%`
}
