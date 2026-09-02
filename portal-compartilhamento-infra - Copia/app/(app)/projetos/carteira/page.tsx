"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Search, User, UserX } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/config"
import { useCurrentUser } from "@/hooks/use-current-user"
import type { AnalistaOpcao } from "@/components/comercial/atribuir-analise-modal"
import { AtribuirAnaliseProjetoModal, type AtribuirProjetoValues } from "@/components/projetos/atribuir-analise-projeto-modal"
import { EstatItem, StatusPill } from "@/components/projetos/projeto-ui"
import { type StatusProjeto } from "@/lib/types/projetos"

type ItemCarteira = {
  ID_PROJETO: number
  NUMERO_PROJETO: string
  TITULO: string | null
  RAZAO_SOCIAL: string
  NOME_FANTASIA: string | null
  CNPJ: string
  MUNICIPIO: string | null
  UF: string | null
  STATUS_PROJETO: StatusProjeto
  PRIORIDADE: string | null
  RESPONSAVEL_ANALISE: string | null
  PRAZO_ANALISE: string | null
  DATA_ATRIBUICAO: string | null
  DIAS_PARA_PRAZO: number | null
  SITUACAO_PRAZO: "ATRASADO" | "VENCENDO" | "EM_DIA" | "SEM_PRAZO"
  DOCS_VALIDADOS: number
  DOCS_OBRIGATORIOS: number
}

type SlaCarteira = {
  total_avaliados: number
  dentro_prazo: number
  fora_prazo: number
  taxa_cumprimento_sla: number
}

const SEM_RESPONSAVEL = ""

const CLASSE_PRAZO: Record<ItemCarteira["SITUACAO_PRAZO"], string> = {
  ATRASADO: "border-red-200 bg-red-50 text-red-700",
  VENCENDO: "border-amber-200 bg-amber-50 text-amber-700",
  EM_DIA: "border-slate-200 bg-slate-50 text-slate-600",
  SEM_PRAZO: "border-slate-200 bg-white text-slate-400",
}
const CLASSE_PRIORIDADE: Record<string, string> = {
  URGENTE: "bg-red-100 text-red-700",
  ALTA: "bg-orange-100 text-orange-700",
  MEDIA: "bg-amber-100 text-amber-700",
  BAIXA: "bg-slate-100 text-slate-600",
}

function labelPrazo(item: ItemCarteira) {
  if (item.DIAS_PARA_PRAZO === null || !item.PRAZO_ANALISE) return "Sem prazo"
  const data = new Date(`${item.PRAZO_ANALISE}T00:00:00`).toLocaleDateString("pt-BR")
  if (item.DIAS_PARA_PRAZO < 0) return `${data} · atrasado ${Math.abs(item.DIAS_PARA_PRAZO)}d`
  if (item.DIAS_PARA_PRAZO === 0) return `${data} · hoje`
  return `${data} · em ${item.DIAS_PARA_PRAZO}d`
}

