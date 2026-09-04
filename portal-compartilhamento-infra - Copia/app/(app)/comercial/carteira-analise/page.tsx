"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Percent, PhoneCall, Search, Sparkles, User, UserX, XCircle } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AtribuirAnaliseModal,
  type AnalistaOpcao,
  type AtribuirAnaliseValues,
} from "@/components/comercial/atribuir-analise-modal"
import { API_BASE_URL } from "@/lib/config"
import { statusClass, statusLabel } from "@/hooks/use-lista-entrantes"
import { useCurrentUser } from "@/hooks/use-current-user"
import { FASES, type FaseConfig } from "@/lib/comercial/fases-carteira"
import { GerarCarteiraModal } from "@/components/comercial/gerar-carteira-modal"

// Formato comum que os cards/colunas do kanban consomem, independente da
// fase de origem (entrante, etapa do processo, ou fila de contato).
type ItemCarteira = {
  id: number
  titulo: string
  subtitulo: string
  municipio: string | null
  statusLabel: string | null
  statusClass: string
  responsavel: string | null
  prazo: string | null
  prioridade: string | null
  linkDetalhe: string
}

type MetricasContato = {
  total_contatos: number
  respondidos: number
  sem_resposta: number
  aguardando: number
  taxa_contato: number
}

type SlaHistorico = {
  total_avaliados: number
  dentro_prazo: number
  fora_prazo: number
  taxa_cumprimento_sla: number
}

const SEM_RESPONSAVEL = ""
const FILTRO_TODOS = "__todos__"
const FILTRO_NAO_ATRIBUIDO = "__nao_atribuido__"

function formatarCnpj(valor?: string | null) {
  const digitos = String(valor ?? "").replace(/\D/g, "")
  if (digitos.length !== 14) return valor ?? "-"
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
}

function formatarDataCurta(valor?: string | null) {
  if (!valor) return null
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return null
  return data.toLocaleDateString("pt-BR")
}

function formatarPrazo(prazo?: string | null) {
  if (!prazo) return null

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const data = new Date(`${prazo}T00:00:00`)
  if (Number.isNaN(data.getTime())) return null

  const diffDias = Math.round((data.getTime() - hoje.getTime()) / 86400000)
  const label = data.toLocaleDateString("pt-BR")

  if (diffDias < 0) {
    return { label: `${label} · atrasado ${Math.abs(diffDias)}d`, className: "bg-red-100 text-red-700 border-red-200", atrasado: true }
  }
  if (diffDias <= 3) {
    return { label: `${label} · em ${diffDias}d`, className: "bg-amber-100 text-amber-700 border-amber-200", atrasado: false }
  }
  return { label, className: "bg-slate-100 text-slate-600 border-slate-200", atrasado: false }
}

type SituacaoPrazo = "ATRASADO" | "VENCENDO" | "DENTRO_PRAZO" | "SEM_PRAZO"

// Mesmo corte usado em formatarPrazo (atrasado / vencendo em até 3 dias /
// dentro do prazo), como uma categoria só — para poder filtrar por ela.
function situacaoPrazoItem(prazo: string | null): SituacaoPrazo {
  if (!prazo) return "SEM_PRAZO"
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const data = new Date(`${prazo}T00:00:00`)
  if (Number.isNaN(data.getTime())) return "SEM_PRAZO"
  const diffDias = Math.round((data.getTime() - hoje.getTime()) / 86400000)
  if (diffDias < 0) return "ATRASADO"
  if (diffDias <= 3) return "VENCENDO"
  return "DENTRO_PRAZO"
}

type FiltroPrazo = "TODOS" | "ATRASADOS" | "VENCENDO" | "DENTRO_PRAZO" | "FORA_PRAZO"

// "Atrasados" e "Fora do Prazo" são o mesmo estado (prazo já vencido) —
// dois rótulos para o mesmo filtro, como pedido.
function bateFiltroPrazo(filtro: FiltroPrazo, situacao: SituacaoPrazo): boolean {
  if (filtro === "TODOS") return true
  if (filtro === "ATRASADOS" || filtro === "FORA_PRAZO") return situacao === "ATRASADO"
  if (filtro === "VENCENDO") return situacao === "VENCENDO"
  return situacao === "DENTRO_PRAZO"
}

