// Interações de contato registradas ao longo da Jornada de Entrantes
// (e-mail encaminhado, ligação, WhatsApp, reunião...). Aparecem junto das
// transições de estágio na timeline do entrante.

export type CanalInteracao = "EMAIL" | "LIGACAO" | "WHATSAPP" | "REUNIAO" | "PRESENCIAL" | "OUTRO"
export type SentidoInteracao = "ENVIADO" | "RECEBIDO"

export const CANAIS_INTERACAO: CanalInteracao[] = [
  "EMAIL",
  "LIGACAO",
  "WHATSAPP",
  "REUNIAO",
  "PRESENCIAL",
  "OUTRO",
]

export const LABEL_CANAL_INTERACAO: Record<CanalInteracao, string> = {
  EMAIL: "E-mail",
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  REUNIAO: "Reunião",
  PRESENCIAL: "Visita presencial",
  OUTRO: "Outro contato",
}

export const LABEL_SENTIDO_INTERACAO: Record<SentidoInteracao, string> = {
  ENVIADO: "Enviado",
  RECEBIDO: "Recebido",
}

export type InteracaoEntrante = {
  ID_INTERACAO: number
  ID_ENTRADA: number
  CANAL: CanalInteracao
  SENTIDO: SentidoInteracao
  CONTATO: string | null
  ASSUNTO: string | null
  OBSERVACAO: string | null
  USUARIO: string | null
  DATA_INTERACAO: string
}

// Item da timeline unificada devolvida por
// GET /api/novos-entrantes/entrada/:id/timeline
export type EventoTimelineEntrante =
  | {
      tipo: "STATUS"
      data: string
      status_anterior: string | null
      status_novo: string
      detalhe: string | null
      usuario: string | null
    }
  | {
      tipo: "CONTATO"
      data: string
      titulo: string
      canal: CanalInteracao
      sentido: SentidoInteracao
      contato: string | null
      detalhe: string | null
      usuario: string | null
    }
