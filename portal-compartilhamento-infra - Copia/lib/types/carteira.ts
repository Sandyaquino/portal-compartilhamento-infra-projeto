// Carteira de Serviço das Equipes de Campo.
// Espelha sql/PORTAL_COMPARTILHAMENTO_CARTEIRA.sql e mock-api-dev/routes-carteira.js.

export type FrequenciaCarteira = "DIARIA" | "SEMANAL" | "MENSAL"
export type ModoCarteira = "MANUAL" | "AUTOMATICA"
export type StatusCarteira = "RASCUNHO" | "PUBLICADA" | "CONCLUIDA" | "CANCELADA"
export type StatusCarteiraOS = "PLANEJADA" | "EM_ROTA" | "EXECUTADA" | "CANCELADA"

export const LABEL_FREQUENCIA: Record<FrequenciaCarteira, string> = {
  DIARIA: "Diária (1 dia útil)",
  SEMANAL: "Semanal (5 dias úteis)",
  MENSAL: "Mensal (22 dias úteis)",
}

export const LABEL_STATUS_CARTEIRA: Record<StatusCarteira, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
}

export const CLASSE_STATUS_CARTEIRA: Record<StatusCarteira, string> = {
  RASCUNHO: "bg-slate-100 text-slate-700 border-slate-200",
  PUBLICADA: "bg-blue-100 text-blue-700 border-blue-200",
  CONCLUIDA: "bg-green-100 text-green-700 border-green-200",
  CANCELADA: "bg-red-100 text-red-700 border-red-200",
}

export type EstrategiaCarteira = {
  CODIGO: string
  NOME: string
  DESCRICAO: string
  PARAMETROS: string
}

export type EpsCarteira = {
  ID_EPS: number
  NOME: string
  CNPJ: string | null
  TIPO_SERVICO: string
}

// Tabela de suporte: relaciona a EPS com a estrutura organizacional
// (SUPERINTENDENCIA -> UTD -> SETOR -> MUNICIPIO). Uma linha por
// (EPS, MUNICIPIO). Fonte do filtro em cascata do gerador de carteira.
export type EpsAtuacao = {
  ID_EPS: number
  NOME: string
  SUPERINTENDENCIA: string
  UTD: string
  SETOR: string
  MUNICIPIO: string
}

export type EquipeCampo = {
  ID_EQUIPE: number
  ID_EPS: number
  NOME: string
  ENCARREGADO: string | null
  MUNICIPIO_BASE: string | null
  LATITUDE_BASE: number | null
  LONGITUDE_BASE: number | null
  TIPO: string
}

export type AreaLocalidade = {
  NU_LOCALIDADE_ID: number
  LOCALIDADE: string
  TOTAL: number
  SEM_PROVEDOR: number
}

export type AreaMunicipio = {
  MUNICIPIO: string
  TOTAL: number
  SEM_PROVEDOR: number
  localidades: AreaLocalidade[]
}

export type CarteiraOS = {
  ID_CARTEIRA_OS?: number
  ID_CARTEIRA?: number
  SEQ: number
  NU_PG_ID: number
  DE_BARRAMENTO: string
  MUNICIPIO: string
  LOCALIDADE: string | null
  LATITUDE: number
  LONGITUDE: number
  TEM_PROVEDOR: "S" | "N"
  ID_EQUIPE: number
  NOME_EQUIPE: string
  EPS: string
  DATA_PREVISTA: string
  DIA_INDICE: number
  ORDEM_NO_DIA: number
  ESTRATEGIA: string | null
  SCORE: number | null
  MOTIVO: string | null
  STATUS: StatusCarteiraOS
  LINK_GMAPS: string
  LINK_WAZE: string
}

export type Carteira = {
  ID_CARTEIRA: number
  TITULO: string
  FREQUENCIA: FrequenciaCarteira
  DATA_INICIO: string
  DATA_FIM: string
  MODO: ModoCarteira
  ESTRATEGIA: string | null
  ID_EPS: number | null
  EPS?: string
  QTD_POSTES_DIA: number
  QTD_OS: number
  QTD_EQUIPES: number
  STATUS: StatusCarteira
  PARAMETROS_JSON?: string | null
  CREATED_AT?: string
  CREATED_BY?: string
}

// Prefill do gerador quando se está regerando uma carteira RASCUNHO.
export type CriteriosCarteira = {
  id_carteira: number
  titulo?: string
  frequencia: FrequenciaCarteira
  data_inicio: string
  modo: ModoCarteira
  estrategia?: string
  id_eps?: number | null
  ids_equipes: number[]
  qtd_postes_dia: number
  municipios: string[]
  localidades: number[]
  barramentos: string[]
  params?: Record<string, number>
}

// Sobreposição de postes com outras carteiras já registradas na base.
export type CarteiraConflito = {
  id_carteira: number
  titulo: string
  status: StatusCarteira
  data_inicio: string
  data_fim: string
  qtd_postes: number
}
export type DuplicidadeCarteira = {
  tem_conflito: boolean
  total_postes: number
  total_carteiras: number
  carteiras: CarteiraConflito[]
  ultima: CarteiraConflito | null
}

export type ResumoCarteira = {
  qtd_os: number
  qtd_dias: number
  qtd_equipes: number
  qtd_municipios: number
  sem_provedor: number
  com_provedor: number
  candidatos_estrategia?: number
  capacidade?: number
}

export type DiaCarteira = {
  dia_indice: number
  data: string
  qtd: number
  municipios: string[]
  equipes: string[]
}

export type EquipeCarteira = {
  id_equipe?: number
  nome: string
  encarregado?: string | null
  qtd: number
  municipios: string[]
}

export type CarteiraDetalhe = {
  carteira: Carteira
  os: CarteiraOS[]
  resumo: ResumoCarteira
  por_dia: DiaCarteira[]
  por_equipe: EquipeCarteira[]
}

export type GerarCarteiraPayload = {
  titulo?: string
  frequencia: FrequenciaCarteira
  data_inicio: string
  modo: ModoCarteira
  estrategia?: string
  id_eps?: number | null
  ids_equipes: number[]
  qtd_postes_dia: number
  municipios: string[]
  localidades: number[]
  barramentos?: string[]
  params?: Record<string, number>
  usuario?: string | null
  // ID da carteira sendo regerada (para ignorar ela mesma na checagem de duplicidade).
  id_carteira?: number
  // Prossegue mesmo com postes já presentes em outras carteiras.
  forcar?: boolean
}
