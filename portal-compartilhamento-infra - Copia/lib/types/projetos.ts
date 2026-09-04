// Tipos do módulo Projetos — espelham a DDL em
// sql/PORTAL_COMPARTILHAMENTO_PROJETO.sql

export type StatusProjeto =
  | "RECEBIDO"
  | "EM_ANALISE"
  | "PENDENTE_DOC"
  | "ANALISE_TECNICA"
  | "PARECER_EMITIDO"
  | "VINCULADO"
  | "CONCLUIDO"
  | "DEVOLVIDO"
  | "CANCELADO"

export type PrioridadeProjeto = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE"

export type TipoProjeto = "NOVO_COMPARTILHAMENTO" | "PONTOS_REVELIA" | "REMOCAO_PONTOS"
export type ModalidadeProjeto = "COMPLETO" | "CHECKLIST_SIMPLIFICADO"

export const LABEL_TIPO_PROJETO: Record<TipoProjeto, string> = {
  NOVO_COMPARTILHAMENTO: "Serviço de Novo Compartilhamento",
  PONTOS_REVELIA: "Pontos à Revelia",
  REMOCAO_PONTOS: "Remoção de Pontos",
}

export const LABEL_MODALIDADE_PROJETO: Record<ModalidadeProjeto, string> = {
  COMPLETO: "Documentação completa",
  CHECKLIST_SIMPLIFICADO: "Checklist Simplificado",
}

export type TipoProjetoCatalogo = {
  CODIGO: TipoProjeto
  NOME: string
  DESCRICAO: string
  ORDEM: number
}

export type ModalidadeCatalogo = {
  CODIGO: ModalidadeProjeto
  NOME: string
  DESCRICAO: string
  REGRA_ELEGIBILIDADE: string | null
}

export type TiposProjetoResposta = {
  tipos: TipoProjetoCatalogo[]
  modalidades: ModalidadeCatalogo[]
}

export type ChecklistDocItem = {
  CODIGO: string
  NOME: string
  OBRIGATORIO: "S" | "N"
  EXTENSOES_ACEITAS: string
  ORDEM: number
}

export type ElegibilidadeSimplificado = {
  elegivel: boolean
  motivo: string
}

export type ChecklistResposta = {
  tipo: TipoProjeto
  modalidade: ModalidadeProjeto
  sem_contrato: "S" | "N"
  documentos: ChecklistDocItem[]
  elegibilidade_simplificado: ElegibilidadeSimplificado
}

export const LABEL_PRIORIDADE_PROJETO: Record<PrioridadeProjeto, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
}

export type StatusDocumento = "PENDENTE" | "RECEBIDO" | "VALIDADO" | "REJEITADO"
export type StatusAnalisePoste = "PENDENTE" | "APROVADO" | "REPROVADO" | "REVISAR"
export type StatusSubmissao = "NOVO" | "TRIADA" | "VINCULADA" | "DESCARTADA"
export type ResultadoAnalise = "APROVADO" | "APROVADO_PARCIAL" | "REPROVADO" | "PENDENCIA"

export const LABEL_STATUS_PROJETO: Record<StatusProjeto, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  PENDENTE_DOC: "Pendente de documentos",
  ANALISE_TECNICA: "Análise técnica",
  PARECER_EMITIDO: "Parecer emitido",
  VINCULADO: "Vinculado à jornada",
  CONCLUIDO: "Concluído",
  DEVOLVIDO: "Devolvido",
  CANCELADO: "Cancelado",
}

export const CLASSE_STATUS_PROJETO: Record<StatusProjeto, string> = {
  RECEBIDO: "bg-slate-100 text-slate-700 border-slate-200",
  EM_ANALISE: "bg-blue-100 text-blue-700 border-blue-200",
  PENDENTE_DOC: "bg-amber-100 text-amber-700 border-amber-200",
  ANALISE_TECNICA: "bg-indigo-100 text-indigo-700 border-indigo-200",
  PARECER_EMITIDO: "bg-purple-100 text-purple-700 border-purple-200",
  VINCULADO: "bg-teal-100 text-teal-700 border-teal-200",
  CONCLUIDO: "bg-green-100 text-green-700 border-green-200",
  DEVOLVIDO: "bg-orange-100 text-orange-700 border-orange-200",
  CANCELADO: "bg-red-100 text-red-700 border-red-200",
}

export type ProjetoListaItem = {
  ID_PROJETO: number
  NUMERO_PROJETO: string
  TITULO: string | null
  CNPJ: string
  RAZAO_SOCIAL: string
  NOME_FANTASIA: string | null
  TIPO_PROJETO: TipoProjeto | null
  MODALIDADE: ModalidadeProjeto | null
  SEM_CONTRATO: "S" | "N"
  MUNICIPIO: string | null
  UF: string | null
  STATUS_PROJETO: StatusProjeto
  PRIORIDADE: string | null
  RESPONSAVEL_ANALISE: string | null
  PRAZO_ANALISE: string | null
  QTD_POSTES_INFORMADA: number
  QTD_POSTES_RECEBIDA: number
  QTD_POSTES_VALIDADA: number
  DOCS_OBRIGATORIOS: number
  DOCS_VALIDADOS: number
  DOCUMENTACAO_OK: "S" | "N"
  ID_PROVEDOR: number | null
  ID_PROCESSO: number | null
  NUMERO_PROTOCOLO: string | null
  CHAVE_CONEXAO: string
  DATA_RECEBIMENTO: string | null
}

