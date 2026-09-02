// Base de Postes Coelba (cadastro de ativos). Espelha
// sql/PORTAL_COMPARTILHAMENTO_BASE_POSTE.sql e mock-api-dev/routes-base-poste.js.

export type VinculoBasePoste = "todos" | "sem_provedor" | "com_provedor"

export type BaseBounds = { min_x: number; max_x: number; min_y: number; max_y: number }

export type BasePosteMapa = {
  NU_PG_ID: number
  NU_LOCALIDADE_ID: number | null
  LOCALIDADE: string | null
  DE_BARRAMENTO: string
  MUNICIPIO: string | null
  UF: string | null
  NU_LATITUDE: number
  NU_LONGITUDE: number
  DATA_ATUALIZACAO: string | null
  TEM_PROVEDOR: "S" | "N"
}

export type BasePostesMapaResposta = {
  postes: BasePosteMapa[]
  truncado: boolean
  // true = a seleção é ampla demais; o front deve usar /densidade
  agregar: boolean
  total_na_selecao: number
}

export type BaseMunicipio = {
  MUNICIPIO: string
  TOTAL: number
  SEM_PROVEDOR: number
  bounds: BaseBounds | null
}

export type BaseLocalidade = {
  NU_LOCALIDADE_ID: number
  LOCALIDADE: string
  MUNICIPIO: string
  TOTAL: number
  SEM_PROVEDOR: number
  bounds: BaseBounds | null
}

export type ResumoBasePostes = {
  total: number
  com_provedor: number
  sem_provedor: number
  municipios: number
  localidades: number
  data_atualizacao_max: string | null
}

export const LABEL_VINCULO_BASE: Record<VinculoBasePoste, string> = {
  todos: "Todos",
  sem_provedor: "Sem provedor",
  com_provedor: "Com provedor",
}
