export type KpiCadastro = {
  ID: number
  BLOCO: string
  KPI: string
  UNIDADE: string
  TIPO: string
  CREATED_AT?: string | null
  CREATED_BY?: string | null
  UPDATED_AT?: string | null
  UPDATED_BY?: string | null
}

export type KpiStatus = "verde" | "amarelo" | "vermelho"

export type KpiLancamento = {
  ID: number
  KPI_ID: number
  MES: string
  META: number
  REALIZADO: number | null
  OBSERVACAO: string | null
  DESVIO: number | null
  PERCENTUAL_DESVIO: number | null
  STATUS: KpiStatus | null
  CREATED_AT?: string | null
  CREATED_BY?: string | null
  UPDATED_AT?: string | null
  UPDATED_BY?: string | null
}

export type KpiVisaoGeralMes = {
  MES: string
  META: number
  REALIZADO: number | null
  STATUS: KpiStatus | null
}

export type KpiVisaoGeral = KpiCadastro & {
  MESES: KpiVisaoGeralMes[]
}

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

export const TIPOS_OPCOES = ["Maior melhor", "Menor melhor"]

export function formatarPercentual(valor?: number | null) {
  if (valor === null || valor === undefined) return "-"
  return `${(valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function formatarNumeroKpi(valor?: number | null) {
  if (valor === null || valor === undefined) return "-"
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
