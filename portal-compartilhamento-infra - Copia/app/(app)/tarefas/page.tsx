"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, ChevronRight, ListTodo } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EstatItem } from "@/components/projetos/projeto-ui"
import { API_BASE_URL } from "@/lib/config"
import { useCurrentUser } from "@/hooks/use-current-user"
import {
  CLASSE_SITUACAO_PRAZO,
  LABEL_TIPO_TAREFA,
  PONTO_SITUACAO_PRAZO,
  rotuloPrazo,
  type ResumoTarefas,
  type Tarefa,
} from "@/lib/types/tarefas"

type Escopo = "minhas" | "sem" | "todas"

const CLASSE_PRIORIDADE: Record<string, string> = {
  URGENTE: "bg-red-100 text-red-700 border-red-200",
  ALTA: "bg-orange-100 text-orange-700 border-orange-200",
  MEDIA: "bg-amber-100 text-amber-700 border-amber-200",
  BAIXA: "bg-slate-100 text-slate-600 border-slate-200",
}

export default function CaixaDeTarefasPage() {
  const router = useRouter()
  const { user } = useCurrentUser()

  const [escopo, setEscopo] = useState<Escopo>("minhas")
  const [moduloFiltro, setModuloFiltro] = useState<string | null>(null)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [resumo, setResumo] = useState<ResumoTarefas | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)

  const paramResponsavel = useMemo(() => {
    if (escopo === "sem") return "__sem__"
    if (escopo === "minhas") return user?.login ?? ""
    return ""
  }, [escopo, user?.login])

  const carregar = useCallback(async () => {
    // "Minhas" sem usuário resolvido ainda: espera o login carregar.
    if (escopo === "minhas" && !user?.login) return
    setLoading(true)
    try {
      const qs = paramResponsavel ? `?responsavel=${encodeURIComponent(paramResponsavel)}` : ""
      const [tarefasRes, resumoRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/tarefas${qs}`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/tarefas/resumo${qs}`, { cache: "no-store" }),
      ])
      if (!tarefasRes.ok) throw new Error(`Erro ${tarefasRes.status} ao carregar as tarefas`)
      setTarefas(await tarefasRes.json())
      setResumo(resumoRes.ok ? await resumoRes.json() : null)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar a caixa de tarefas",
      })
    } finally {
      setLoading(false)
    }
  }, [escopo, paramResponsavel, user?.login])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const modulos = useMemo(
    () => Object.keys(resumo?.por_modulo ?? {}).sort(),
    [resumo],
  )

  const filtradas = useMemo(
    () => (moduloFiltro ? tarefas.filter((t) => t.MODULO === moduloFiltro) : tarefas),
    [tarefas, moduloFiltro],
  )

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Caixa de Tarefas"
        description="Tudo o que está esperando por você — análises, atribuições, triagens e ações — reunido de todos os módulos."
        breadcrumbs={[{ label: "Início", href: "/" }, { label: "Caixa de Tarefas" }]}
      />

      <NotificationBanner notification={notification} />

      {/* Indicadores */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
        <EstatItem label="Tarefas" valor={resumo ? resumo.total : "—"} tom="primary" sub="no escopo atual" />
        <EstatItem
          label="Atrasadas"
          valor={resumo ? resumo.atrasadas : "—"}
          tom={resumo && resumo.atrasadas > 0 ? "red" : "slate"}
          sub="prazo vencido"
        />
        <EstatItem
          label="Vencendo"
          valor={resumo ? resumo.vencendo : "—"}
          tom={resumo && resumo.vencendo > 0 ? "amber" : "slate"}
          sub="até 2 dias"
        />
        <EstatItem label="Sem prazo" valor={resumo ? resumo.sem_prazo : "—"} sub="triagem / execução" />
      </div>

      {/* Escopo + filtro por módulo */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {([
            ["minhas", "Minhas"],
            ["sem", "Não atribuídas"],
            ["todas", "Todas"],
          ] as [Escopo, string][]).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setEscopo(valor)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                escopo === valor ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {modulos.length > 0 && (
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setModuloFiltro(null)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                moduloFiltro === null ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Todos os módulos
            </button>
            {modulos.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModuloFiltro(m)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  moduloFiltro === m ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {m} · {resumo?.por_modulo[m] ?? 0}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Carregando...</p>
        ) : filtradas.length === 0 ? (
          <EmptyState message="Nenhuma tarefa por aqui. Bom trabalho." className="m-4" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtradas.map((t) => (
              <li key={t.ID}>
                <button
                  type="button"
                  onClick={() => router.push(t.LINK)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO_SITUACAO_PRAZO[t.SITUACAO_PRAZO]}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{t.TITULO}</span>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {LABEL_TIPO_TAREFA[t.TIPO]}
                      </span>
                      {t.PRIORIDADE && (
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                            CLASSE_PRIORIDADE[t.PRIORIDADE] ?? "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {t.PRIORIDADE}
                        </span>
                      )}
                    </div>
                    {t.DESCRICAO && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{t.DESCRICAO}</p>
                    )}
                  </div>

                  <div className="hidden shrink-0 sm:block">
                    <span className="text-[11px] font-medium text-slate-400">{t.MODULO}</span>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_SITUACAO_PRAZO[t.SITUACAO_PRAZO]}`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {rotuloPrazo(t)}
                  </span>

                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && filtradas.length > 0 && (
          <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <ListTodo className="h-3.5 w-3.5" />
            {filtradas.length} tarefa{filtradas.length === 1 ? "" : "s"}
            {moduloFiltro ? ` · ${moduloFiltro}` : ""}
          </div>
        )}
      </div>
    </div>
  )
}
