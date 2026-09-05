"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EstatItem } from "@/components/projetos/projeto-ui"
import { GanttTurmas } from "@/components/operacao/gantt-turmas"
import { apiFetch } from "@/lib/config"
import type { GanttTurmasResposta } from "@/lib/types/carteira"

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function GanttTurmasPage() {
  const router = useRouter()
  const agora = new Date()
  const anoAtual = agora.getFullYear()
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1]

  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [ano, setAno] = useState(anoAtual)
  const [dados, setDados] = useState<GanttTurmasResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setNotification(null)
    try {
      const res = await apiFetch(`/api/carteira/gantt?mes=${mes}&ano=${ano}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar a agenda das turmas`)
      setDados((await res.json()) as GanttTurmasResposta)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar a agenda das turmas",
      })
    } finally {
      setLoading(false)
    }
  }, [mes, ano])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const n = dados?.numeros
  const pct = n ? Math.round(n.ocupacao_media * 100) : 0

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Agenda das Turmas"
        description="Linha do tempo (Gantt) das turmas com carteiras de serviço geradas e confirmadas — publicadas ou concluídas. Filtre por mês e ano."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Operação", href: "/operacao" },
          { label: "Agenda das Turmas" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
              aria-label="Mês"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
              aria-label="Ano"
            >
              {anos.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        <EstatItem label="Turmas" valor={n?.turmas ?? "—"} tom="primary" sub="com carteira confirmada" />
        <EstatItem label="Carteiras" valor={n?.carteiras ?? "—"} sub="ativas no mês" />
        <EstatItem
          label="OS planejadas"
          valor={(n?.os_planejadas ?? 0).toLocaleString("pt-BR")}
          sub={`${(n?.os_executadas ?? 0).toLocaleString("pt-BR")} executadas`}
        />
        <EstatItem label="Dias de campo" valor={n?.dias_campo ?? "—"} sub="somando as turmas" />
        <EstatItem label="Municípios" valor={n?.municipios ?? "—"} sub="cobertos no mês" />
        <EstatItem
          label="Ocupação média"
          valor={`${pct}%`}
          tom={pct >= 70 ? "green" : pct >= 40 ? "amber" : "slate"}
          sub={`de ${dados?.periodo.dias_uteis ?? 0} dias úteis`}
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando…
        </div>
      ) : dados ? (
        <>
          <GanttTurmas
            periodo={dados.periodo}
            turmas={dados.turmas}
            onAbrir={(id) => router.push(`/operacao/carteira/${id}`)}
          />
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-blue-500" /> Publicada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-green-600" /> Concluída
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-px bg-red-400" /> Hoje
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-slate-100" /> Fim de semana
            </span>
            <span className="text-slate-400">Clique numa barra para abrir a carteira.</span>
          </div>
        </>
      ) : null}
    </div>
  )
}
