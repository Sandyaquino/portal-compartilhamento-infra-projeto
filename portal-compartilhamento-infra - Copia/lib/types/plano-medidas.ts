export type PlanoMedidaItem = {
  ID: number
  BLOCO: string
  KPI: string
  MES: string
  DESVIO_IDENTIFICADO: number | null
  CAUSA_RAIZ: string | null
  MEDIDA_ACAO: string
  RESPONSAVEL: string
  PRAZO: string
  STATUS: string
  RISCO: string
  EVIDENCIA_LINK: string | null
  COMENTARIO_EXECUTIVO: string | null
  CREATED_AT?: string | null
  CREATED_BY?: string | null
  UPDATED_AT?: string | null
  UPDATED_BY?: string | null
}

export const BLOCOS_SUGERIDOS = [
  "Operação de Campo",
  "Mercado e Faturamento",
  "Qualidade e Processo",
  "Resultado Financeiro",
]

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

export const STATUS_OPCOES = ["Não iniciado", "Em andamento", "Concluído"]

export const RISCO_OPCOES = ["Baixo", "Médio", "Alto"]

export function estaVencido(item: Pick<PlanoMedidaItem, "PRAZO" | "STATUS">) {
  if (!item.PRAZO || item.STATUS === "Concluído") return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const prazo = new Date(`${item.PRAZO}T00:00:00`)
  return !Number.isNaN(prazo.getTime()) && prazo.getTime() < hoje.getTime()
}

export function formatarDesvio(valor?: number | null) {
  if (valor === null || valor === undefined) return "-"
  return `${(valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function formatarPrazoCurto(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(`${valor}T00:00:00`)
  if (Number.isNaN(data.getTime())) return valor
  return data.toLocaleDateString("pt-BR")
}
