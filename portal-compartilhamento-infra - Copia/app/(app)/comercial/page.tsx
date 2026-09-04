"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Percent,
  UserPlus,
} from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
import { SecaoCard } from "@/components/projetos/projeto-ui"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { apiFetch } from "@/lib/config"
import {
  FunilJornada,
  DonutStatusEntrantes,
  BarrasEtapa,
  LinhaEvolucao,
  BarrasSla,
  CORES_STATUS_ENTRADA,
  type EtapaFunil,
} from "@/components/comercial/graficos-visao-geral"

type EntradaBruta = {
  ID_ENTRADA: number
  DATA_RECEBIMENTO: string | null
  STATUS_ENTRADA: string
  ID_PROCESSO: number | null
}
type ProcessoBruto = {
  ID_PROCESSO: number
  STATUS_ATUAL: string
  NOME_ETAPA_ATUAL: string | null
  DT_ABERTURA: string | null
}
type SlaResposta = { total_avaliados: number; dentro_prazo: number; fora_prazo: number; taxa_cumprimento_sla: number }

const LABEL_ETAPA: Record<string, string> = {
  "ANALISE CADASTRAL": "Análise Cadastral",
  DOCUMENTACAO: "Documentação",
  APROVACAO: "Aprovação",
  CONTRATACAO: "Contratação",
}
const ORDEM_ETAPA = ["ANALISE CADASTRAL", "DOCUMENTACAO", "APROVACAO", "CONTRATACAO"]
const STATUS_ENCERRADO_PROCESSO = new Set(["CONCLUIDO", "CANCELADO"])