// PRIORIDADE é texto livre no banco (sem vocabulário fixo) - só colorimos os
// valores mais comuns que já aparecem nos formulários de cadastro; qualquer
// outro texto cai no estilo neutro.
function classeBadgePrioridade(prioridade: string) {
  const valor = prioridade.trim().toLowerCase()
  if (["alta", "urgente", "crítica", "critica"].includes(valor)) {
    return "bg-red-100 text-red-700 border-red-200"
  }
  if (["média", "media"].includes(valor)) {
    return "bg-amber-100 text-amber-700 border-amber-200"
  }
  if (["baixa"].includes(valor)) {
    return "bg-slate-100 text-slate-600 border-slate-200"
  }
  return "bg-blue-100 text-blue-700 border-blue-200"
}

function normalizarEntrante(item: any): ItemCarteira {
  return {
    id: item.ID_ENTRADA,
    titulo: item.RAZAO_SOCIAL ?? "-",
    subtitulo: formatarCnpj(item.CNPJ),
    municipio: item.MUNICIPIO ? `${item.MUNICIPIO}${item.UF ? `/${item.UF}` : ""}` : null,
    statusLabel: statusLabel(item.STATUS_ENTRADA),
    statusClass: statusClass(item.STATUS_ENTRADA),
    responsavel: item.RESPONSAVEL_ANALISE,
    prazo: item.PRAZO_ANALISE,
    prioridade: item.PRIORIDADE,
    linkDetalhe: `/comercial/novosentrantes/${item.ID_ENTRADA}`,
  }
}

function normalizarEtapa(item: any): ItemCarteira {
  return {
    id: item.ID_PROCESSO,
    titulo: item.RAZAO_SOCIAL ?? "-",
    subtitulo: item.NUMERO_PROTOCOLO ?? formatarCnpj(item.CNPJ),
    municipio: item.MUNICIPIO,
    statusLabel: item.NOME_ETAPA_ATUAL,
    statusClass: "bg-blue-100 text-blue-700 border-blue-200",
    responsavel: item.RESPONSAVEL_ETAPA,
    prazo: item.PRAZO_ETAPA,
    prioridade: item.PRIORIDADE,
    linkDetalhe: `/comercial/processos/${item.ID_PROCESSO}`,
  }
}

function normalizarContato(item: any): ItemCarteira {
  const ultimoContato = formatarDataCurta(item.ULTIMO_CONTATO_EM)
  return {
    id: item.ID_PROCESSO,
    titulo: item.RAZAO_SOCIAL ?? "-",
    subtitulo: item.NUMERO_PROTOCOLO ?? formatarCnpj(item.CNPJ),
    municipio: item.MUNICIPIO,
    statusLabel: ultimoContato ? `Último contato: ${ultimoContato}` : "Sem contato registrado",
    statusClass: ultimoContato
      ? "bg-slate-100 text-slate-600 border-slate-200"
      : "bg-orange-100 text-orange-700 border-orange-200",
    responsavel: item.RESPONSAVEL_CONTATO,
    prazo: item.PRAZO_CONTATO,
    prioridade: item.PRIORIDADE,
    linkDetalhe: `/comercial/processos/${item.ID_PROCESSO}`,
  }
}

