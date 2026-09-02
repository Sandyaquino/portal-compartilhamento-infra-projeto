"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Clock,
  GitBranch,
  Mail,
  Phone,
  MessageCircle,
  Users,
  MapPin,
  MessageSquare,
  Plus,
} from "lucide-react"

import { API_BASE_URL } from "@/lib/config"
import { statusLabel } from "@/hooks/use-lista-entrantes"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Button } from "@/components/ui/button"
import {
  LABEL_CANAL_INTERACAO,
  LABEL_SENTIDO_INTERACAO,
  type CanalInteracao,
  type EventoTimelineEntrante,
} from "@/lib/types/interacoes-entrante"
import {
  RegistrarInteracaoModal,
  type RegistrarInteracaoValues,
} from "@/components/comercial/registrar-interacao-modal"

const ICONE_CANAL: Record<CanalInteracao, typeof Mail> = {
  EMAIL: Mail,
  LIGACAO: Phone,
  WHATSAPP: MessageCircle,
  REUNIAO: Users,
  PRESENCIAL: MapPin,
  OUTRO: MessageSquare,
}

function formatarDataHora(valor: string) {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return data.toLocaleString("pt-BR")
}

type Props = {
  idEntrada: string | number
  emailContato?: string | null
  telefoneContato?: string | null
  disabled?: boolean
}

export function TimelineEntrante({ idEntrada, emailContato, telefoneContato, disabled }: Props) {
  const { user } = useCurrentUser()
  const [eventos, setEventos] = useState<EventoTimelineEntrante[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      setErro(null)
      const resposta = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${idEntrada}/timeline`,
        { cache: "no-store" },
      )
      if (!resposta.ok) throw new Error(`Erro ${resposta.status} ao carregar a timeline`)
      const dados = await resposta.json()
      setEventos(Array.isArray(dados) ? dados : [])
    } catch (error) {
      console.error("Erro ao carregar timeline do entrante:", error)
      setEventos([])
      setErro("Não foi possível carregar a timeline.")
    } finally {
      setLoading(false)
    }
  }, [idEntrada])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function registrarContato(valores: RegistrarInteracaoValues) {
    const resposta = await fetch(
      `${API_BASE_URL}/api/novos-entrantes/entrada/${idEntrada}/interacoes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...valores, usuario: user?.login ?? null }),
      },
    )
    const dados = await resposta.json().catch(() => null)
    if (!resposta.ok) throw new Error(dados?.detail || "Erro ao registrar o contato.")
    await carregar()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Transições de estágio e interações de contato, em ordem cronológica.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setModalAberto(true)}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
          Registrar contato
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando timeline...</p>
      ) : erro ? (
        <p className="text-sm text-destructive">{erro}</p>
      ) : eventos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum evento registrado para este entrante ainda.</p>
      ) : (
        <ol className="space-y-4">
          {eventos.map((evento, index) => {
            const ehContato = evento.tipo === "CONTATO"
            const Icone = ehContato ? ICONE_CANAL[evento.canal] ?? MessageSquare : GitBranch
            return (
              <li key={`${evento.tipo}-${index}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      ehContato ? "bg-blue-50 text-blue-600" : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Icone className="h-3.5 w-3.5" />
                  </span>
                  {index < eventos.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                </div>

                <div className="flex-1 pb-4">
                  {evento.tipo === "STATUS" ? (
                    <p className="text-sm font-semibold text-slate-800">
                      {evento.status_anterior ? (
                        <>
                          {statusLabel(evento.status_anterior)} → {statusLabel(evento.status_novo)}
                        </>
                      ) : (
                        statusLabel(evento.status_novo)
                      )}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{evento.titulo}</p>
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {LABEL_CANAL_INTERACAO[evento.canal] ?? evento.canal}
                        <span className="text-blue-400">·</span>
                        {LABEL_SENTIDO_INTERACAO[evento.sentido] ?? evento.sentido}
                      </span>
                    </div>
                  )}

                  <p className="mt-0.5 text-xs text-slate-500">
                    <Clock className="mr-1 inline h-3 w-3 align-[-1px]" />
                    {formatarDataHora(evento.data)}
                    {evento.usuario ? ` · ${evento.usuario}` : ""}
                    {evento.tipo === "CONTATO" && evento.contato ? ` · ${evento.contato}` : ""}
                  </p>

                  {evento.detalhe && (
                    <p className="mt-1 text-xs text-slate-600">{evento.detalhe}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <RegistrarInteracaoModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        emailContato={emailContato}
        telefoneContato={telefoneContato}
        onSalvar={registrarContato}
      />
    </div>
  )
}
