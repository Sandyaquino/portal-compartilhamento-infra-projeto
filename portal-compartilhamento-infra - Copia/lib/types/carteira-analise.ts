// Tipos do gerador automático da Carteira de Análise Comercial.
// Espelha sql/PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO.sql.

export type AtividadeTempoPadrao = {
  CODIGO_ATIVIDADE: string
  NOME: string
  DESCRICAO: string | null
  TEMPO_MEDIO_MINUTOS: number
  ATIVO: "S" | "N"
}

// Carga calculada de um responsável dentro do plano de geração.
export type CargaResponsavel = {
  login: string
  nome: string
  cargaAtual: number
  itensNovos: number
  cargaTotal: number
  minutosTotais: number
  prazoEstimado: string // YYYY-MM-DD
}

// Um item da fila prestes a receber responsável + prazo.
export type AtribuicaoPlano = {
  id: number
  titulo: string
  responsavel: string
  prazo: string
}

export type PlanoGeracaoCarteira = {
  totalPendentes: number
  totalDistribuidos: number
  naoDistribuidos: number
  porResponsavel: CargaResponsavel[]
  atribuicoes: AtribuicaoPlano[]
  prazoFactivel: string | null
}
