// Catálogo das fases da Carteira de Análise Comercial. Compartilhado entre
// a tela (app/(app)/comercial/carteira-analise/page.tsx) e o gerador
// automático (components/comercial/gerar-carteira-modal.tsx), para as duas
// pontas nunca ficarem dessincronizadas.

export type TipoFase = "entrante" | "etapa" | "contato"

export type FaseConfig = {
  id: string
  label: string
  tipo: TipoFase
  etapaId?: number
  // Código da atividade na tabela de apoio ATIVIDADE_TEMPO_PADRAO.
  codigoAtividade: string
}

export const FASES: FaseConfig[] = [
  { id: "entrante", label: "Análise de Entrante", tipo: "entrante", codigoAtividade: "ENTRANTE" },
  { id: "etapa-1", label: "Análise Cadastral", tipo: "etapa", etapaId: 1, codigoAtividade: "ETAPA_1" },
  { id: "etapa-2", label: "Documentação", tipo: "etapa", etapaId: 2, codigoAtividade: "ETAPA_2" },
  { id: "etapa-3", label: "Aprovação", tipo: "etapa", etapaId: 3, codigoAtividade: "ETAPA_3" },
  { id: "etapa-4", label: "Contratação", tipo: "etapa", etapaId: 4, codigoAtividade: "ETAPA_4" },
  { id: "contato", label: "Contato com Provedor", tipo: "contato", codigoAtividade: "CONTATO" },
]

// Endpoint (path) que devolve a fila (itens ativos) de cada fase.
export function urlCarteiraDaFase(fase: FaseConfig): string {
  if (fase.tipo === "entrante") return "/api/novos-entrantes/carteira"
  if (fase.tipo === "etapa") return `/api/processos/carteira?etapa_id=${fase.etapaId}`
  return "/api/processos/carteira-contato"
}

// Endpoint (path) que atribui responsável + prazo a UM item daquela fase.
export function urlAtribuirDaFase(fase: FaseConfig, idItem: number): string {
  if (fase.tipo === "entrante") return `/api/novos-entrantes/entrada/${idItem}/atribuir`
  if (fase.tipo === "etapa") return `/api/processos/${idItem}/jornada/atribuir`
  return `/api/processos/${idItem}/atribuir-contato`
}

// Campo bruto de responsável/prazo de cada shape de item (antes de normalizar).
export function responsavelBruto(fase: FaseConfig, item: Record<string, unknown>): string | null {
  const campo = fase.tipo === "entrante" ? "RESPONSAVEL_ANALISE" : fase.tipo === "etapa" ? "RESPONSAVEL_ETAPA" : "RESPONSAVEL_CONTATO"
  const v = item[campo]
  return typeof v === "string" && v.trim() ? v : null
}
