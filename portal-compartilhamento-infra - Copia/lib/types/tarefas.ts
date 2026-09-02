// Caixa de Tarefas — pendências acionáveis agregadas de vários módulos.
// Espelha o agregador em mock-api-dev/routes-tarefas.js.

export type TipoTarefa =
  | "PROJETO_ANALISE"
  | "PROJETO_ATRIBUIR"
  | "SUBMISSAO_TRIAR"
  | "ENTRANTE_ANALISE"
  | "ENTRANTE_ATRIBUIR"
  | "ACAO_EXECUTAR"

export type SituacaoPrazo = "ATRASADO" | "VENCENDO" | "EM_DIA" | "SEM_PRAZO"

export type Tarefa = {
  ID: string
  TIPO: TipoTarefa
  TITULO: string
  DESCRICAO: string | null
  MODULO: string
  RESPONSAVEL: string | null
  PRIORIDADE: string | null
  PRAZO: string | null
  DIAS_PARA_PRAZO: number | null
  SITUACAO_PRAZO: SituacaoPrazo
  LINK: string
  DATA_REFERENCIA: string | null
}

export type ResumoTarefas = {
  total: number
  atrasadas: number
  vencendo: number
  sem_prazo: number
  por_modulo: Record<string, number>
}

export const LABEL_TIPO_TAREFA: Record<TipoTarefa, string> = {
  PROJETO_ANALISE: "Analisar projeto",
  PROJETO_ATRIBUIR: "Atribuir projeto",
  SUBMISSAO_TRIAR: "Triar submissão",
  ENTRANTE_ANALISE: "Analisar entrante",
  ENTRANTE_ATRIBUIR: "Atribuir entrante",
  ACAO_EXECUTAR: "Executar ação",
}

export const LABEL_SITUACAO_PRAZO: Record<SituacaoPrazo, string> = {
  ATRASADO: "Atrasada",
  VENCENDO: "Vence em breve",
  EM_DIA: "Em dia",
  SEM_PRAZO: "Sem prazo",
}

export const CLASSE_SITUACAO_PRAZO: Record<SituacaoPrazo, string> = {
  ATRASADO: "bg-red-50 text-red-700 border-red-200",
  VENCENDO: "bg-amber-50 text-amber-700 border-amber-200",
  EM_DIA: "bg-slate-50 text-slate-600 border-slate-200",
  SEM_PRAZO: "bg-slate-50 text-slate-500 border-slate-200",
}

export const PONTO_SITUACAO_PRAZO: Record<SituacaoPrazo, string> = {
  ATRASADO: "bg-red-500",
  VENCENDO: "bg-amber-500",
  EM_DIA: "bg-emerald-500",
  SEM_PRAZO: "bg-slate-300",
}

export function rotuloPrazo(tarefa: Pick<Tarefa, "PRAZO" | "DIAS_PARA_PRAZO" | "SITUACAO_PRAZO">): string {
  if (!tarefa.PRAZO || tarefa.DIAS_PARA_PRAZO === null) return "Sem prazo"
  const d = tarefa.DIAS_PARA_PRAZO
  if (d < 0) return `Atrasada ${Math.abs(d)}d`
  if (d === 0) return "Vence hoje"
  if (d === 1) return "Vence amanhã"
  return `Vence em ${d}d`
}
