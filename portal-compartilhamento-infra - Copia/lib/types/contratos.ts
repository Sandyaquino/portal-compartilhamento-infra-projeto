export type ProvedorContrato = {
  ID_PROVEDOR: number
  CNPJ?: string | null
  RAZAO_SOCIAL?: string | null
  NOME_FANTASIA?: string | null
  RESPONSAVEL?: string | null
  EMAIL?: string | null
  TELEFONE?: string | null
  STATUS_CADASTRO?: string | null
  TOTAL_PROCESSOS?: number
  ULTIMA_CONCLUSAO?: string | null
}

export type ProcessoResumoContrato = {
  ID_PROCESSO: number
  NUMERO_PROTOCOLO?: string | null
  TIPO_PROCESSO?: string | null
  STATUS_ATUAL?: string | null
  ETAPA_ATUAL?: number | null
  NOME_ETAPA_ATUAL?: string | null
  DT_ABERTURA?: string | null
  DT_PREVISAO_CONCLUSAO?: string | null
  DT_CONCLUSAO?: string | null
}

export type EntradaResumoContrato = {
  ID_ENTRADA: number
  DATA_RECEBIMENTO?: string | null
  STATUS_ENTRADA?: string | null
  MUNICIPIO?: string | null
}

// Contrato/PN gerado quando um processo conclui a etapa de Contratação
// (GET /api/provedores/:id/contratos).
export type ContratacaoProvedor = {
  ID_CONTRATACAO: number
  ID_PROCESSO: number
  NUMERO_PROTOCOLO?: string | null
  MUNICIPIO?: string | null
  NUMERO_PN?: string | null
  NUMERO_CONTRATO?: string | null
  DATA_ASSINATURA?: string | null
  URL_CONTRATO?: string | null
  DATA_REGISTRO?: string | null
}

export type EventoTimelineContrato = {
  tipo: "ENTRADA" | "JORNADA" | "CONTATO"
  data?: string | null
  titulo?: string | null
  descricao?: string | null
  usuario?: string | null
  id_processo?: number | null
}

export type TimeResponsavel = "TECNICO" | "NEGOCIACAO" | "COMERCIAL"

export type PosteDoProvedor = {
  BARRAMENTO: string
  BOARD_NAME?: string | null
  X?: number | null
  Y?: number | null
}

export type SolicitacaoAcao = {
  ID_SOLICITACAO: number
  ID_PROVEDOR: number
  ID_PROCESSO?: number | null
  ID_ACAO_POSTE?: number | null
  TIPO_ACAO: string
  TIME_RESPONSAVEL: TimeResponsavel
  DESCRICAO?: string | null
  PRIORIDADE?: string | null
  STATUS: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA"
  SOLICITADO_POR?: string | null
  DATA_SOLICITACAO?: string | null
  RESPONSAVEL_EXECUCAO?: string | null
  DATA_CONCLUSAO?: string | null
  OBSERVACAO_CONCLUSAO?: string | null
}

export const CATALOGO_TIPOS_ACAO: Record<string, { label: string; time: TimeResponsavel }> = {
  REMOCAO: { label: "Solicitar remoção", time: "TECNICO" },
  NOTIFICACAO: { label: "Encaminhar notificação ao provedor", time: "COMERCIAL" },
  COBRANCA: { label: "Solicitar cobrança", time: "NEGOCIACAO" },
  DESFAZER_CONTRATO: { label: "Solicitar desfazimento do contrato", time: "COMERCIAL" },
  OUTRO: { label: "Outra solicitação", time: "COMERCIAL" },
}

export const LABEL_TIME: Record<string, string> = {
  TECNICO: "Técnico",
  NEGOCIACAO: "Negociação",
  COMERCIAL: "Comercial",
}

export const LABEL_PRIORIDADE: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
}

export const LABEL_STATUS_SOLICITACAO: Record<string, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
}