export default function CarteiraAnalisePage() {
  const router = useRouter()
  const { user } = useCurrentUser()

  const [faseId, setFaseId] = useState(FASES[0].id)
  const [itens, setItens] = useState<ItemCarteira[]>([])
  const [analistas, setAnalistas] = useState<AnalistaOpcao[]>([])
  const [metricasContato, setMetricasContato] = useState<MetricasContato | null>(null)
  const [slaHistorico, setSlaHistorico] = useState<SlaHistorico | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtroResponsavel, setFiltroResponsavel] = useState<string | null>(null)
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>("TODOS")
  const [notification, setNotification] = useState<Notification | null>(null)
  const [itemEditando, setItemEditando] = useState<ItemCarteira | null>(null)
  const [modalGerarAberto, setModalGerarAberto] = useState(false)

  // Ao abrir a página, cai direto na fila do usuário logado (em vez de
  // "Todos") - é o caso de uso do dia a dia; o analista troca pra "Todos"
  // quando quiser visão geral. Só aplica esse default uma vez, pra não
  // sobrescrever se o usuário trocar manualmente pra "Todos" depois.
  const defaultAplicadoRef = useRef(false)
  useEffect(() => {
    if (defaultAplicadoRef.current || !user?.login) return
    defaultAplicadoRef.current = true
    setFiltroResponsavel(user.login)
  }, [user])

  const fase = useMemo(() => FASES.find((item) => item.id === faseId) ?? FASES[0], [faseId])

  async function carregar(faseAtual: FaseConfig) {
    setLoading(true)
    try {
      const urlItens =
        faseAtual.tipo === "entrante"
          ? `${API_BASE_URL}/api/novos-entrantes/carteira`
          : faseAtual.tipo === "etapa"
            ? `${API_BASE_URL}/api/processos/carteira?etapa_id=${faseAtual.etapaId}`
            : `${API_BASE_URL}/api/processos/carteira-contato`

      const [itensResp, analistasResp] = await Promise.all([
        fetch(urlItens, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/novos-entrantes/analistas`, { cache: "no-store" }),
      ])

      if (!itensResp.ok) throw new Error(`Erro ${itensResp.status} ao carregar a carteira`)
      if (!analistasResp.ok) throw new Error(`Erro ${analistasResp.status} ao carregar analistas`)

      const itensBrutos = await itensResp.json()
      setAnalistas(await analistasResp.json())

      const normalizador =
        faseAtual.tipo === "entrante" ? normalizarEntrante : faseAtual.tipo === "etapa" ? normalizarEtapa : normalizarContato
      setItens((Array.isArray(itensBrutos) ? itensBrutos : []).map(normalizador))

      if (faseAtual.tipo === "contato") {
        const metricasResp = await fetch(`${API_BASE_URL}/api/processos/metricas-contato`, { cache: "no-store" })
        setMetricasContato(metricasResp.ok ? await metricasResp.json() : null)
      } else {
        setMetricasContato(null)
      }

      const urlSla =
        faseAtual.tipo === "entrante"
          ? `${API_BASE_URL}/api/novos-entrantes/sla-analise`
          : faseAtual.tipo === "etapa"
            ? `${API_BASE_URL}/api/processos/sla-etapa?etapa_id=${faseAtual.etapaId}`
            : `${API_BASE_URL}/api/processos/sla-contato`
      const slaResp = await fetch(urlSla, { cache: "no-store" })
      setSlaHistorico(slaResp.ok ? await slaResp.json() : null)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar a carteira de análise",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar(fase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faseId])

  const opcoesResponsavel = useMemo(
    () =>
      analistas
        .map((a) => ({ login: a.LOGIN, nome: a.NOME || a.LOGIN }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [analistas],
  )

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    let resultado = itens

    if (termo) {
      resultado = resultado.filter((item) =>
        [item.titulo, item.subtitulo].map((valor) => String(valor ?? "").toLowerCase()).some((valor) => valor.includes(termo)),
      )
    }

    if (filtroResponsavel !== null) {
      resultado = resultado.filter((item) => (item.responsavel?.trim() || SEM_RESPONSAVEL) === filtroResponsavel)
    }

    if (filtroPrazo !== "TODOS") {
      resultado = resultado.filter((item) => bateFiltroPrazo(filtroPrazo, situacaoPrazoItem(item.prazo)))
    }

    return resultado
  }, [itens, busca, filtroResponsavel, filtroPrazo])

  const colunas = useMemo(() => {
    const grupos = new Map<string, ItemCarteira[]>()

    for (const item of itensFiltrados) {
      const chave = item.responsavel?.trim() || SEM_RESPONSAVEL
      const lista = grupos.get(chave) ?? []
      lista.push(item)
      grupos.set(chave, lista)
    }

    for (const lista of grupos.values()) {
      lista.sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0
        if (!a.prazo) return 1
        if (!b.prazo) return -1
        return a.prazo.localeCompare(b.prazo)
      })
    }

    const nomePorLogin = new Map(analistas.map((a) => [a.LOGIN, a.NOME || a.LOGIN]))

    const entradas = Array.from(grupos.entries()).map(([login, lista]) => ({
      login,
      nome: login === SEM_RESPONSAVEL ? "Não atribuído" : nomePorLogin.get(login) || login,
      itens: lista,
    }))

    entradas.sort((a, b) => {
      if (a.login === SEM_RESPONSAVEL) return -1
      if (b.login === SEM_RESPONSAVEL) return 1
      return a.nome.localeCompare(b.nome, "pt-BR")
    })

    return entradas
  }, [itensFiltrados, analistas])

  const totalNaoAtribuidos = useMemo(() => itens.filter((item) => !item.responsavel?.trim()).length, [itens])

  const totalAtrasados = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    return itens.filter((item) => {
      if (!item.prazo) return false
      const data = new Date(`${item.prazo}T00:00:00`)
      return !Number.isNaN(data.getTime()) && data.getTime() < hoje.getTime()
    }).length
  }, [itens])

  const totalVencendoEmBreve = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    return itens.filter((item) => {
      if (!item.prazo) return false
      const data = new Date(`${item.prazo}T00:00:00`)
      if (Number.isNaN(data.getTime())) return false
      const diffDias = Math.round((data.getTime() - hoje.getTime()) / 86400000)
      return diffDias >= 0 && diffDias <= 3
    }).length
  }, [itens])

  // Contagem por situação de prazo, para os badges do filtro logo abaixo.
  const contagemPrazo = useMemo(() => {
    const c = { total: itens.length, atrasado: 0, vencendo: 0, dentroPrazo: 0, semPrazo: 0 }
    for (const item of itens) {
      const situacao = situacaoPrazoItem(item.prazo)
      if (situacao === "ATRASADO") c.atrasado++
      else if (situacao === "VENCENDO") c.vencendo++
      else if (situacao === "DENTRO_PRAZO") c.dentroPrazo++
      else c.semPrazo++
    }
    return c
  }, [itens])

  async function salvarAtribuicao(valores: AtribuirAnaliseValues) {
    if (!itemEditando) return

    const url =
      fase.tipo === "entrante"
        ? `${API_BASE_URL}/api/novos-entrantes/entrada/${itemEditando.id}/atribuir`
        : fase.tipo === "etapa"
          ? `${API_BASE_URL}/api/processos/${itemEditando.id}/jornada/atribuir`
          : `${API_BASE_URL}/api/processos/${itemEditando.id}/atribuir-contato`

    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responsavel: valores.responsavel || null,
        prazo: valores.prazo || null,
      }),
    })

    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }

    setNotification({ type: "success", message: "Atribuição salva com sucesso!" })
    await carregar(fase)
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title={`Carteira de Análise — ${fase.label}`}
        description="Fila de trabalho organizada por responsável e prazo, fase a fase da jornada."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Carteira de Análise" },
        ]}
        actions={
          <Button type="button" onClick={() => setModalGerarAberto(true)}>
            <Sparkles className="h-4 w-4" />
            Gerar carteira automática
          </Button>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="w-full md:w-[320px]">
        <Select value={faseId} onValueChange={(v) => v !== null && setFaseId(v)}>
          <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FASES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${fase.tipo === "contato" ? "2xl:grid-cols-5" : ""}`}>
        <KpiCard
          title="Na Fila"
          value={loading ? "…" : String(itens.length)}
          subtitle="Itens ativos nesta fase"
          icon={ListChecks}
          color="text-primary"
        />
        <KpiCard
          title="Não Atribuídos"
          value={loading ? "…" : String(totalNaoAtribuidos)}
          subtitle="Sem responsável definido"
          icon={UserX}
          color="text-orange-600"
        />
        <KpiCard
          title="Atrasados"
          value={loading ? "…" : String(totalAtrasados)}
          subtitle="Prazo já vencido"
          icon={AlertTriangle}
          color="text-red-600"
        />
        <KpiCard
          title="Vencendo em Breve"
          value={loading ? "…" : String(totalVencendoEmBreve)}
          subtitle="Prazo nos próximos 3 dias"
          icon={Clock}
          color="text-amber-600"
        />
        {fase.tipo === "contato" && (
          <KpiCard
            title="Taxa de Contato"
            value={metricasContato ? `${metricasContato.taxa_contato}%` : "…"}
            subtitle={
              metricasContato
                ? `${metricasContato.respondidos} respondido(s) de ${metricasContato.respondidos + metricasContato.sem_resposta} resolvido(s)`
                : "Carregando..."
            }
            icon={PhoneCall}
            color="text-green-600"
          />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Taxa histórica de SLA — {fase.label}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Avaliados"
            value={slaHistorico ? String(slaHistorico.total_avaliados) : "…"}
            subtitle="Itens resolvidos com prazo atribuído"
            icon={ListChecks}
            color="text-primary"
          />
          <KpiCard
            title="Dentro do Prazo"
            value={slaHistorico ? String(slaHistorico.dentro_prazo) : "…"}
            subtitle="Resolvidos até o prazo"
            icon={CheckCircle2}
            color="text-green-600"
          />
          <KpiCard
            title="Fora do Prazo"
            value={slaHistorico ? String(slaHistorico.fora_prazo) : "…"}
            subtitle="Resolvidos após o prazo"
            icon={XCircle}
            color="text-red-600"
          />
          <KpiCard
            title="Cumprimento de SLA"
            value={slaHistorico ? `${slaHistorico.taxa_cumprimento_sla}%` : "…"}
            subtitle={slaHistorico && slaHistorico.total_avaliados === 0 ? "Sem itens resolvidos ainda" : "Taxa histórica"}
            icon={Percent}
            color="text-blue-600"
          />
        </div>
      </div>

      {user?.login && (
        <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setFiltroResponsavel(user.login)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filtroResponsavel === user.login ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Minha fila
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

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 md:w-[380px]">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            placeholder="Pesquisar razão social, CNPJ ou protocolo..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="w-full md:w-[240px]">
          <Select
            value={filtroResponsavel === null ? FILTRO_TODOS : filtroResponsavel === SEM_RESPONSAVEL ? FILTRO_NAO_ATRIBUIDO : filtroResponsavel}
            onValueChange={(v) => {
              if (v === null || v === FILTRO_TODOS) setFiltroResponsavel(null)
              else if (v === FILTRO_NAO_ATRIBUIDO) setFiltroResponsavel(SEM_RESPONSAVEL)
              else setFiltroResponsavel(v)
            }}
          >
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Filtrar por responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODOS}>Todos os responsáveis</SelectItem>
              <SelectItem value={FILTRO_NAO_ATRIBUIDO}>Não atribuído</SelectItem>
              {opcoesResponsavel.map((opcao) => (
                <SelectItem key={opcao.login} value={opcao.login}>{opcao.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {(
          [
            ["TODOS", "Todos", contagemPrazo.total],
            ["ATRASADOS", "Atrasados", contagemPrazo.atrasado],
            ["VENCENDO", "Vencendo em Breve", contagemPrazo.vencendo],
            ["DENTRO_PRAZO", "Dentro do Prazo", contagemPrazo.dentroPrazo],
            ["FORA_PRAZO", "Fora do Prazo", contagemPrazo.atrasado],
          ] as [FiltroPrazo, string, number][]
        ).map(([valor, rotulo, contagem]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFiltroPrazo(valor)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filtroPrazo === valor ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {rotulo}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                filtroPrazo === valor ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {contagem}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Carregando carteira de análise...
        </div>
      )}

      {!loading && colunas.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <EmptyState message="Nenhum item nesta fase no momento." />
        </div>
      )}

      {!loading && colunas.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {colunas.map((coluna) => (
            <div key={coluna.login || "sem-responsavel"} className="w-[300px] shrink-0">
              <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="truncate font-semibold text-slate-800" title={coluna.nome}>
                  {coluna.nome}
                </span>
                <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {coluna.itens.length}
                </span>
              </div>

              <div className="space-y-3">
                {coluna.itens.map((item) => {
                  const prazo = formatarPrazo(item.prazo)

                  return (
                    <div
                      key={item.id}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      onClick={() => router.push(item.linkDetalhe)}
                    >
                      <p className="truncate text-sm font-semibold text-slate-900" title={item.titulo}>
                        {item.titulo}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.subtitulo}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.municipio ?? "Município não informado"}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {item.prioridade && item.prioridade.trim() && (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classeBadgePrioridade(item.prioridade)}`}>
                            {item.prioridade}
                          </span>
                        )}
                        {item.statusLabel && (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${item.statusClass}`}>
                            {item.statusLabel}
                          </span>
                        )}
                        {prazo ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${prazo.className}`}>
                            <Clock className="h-3 w-3" />
                            {prazo.label}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Sem prazo
                          </span>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={(event) => {
                          event.stopPropagation()
                          setItemEditando(item)
                        }}
                      >
                        {item.responsavel ? "Reatribuir" : "Atribuir"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AtribuirAnaliseModal
        open={itemEditando !== null}
        onOpenChange={(open) => {
          if (!open) setItemEditando(null)
        }}
        titulo={itemEditando ? `Atribuir — ${itemEditando.titulo}` : "Atribuir"}
        analistas={analistas}
        valoresIniciais={{
          responsavel: itemEditando?.responsavel ?? "",
          prazo: itemEditando?.prazo ?? "",
        }}
        onSalvar={salvarAtribuicao}
      />

      <GerarCarteiraModal
        open={modalGerarAberto}
        onOpenChange={setModalGerarAberto}
        faseInicialId={faseId}
        onGerado={() => carregar(fase)}
      />
    </div>
  )
}