export type Projeto = ProjetoListaItem & {
  REGIONAL: string | null
  CANAL_ORIGEM: string | null
  SUBMETIDO_POR: string | null
  EMAIL_REMETENTE: string | null
  DOCS_RECEBIDOS: number
  OBSERVACOES: string | null
  DATA_CONCLUSAO: string | null
  CREATED_AT: string | null
  CREATED_BY: string | null
  DIAS_OPERACAO_REVELIA: number | null
  PROTOCOLO_SAP_CRM: string | null
  NOTA_SAP_CCS: string | null
  PASTA_SHAREPOINT: string | null
  ETAPA_PROTOCOLO_CRM: "S" | "N"
  ETAPA_NOTA_CCS: "S" | "N"
  ETAPA_PASTA_SHAREPOINT: "S" | "N"
  ETAPA_ESTEIRA_ANALISE: "S" | "N"
}

export type ProjetoPoste = {
  ID_PROJETO_POSTE: number
  ID_PROJETO: number
  IDENTIFICADOR_POSTE: string | null
  BARRAMENTO: string | null
  ID_POSTE_PORTAL: number | null
  LATITUDE: number | null
  LONGITUDE: number | null
  MUNICIPIO: string | null
  UF: string | null
  LOGRADOURO: string | null
  BAIRRO: string | null
  CEP: string | null
  TIPO_OCUPACAO: string | null
  QTD_PONTOS_FIXACAO: number
  STATUS_ANALISE: StatusAnalisePoste
  MOTIVO_REPROVACAO: string | null
  GEO_VALIDADA: "S" | "N"
  POSTE_LOCALIZADO: "S" | "N"
  OBSERVACAO: string | null
}

export type ProjetoDocumento = {
  ID_PROJETO_DOCUMENTO: number
  ID_PROJETO: number
  ID_SUBMISSAO: number | null
  CODIGO_TIPO: string | null
  TIPO_DOCUMENTO: string | null
  OBRIGATORIO: "S" | "N"
  NOME_ARQUIVO: string | null
  TIPO_ARQUIVO: string | null
  CAMINHO_ARQUIVO: string | null
  TAMANHO_BYTES: number | null
  STATUS_DOCUMENTO: StatusDocumento
  MOTIVO_REJEICAO: string | null
  RECEBIDO_VIA: string | null
  EMAIL_REMETENTE: string | null
  DATA_RECEBIMENTO: string | null
  VALIDADO_POR: string | null
  DATA_VALIDACAO: string | null
  OBSERVACAO: string | null
}

export type TipoDocumentoCatalogo = {
  ID_TIPO_DOCUMENTO: number
  CODIGO: string
  NOME: string
  OBRIGATORIO: "S" | "N"
  EXTENSOES_ACEITAS: string
  ORDEM: number
  ATIVO: "S" | "N"
}

export type ProjetoAnalise = {
  ID_ANALISE: number
  ID_PROJETO: number
  DOC_CONFERIDA: "S" | "N"
  CNPJ_REGULAR: "S" | "N"
  LICENCA_ANATEL_OK: "S" | "N"
  POSTES_LOCALIZADOS: "S" | "N"
  GEO_DENTRO_CONCESSAO: "S" | "N"
  CAPACIDADE_SUFICIENTE: "S" | "N"
  RESULTADO: ResultadoAnalise | null
  PARECER: string | null
  QTD_POSTES_APROVADOS: number
  QTD_POSTES_REPROVADOS: number
  USUARIO_ANALISE: string | null
  DATA_ANALISE: string | null
}

export type ProjetoHistorico = {
  ID_HISTORICO: number
  ID_PROJETO: number
  TIPO_EVENTO: string | null
  STATUS_ANTERIOR: string | null
  STATUS_NOVO: string | null
  DESCRICAO: string | null
  USUARIO: string | null
  DATA_EVENTO: string | null
}

export type ProjetoVinculo = {
  CHAVE_CONEXAO: string
  RESOLVIDO: boolean
  provedor: {
    ID_PROVEDOR: number
    RAZAO_SOCIAL: string | null
    NOME_FANTASIA: string | null
    CNPJ: string | null
    STATUS_CADASTRO: string | null
  } | null
  processo: {
    ID_PROCESSO: number
    NUMERO_PROTOCOLO: string | null
    STATUS_ATUAL: string | null
    ETAPA_ATUAL: number | null
  } | null
}

export type ProjetoDetalhe = {
  projeto: Projeto
  postes: ProjetoPoste[]
  documentos: ProjetoDocumento[]
  analises: ProjetoAnalise[]
  historico: ProjetoHistorico[]
  vinculo: ProjetoVinculo
}

export type Submissao = {
  ID_SUBMISSAO: number
  ID_PROJETO: number | null
  CHAVE_CONEXAO: string | null
  MESSAGE_ID: string | null
  EMAIL_REMETENTE: string | null
  EMAIL_PARA: string | null
  ASSUNTO: string | null
  CORPO_RESUMO: string | null
  DATA_EMAIL: string | null
  QTD_ANEXOS: number
  STATUS_SUBMISSAO: StatusSubmissao
  MOTIVO_DESCARTE: string | null
  SUBMETIDO_POR: string | null
  DATA_SUBMISSAO: string | null
  PROVEDOR_CONHECIDO: boolean
}

export type OpcaoVinculoProcesso = {
  ID_PROCESSO: number
  NUMERO_PROTOCOLO: string | null
  STATUS_ATUAL: string | null
  ETAPA_ATUAL: number | null
}

export type OpcaoVinculoProvedor = {
  ID_PROVEDOR: number
  RAZAO_SOCIAL: string
  NOME_FANTASIA: string | null
  CNPJ: string
  MUNICIPIO: string | null
  UF: string | null
  STATUS_CADASTRO: string | null
  processos: OpcaoVinculoProcesso[]
}

export type ResumoProjetos = {
  total: number
  em_analise: number
  pendente_doc: number
  vinculados: number
  atrasados: number
  submissoes_novas: number
  postes_recebidos: number
  postes_aprovados: number
}