function chaveMes(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function rotuloMes(chave: string) {
  const [ano, mes] = chave.split("-").map(Number)
  const d = new Date(ano, mes - 1, 1)
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")
}
function ultimosNMeses(n: number) {
  const chaves: string[] = []
  const hoje = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return chaves
}

export default function ComercialPage() {
  const [entrantes, setEntrantes] = useState<EntradaBruta[]>([])
  const [processos, setProcessos] = useState<ProcessoBruto[]>([])
  const [totalProvedores, setTotalProvedores] = useState<number | null>(null)
  const [slaEntrante, setSlaEntrante] = useState<SlaResposta | null>(null)
  const [slaEtapa, setSlaEtapa] = useState<SlaResposta | null>(null)
  const [slaContato, setSlaContato] = useState<SlaResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)

  useEffect(() => {
    let cancelado = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([
      apiFetch("/api/novos-entrantes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/processos", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/provedores", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/novos-entrantes/sla-analise", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      apiFetch("/api/processos/sla-etapa", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      apiFetch("/api/processos/sla-contato", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([en, pr, prov, sEnt, sEtp, sCont]) => {
        if (cancelado) return
        setEntrantes(Array.isArray(en) ? en : [])
        setProcessos(Array.isArray(pr) ? pr : [])
        setTotalProvedores(Array.isArray(prov) ? prov.length : 0)
        setSlaEntrante(sEnt)
        setSlaEtapa(sEtp)
        setSlaContato(sCont)
      })
      .catch(() =>
        setNotification({ type: "error", message: "Erro ao carregar a visão geral comercial" }),
      )
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  // ---- KPIs de jornada ----
  const emAbertoEntrantes = useMemo(
    () => entrantes.filter((e) => e.STATUS_ENTRADA === "NOVO" || e.STATUS_ENTRADA === "ANALISADO").length,
    [entrantes],
  )
  const processosEmAndamento = useMemo(
    () => processos.filter((p) => !STATUS_ENCERRADO_PROCESSO.has(p.STATUS_ATUAL)).length,
    [processos],
  )
  const processosConcluidos = useMemo(() => processos.filter((p) => p.STATUS_ATUAL === "CONCLUIDO").length, [processos])

  const slaCombinado = useMemo(() => {
    const partes = [slaEntrante, slaEtapa, slaContato].filter((s): s is SlaResposta => s !== null)
    const avaliados = partes.reduce((s, p) => s + p.total_avaliados, 0)
    const dentro = partes.reduce((s, p) => s + p.dentro_prazo, 0)
    return avaliados ? Math.round((dentro / avaliados) * 1000) / 10 : null
  }, [slaEntrante, slaEtapa, slaContato])

  // ---- Funil da jornada (sempre monotônico: cada estágio é subconjunto do anterior) ----
  const funil = useMemo<EtapaFunil[]>(() => {
    const analisados = entrantes.filter((e) => ["ANALISADO", "PROVEDOR_CRIADO", "PROCESSO_CRIADO"].includes(e.STATUS_ENTRADA))
    const provedorCriado = analisados.filter((e) => ["PROVEDOR_CRIADO", "PROCESSO_CRIADO"].includes(e.STATUS_ENTRADA))
    const processoCriado = provedorCriado.filter((e) => e.STATUS_ENTRADA === "PROCESSO_CRIADO")
    const idsProcessoConcluido = new Set(processos.filter((p) => p.STATUS_ATUAL === "CONCLUIDO").map((p) => p.ID_PROCESSO))
    const concluidos = processoCriado.filter((e) => e.ID_PROCESSO != null && idsProcessoConcluido.has(e.ID_PROCESSO))
    return [
      { name: "Entrantes recebidos", value: entrantes.length },
      { name: "Analisados", value: analisados.length },
      { name: "Provedor criado", value: provedorCriado.length },
      { name: "Processo criado", value: processoCriado.length },
      { name: "Processo concluído", value: concluidos.length },
    ]
  }, [entrantes, processos])

  // ---- Entrantes por status (donut) ----
  const donutEntrantes = useMemo(() => {
    const LABEL: Record<string, string> = {
      NOVO: "Novo",
      ANALISADO: "Analisado",
      PROVEDOR_CRIADO: "Provedor criado",
      PROCESSO_CRIADO: "Processo criado",
      DESCARTADO: "Descartado",
    }
    const contagem = new Map<string, number>()
    for (const e of entrantes) contagem.set(e.STATUS_ENTRADA, (contagem.get(e.STATUS_ENTRADA) ?? 0) + 1)
    return Object.entries(LABEL)
      .map(([codigo, nome]) => ({ name: nome, value: contagem.get(codigo) ?? 0, cor: CORES_STATUS_ENTRADA[nome] }))
      .filter((d) => d.value > 0)
  }, [entrantes])

  // ---- Processos em aberto por etapa ----
  const barrasEtapa = useMemo(() => {
    const abertos = processos.filter((p) => !STATUS_ENCERRADO_PROCESSO.has(p.STATUS_ATUAL))
    const contagem = new Map<string, number>()
    for (const p of abertos) {
      const chave = (p.NOME_ETAPA_ATUAL || "").toUpperCase().trim()
      if (chave) contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
    }
    return ORDEM_ETAPA.map((codigo) => ({ etapa: LABEL_ETAPA[codigo], qtd: contagem.get(codigo) ?? 0 }))
  }, [processos])

  // ---- Evolução mensal (últimos 6 meses) ----
  const evolucaoMensal = useMemo(() => {
    const meses = ultimosNMeses(6)
    const porMesEntrantes = new Map<string, number>()
    for (const e of entrantes) {
      const k = chaveMes(e.DATA_RECEBIMENTO)
      if (k) porMesEntrantes.set(k, (porMesEntrantes.get(k) ?? 0) + 1)
    }
    const porMesProcessos = new Map<string, number>()
    for (const p of processos) {
      const k = chaveMes(p.DT_ABERTURA)
      if (k) porMesProcessos.set(k, (porMesProcessos.get(k) ?? 0) + 1)
    }
    return meses.map((k) => ({
      mes: rotuloMes(k),
      entrantes: porMesEntrantes.get(k) ?? 0,
      processos: porMesProcessos.get(k) ?? 0,
    }))
  }, [entrantes, processos])

  // ---- SLA por fase ----
  const barrasSla = useMemo(
    () =>
      [
        ["Análise de Entrante", slaEntrante],
        ["Etapas do Processo", slaEtapa],
        ["Contato com Provedor", slaContato],
      ] as [string, SlaResposta | null][],
    [slaEntrante, slaEtapa, slaContato],
  ).filter(([, s]) => s !== null).map(([fase, s]) => ({ fase, taxa: s!.taxa_cumprimento_sla, avaliados: s!.total_avaliados }))

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Comercial"
        description="Visão geral do processo comercial: jornada de entrantes, processos e cumprimento de SLA."
        breadcrumbs={[{ label: "Início", href: "/" }, { label: "Comercial" }]}
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Inbox} title="Entrantes na Fila" value={loading ? "…" : emAbertoEntrantes} subtitle="Novos + em análise" color="text-blue-600" />
        <KpiCard icon={UserPlus} title="Entrantes Recebidos" value={loading ? "…" : entrantes.length} subtitle="Total no período" color="text-indigo-600" />
        <KpiCard icon={ClipboardCheck} title="Processos em Andamento" value={loading ? "…" : processosEmAndamento} subtitle="Abertos ou em andamento" color="text-primary" />
        <KpiCard icon={CheckCircle2} title="Processos Concluídos" value={loading ? "…" : processosConcluidos} subtitle="Jornada finalizada" color="text-green-600" />
        <KpiCard icon={Building2} title="Provedores com Contrato" value={loading ? "…" : (totalProvedores ?? "…")} subtitle="Processo concluído" color="text-teal-600" />
        <KpiCard
          icon={Percent}
          title="SLA Combinado"
          value={loading || slaCombinado === null ? "…" : `${slaCombinado}%`}
          subtitle="Entrante + etapas + contato"
          color={slaCombinado === null ? "text-slate-400" : slaCombinado >= 80 ? "text-green-600" : slaCombinado >= 50 ? "text-amber-600" : "text-red-600"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SecaoCard titulo="Funil da jornada comercial" descricao="Do recebimento do entrante até o processo concluído.">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Carregando...</div>
          ) : (
            <FunilJornada etapas={funil} />
          )}
        </SecaoCard>

        <SecaoCard titulo="Evolução mensal" descricao="Entrantes recebidos x processos abertos, últimos 6 meses.">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Carregando...</div>
          ) : (
            <LinhaEvolucao dados={evolucaoMensal} />
          )}
        </SecaoCard>

        <SecaoCard titulo="Entrantes por status" descricao="Distribuição da fila de recebimento.">
          {loading ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">Carregando...</div>
          ) : donutEntrantes.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">Sem entrantes registrados.</div>
          ) : (
            <DonutStatusEntrantes dados={donutEntrantes} />
          )}
        </SecaoCard>

        <SecaoCard titulo="Processos em aberto por etapa" descricao="Onde os processos ativos estão parados hoje.">
          {loading ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">Carregando...</div>
          ) : (
            <BarrasEtapa dados={barrasEtapa} />
          )}
        </SecaoCard>

        <SecaoCard
          titulo="Cumprimento de SLA por fase"
          descricao="Percentual resolvido dentro do prazo, histórico de cada fase."
          className="xl:col-span-2"
        >
          {loading ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">Carregando...</div>
          ) : barrasSla.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">Sem itens resolvidos ainda.</div>
          ) : (
            <BarrasSla dados={barrasSla} />
          )}
        </SecaoCard>
      </div>
    </div>
  )
}