export default function CarteiraAnaliseProjetosPage() {
  const router = useRouter()
  const { user } = useCurrentUser()

  const [itens, setItens] = useState<ItemCarteira[]>([])
  const [analistas, setAnalistas] = useState<AnalistaOpcao[]>([])
  const [slaDias, setSlaDias] = useState<Record<string, number>>({ URGENTE: 1, ALTA: 3, MEDIA: 7, BAIXA: 15 })
  const [slaCarteira, setSlaCarteira] = useState<SlaCarteira | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtroResponsavel, setFiltroResponsavel] = useState<string | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [itemEditando, setItemEditando] = useState<ItemCarteira | null>(null)

  const defaultAplicado = useRef(false)
  useEffect(() => {
    if (defaultAplicado.current || !user?.login) return
    defaultAplicado.current = true
    setFiltroResponsavel(user.login)
  }, [user])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [carteiraRes, analistasRes, slaRes, slaCartRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/projetos/carteira`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/projetos/analistas`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/projetos/sla`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/projetos/sla-carteira`, { cache: "no-store" }),
      ])
      if (!carteiraRes.ok) throw new Error(`Erro ${carteiraRes.status} ao carregar a carteira`)
      setItens(await carteiraRes.json())
      setAnalistas(analistasRes.ok ? await analistasRes.json() : [])
      if (slaRes.ok) {
        const sla = await slaRes.json()
        if (sla?.dias) setSlaDias(sla.dias)
      }
      setSlaCarteira(slaCartRes.ok ? await slaCartRes.json() : null)
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar a carteira" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    let lista = itens
    if (termo) {
      lista = lista.filter((i) =>
        [i.NUMERO_PROJETO, i.RAZAO_SOCIAL, i.NOME_FANTASIA, i.CNPJ]
          .map((v) => String(v ?? "").toLowerCase())
          .some((v) => v.includes(termo)),
      )
    }
    if (filtroResponsavel !== null) {
      lista = lista.filter((i) => (i.RESPONSAVEL_ANALISE?.trim() || SEM_RESPONSAVEL) === filtroResponsavel)
    }
    return lista
  }, [itens, busca, filtroResponsavel])

  const colunas = useMemo(() => {
    const grupos = new Map<string, ItemCarteira[]>()
    for (const item of itensFiltrados) {
      const chave = item.RESPONSAVEL_ANALISE?.trim() || SEM_RESPONSAVEL
      if (!grupos.has(chave)) grupos.set(chave, [])
      grupos.get(chave)!.push(item)
    }
    for (const lista of grupos.values()) {
      lista.sort((a, b) => String(a.PRAZO_ANALISE ?? "9999").localeCompare(String(b.PRAZO_ANALISE ?? "9999")))
    }
    const nomePorLogin = new Map(analistas.map((a) => [a.LOGIN, a.NOME || a.LOGIN]))
    return Array.from(grupos.entries())
      .map(([login, lista]) => ({
        login,
        nome: login === SEM_RESPONSAVEL ? "Não atribuído" : nomePorLogin.get(login) || login,
        itens: lista,
      }))
      .sort((a, b) => (a.login === SEM_RESPONSAVEL ? -1 : b.login === SEM_RESPONSAVEL ? 1 : a.nome.localeCompare(b.nome, "pt-BR")))
  }, [itensFiltrados, analistas])

  const naoAtribuidos = itens.filter((i) => !i.RESPONSAVEL_ANALISE?.trim()).length
  const atrasados = itens.filter((i) => i.SITUACAO_PRAZO === "ATRASADO").length
  const vencendo = itens.filter((i) => i.SITUACAO_PRAZO === "VENCENDO").length

  async function salvarAtribuicao(valores: AtribuirProjetoValues) {
    if (!itemEditando) return
    const res = await fetch(`${API_BASE_URL}/api/projetos/${itemEditando.ID_PROJETO}/atribuir`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responsavel: valores.responsavel || null,
        prazo: valores.prazo || null,
        usar_sla: valores.usar_sla,
        usuario: user?.login ?? "dev.local",
      }),
    })
    if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`)
    setNotification({ type: "success", message: "Atribuição salva." })
    await carregar()
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Carteira de Análise — Projetos"
        description="Fila de trabalho por analista e prazo, com SLA por prioridade."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Projetos", href: "/projetos" },
          { label: "Carteira de Análise" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
        <EstatItem label="Na fila" valor={loading ? "—" : itens.length} tom="primary" sub="projetos em análise" />
        <EstatItem label="Não atribuídos" valor={loading ? "—" : naoAtribuidos} tom={naoAtribuidos > 0 ? "amber" : "slate"} sub="sem responsável" />
        <EstatItem label="Atrasados" valor={loading ? "—" : atrasados} tom={atrasados > 0 ? "red" : "slate"} sub="prazo vencido" />
        <EstatItem label="Vencendo em breve" valor={loading ? "—" : vencendo} tom="amber" sub="prazo em até 2 dias" />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">SLA histórico</p>
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
          <EstatItem label="Avaliados" valor={slaCarteira ? slaCarteira.total_avaliados : "—"} sub="projetos encerrados com prazo" />
          <EstatItem label="Dentro do prazo" valor={slaCarteira ? slaCarteira.dentro_prazo : "—"} tom="green" sub="concluídos até o prazo" />
          <EstatItem label="Fora do prazo" valor={slaCarteira ? slaCarteira.fora_prazo : "—"} tom="red" sub="concluídos após o prazo" />
          <EstatItem label="Cumprimento" valor={slaCarteira ? `${slaCarteira.taxa_cumprimento_sla}%` : "—"} tom="primary" sub="taxa de SLA" />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {user?.login && (
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setFiltroResponsavel(user.login)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filtroResponsavel === user.login ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <User className="h-3.5 w-3.5" /> Minha fila
            </button>
            <button
              type="button"
              onClick={() => setFiltroResponsavel(SEM_RESPONSAVEL)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filtroResponsavel === SEM_RESPONSAVEL ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <UserX className="h-3.5 w-3.5" /> Não atribuídos
            </button>
            <button
              type="button"
              onClick={() => setFiltroResponsavel(null)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filtroResponsavel === null ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todos
            </button>
          </div>
        )}
        <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 lg:w-[340px]">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Nº do projeto, razão social, CNPJ..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando carteira...</p>
      ) : colunas.length === 0 ? (
        <EmptyState message="Nenhum projeto nesta visão." className="rounded-xl border border-slate-200 bg-white p-8" />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {colunas.map((coluna) => (
            <div key={coluna.login || "sem"} className="w-[320px] shrink-0">
              <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="truncate font-semibold text-slate-800" title={coluna.nome}>{coluna.nome}</span>
                <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {coluna.itens.length}
                </span>
              </div>

              <div className="space-y-3">
                {coluna.itens.map((item) => (
                  <div
                    key={item.ID_PROJETO}
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => router.push(`/projetos/${item.ID_PROJETO}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.NUMERO_PROJETO}</p>
                      {item.PRIORIDADE && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${CLASSE_PRIORIDADE[item.PRIORIDADE] ?? "bg-slate-100 text-slate-600"}`}>
                          {item.PRIORIDADE}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500" title={item.RAZAO_SOCIAL}>
                      {item.NOME_FANTASIA || item.RAZAO_SOCIAL}
                    </p>
                    <p className="text-xs text-slate-400">{item.MUNICIPIO}/{item.UF}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill status={item.STATUS_PROJETO} />
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_PRAZO[item.SITUACAO_PRAZO]}`}>
                        <CalendarClock className="h-3 w-3" />
                        {labelPrazo(item)}
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={(event) => { event.stopPropagation(); setItemEditando(item) }}
                    >
                      {item.RESPONSAVEL_ANALISE ? "Reatribuir" : "Atribuir"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AtribuirAnaliseProjetoModal
        open={itemEditando !== null}
        onOpenChange={(open) => { if (!open) setItemEditando(null) }}
        projeto={itemEditando}
        analistas={analistas}
        slaDias={slaDias}
        onSalvar={salvarAtribuicao}
      />
    </div>
  )
}
