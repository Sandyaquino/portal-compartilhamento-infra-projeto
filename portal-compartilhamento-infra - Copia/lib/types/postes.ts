export type PosteMapa = {
  BARRAMENTO: string
  X: number
  Y: number
  TEM_OCUPACAO_IDENTIFICADA: "S" | "N"
  // Capacidade estrutural (pontos de fixação p/ terceiros) e pontos ocupados
  // hoje - base do indicador de saturação do parque. Opcionais: o backend real
  // ainda não expõe esses campos por poste (só o mock).
  CAPACIDADE?: number
  PONTOS_OCUPADOS?: number
}

export type PostesMapaResponse = {
  postes: PosteMapa[]
  truncado: boolean
}

// Ponto enxuto devolvido por GET /api/postes/por-operadora (parque inteiro
// da operadora, sem recorte de viewport) - usado só pra calcular o fitBounds.
export type PostePonto = {
  BARRAMENTO: string
  X: number
  Y: number
}

export type PosteOcupacao = {
  ID: number
  BOARD_NAME: string
  ORGANIZATION_NAME: string | null
  CNPJ: string | null
  RAZAO_SOCIAL: string | null
}

export type Operadora = {
  ID: number
  RAZAO_SOCIAL: string
  CNPJ: string
  TOTAL_OCUPACOES: number
}

export type ResumoPostes = {
  total_postes: number
  total_ocupacoes: number
  postes_identificados: number
  percentual_identificado: number
  // Saturação do parque: esgotados = ocupados >= capacidade (inclui sobrecarga).
  // Opcionais: o backend real ainda não expõe capacidade do poste, então esses
  // campos só vêm do mock. A UI deve degradar para "n/d" quando ausentes.
  postes_esgotados?: number
  postes_sobrecarga?: number
}

export type StatusFiltro = "identificado" | "nao_identificado"

export type SaturacaoFiltro = "disponivel" | "quase" | "esgotado" | "sobrecarga"

// Classifica um poste pela ocupação relativa à capacidade. Mesmos limiares do
// mock (mock-api-dev/routes-postes.js -> nivelSaturacao).
export function nivelSaturacao(ocupados: number | undefined, capacidade: number | undefined): SaturacaoFiltro {
  if (!capacidade || capacidade <= 0 || !ocupados || ocupados <= 0) return "disponivel"
  if (ocupados > capacidade) return "sobrecarga"
  if (ocupados === capacidade) return "esgotado"
  if (ocupados / capacidade >= 0.6) return "quase"
  return "disponivel"
}

export const SATURACAO_INFO: Record<SaturacaoFiltro, { label: string; cor: string }> = {
  disponivel: { label: "Disponível", cor: "#16A34A" },
  quase: { label: "Quase esgotado", cor: "#D97706" },
  esgotado: { label: "Esgotado", cor: "#DC2626" },
  sobrecarga: { label: "Sobrecarga", cor: "#7C2D12" },
}

export type TipoAcao = "FISCALIZACAO" | "ORDENAMENTO" | "REMOCAO"
export type StatusAcao = "ABERTA" | "CONCLUIDA" | "CANCELADA"

export type AcaoPoste = {
  ID_ACAO: number
  TIPO: TipoAcao
  TITULO: string | null
  RESPONSAVEL: string | null
  PRAZO: string | null
  STATUS: StatusAcao
  QTD_POSTES: number
  MIN_X: number | null
  MAX_X: number | null
  MIN_Y: number | null
  MAX_Y: number | null
  OBSERVACAO: string | null
  CREATED_AT: string
  CREATED_BY: string | null
  UPDATED_AT: string
}

export type CriarAcaoPosteInput = {
  tipo: TipoAcao
  titulo?: string
  responsavel?: string
  prazo?: string
  observacao?: string
  criado_por?: string
  barramentos: string[]
  bounds?: { min_x: number; max_x: number; min_y: number; max_y: number }
}

export const LABEL_TIPO_ACAO: Record<TipoAcao, string> = {
  FISCALIZACAO: "Fiscalização",
  ORDENAMENTO: "Ordenamento",
  REMOCAO: "Remoção",
}

export const LABEL_STATUS_ACAO: Record<StatusAcao, string> = {
  ABERTA: "Aberta",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
}

export function formatarCnpj(valor?: string | null) {
  const digitos = String(valor ?? "").replace(/\D/g, "")
  if (digitos.length !== 14) return valor ?? "-"
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
}

// Paleta padrão pra colorir operadora no mapa/filtro antes do usuário
// escolher uma cor própria - só pra não nascer tudo cinza.
const PALETA_PADRAO = [
  "#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED",
  "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#4F46E5",
]

export function corPadraoOperadora(idOperadora: number) {
  return PALETA_PADRAO[idOperadora % PALETA_PADRAO.length]
}

const CHAVE_LOCALSTORAGE_CORES = "mapa-postes:cores-operadoras"

export function carregarCoresOperadoras(): Record<number, string> {
  if (typeof window === "undefined") return {}
  try {
    const bruto = window.localStorage.getItem(CHAVE_LOCALSTORAGE_CORES)
    return bruto ? JSON.parse(bruto) : {}
  } catch {
    return {}
  }
}

export function salvarCorOperadora(idOperadora: number, cor: string) {
  if (typeof window === "undefined") return
  const atual = carregarCoresOperadoras()
  const novo = { ...atual, [idOperadora]: cor }
  window.localStorage.setItem(CHAVE_LOCALSTORAGE_CORES, JSON.stringify(novo))
}
