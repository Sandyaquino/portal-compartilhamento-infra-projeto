// Rede de distribuição (trechos de média e baixa tensão) e a análise de
// "postes na rota não faturados". Espelha
// sql/PORTAL_COMPARTILHAMENTO_TRECHO_REDE.sql, mock-api-dev/routes-trecho-rede.js
// e portal-api/routers/trecho_rede.py.

export type EntidadeTrecho = "TRECHO DE MT" | "TRECHO DE BT"
export type ModoAnaliseRede = "MESMO_PROVEDOR" | "CORREDOR"

export type ResumoRede = {
  trechos: number
  trechos_mt: number
  trechos_bt: number
  km_total: number
  km_mt: number
  km_bt: number
  municipios: number
  alimentadores: number
  nos: number
}

export type MunicipioRede = {
  MUNICIPIO: string
  TRECHOS: number
  min_x: number
  max_x: number
  min_y: number
  max_y: number
}
export type AlimentadorRede = { ALIMENTADOR: string; TRECHOS: number }

export type SegmentoRedeApi = {
  ax: number
  ay: number
  bx: number
  by: number
  entidade: EntidadeTrecho
  alimentador: string
  implicado: boolean
}

export type NoRede = {
  BARRAMENTO: string
  X: number
  Y: number
  MUNICIPIO: string
  ALIMENTADOR: string
  ENTIDADE: EntidadeTrecho
  TEM_PROVEDOR: "S" | "N"
}

export type MapaRedeResposta = {
  total: number
  truncado: boolean
  segmentos: SegmentoRedeApi[]
}

export type ProvedorImplicado = { chave: string; razao: string }

export type EvidenciaNaoFaturado = {
  poste_a: string
  poste_c: string
  trechos: number
  metros: number
  alimentador: string | null
  mesmo_alimentador: boolean
  provedores: ProvedorImplicado[]
}

export type PosteNaoFaturado = {
  BARRAMENTO: string
  X: number
  Y: number
  MUNICIPIO: string
  ALIMENTADOR: string
  ENTIDADE: EntidadeTrecho
  SCORE: number
  GRAU: number
  SEM_OCUPACAO: boolean
  provedores: ProvedorImplicado[]
  evidencias: EvidenciaNaoFaturado[]
}

export type ParametrosAnaliseRede = {
  municipio: string
  alimentador: string | null
  entidade: EntidadeTrecho | "AMBOS"
  modo: ModoAnaliseRede
  max_trechos: number
  exigir_mesmo_alimentador: boolean
  max_metros_vao: number
  min_score: number
  id_operadora: number | null
}

export type ResumoAnaliseRede = {
  trechos_no_escopo: number
  nos: number
  nos_sem_ocupacao: number
  postes_sinalizados: number
  provedores_implicados: number
}

export type AnaliseRedeResposta = {
  parametros: ParametrosAnaliseRede
  resumo: ResumoAnaliseRede
  postes: PosteNaoFaturado[]
  segmentos: SegmentoRedeApi[]
}

export type AnaliseRedePayload = {
  municipio: string
  alimentador?: string | null
  entidade?: EntidadeTrecho | null
  modo?: ModoAnaliseRede
  max_trechos?: number
  exigir_mesmo_alimentador?: boolean
  max_metros_vao?: number
  min_score?: number
  id_operadora?: number | null
}
