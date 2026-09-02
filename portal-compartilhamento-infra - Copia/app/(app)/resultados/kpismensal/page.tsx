"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { PageHeader } from "@/components/layout/page-header"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { FilterField } from "@/components/ui/filter-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { KpiSeletor, type NovoKpiValues } from "@/components/resultados/kpi-seletor"
import { KpiResumoCards } from "@/components/resultados/kpi-resumo-cards"
import { KpiGraficoMensal } from "@/components/resultados/kpi-grafico-mensal"
import { KpiTabelaMensal } from "@/components/resultados/kpi-tabela-mensal"
import { KpisVisaoGeralTabela } from "@/components/resultados/kpis-visao-geral-tabela"
import { EmptyState } from "@/components/ui/empty-state"
import { API_BASE_URL } from "@/lib/config"
import type { KpiCadastro, KpiLancamento, KpiVisaoGeral } from "@/lib/types/kpis-mensal"

// Backend real: routers/kpis_mensal.py + tabelas CLB349328.PORTAL_COMPARTILHAMENTO_KPI_CADASTRO
// e ...KPI_LANCAMENTO (FastAPI + SAP HANA). Desvio/%Desvio/Status nunca vêm
// digitados - são sempre recalculados no backend a partir de meta/realizado.

const FILTRO_TODOS = "__todos__"

export default function KpisMensalPage() {
  const [kpis, setKpis] = useState<KpiCadastro[]>([])
  const [kpiSelecionadoId, setKpiSelecionadoId] = useState<number | null>(null)
  const [lancamentos, setLancamentos] = useState<KpiLancamento[]>([])
  const [visaoGeral, setVisaoGeral] = useState<KpiVisaoGeral[]>([])

  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingLancamentos, setLoadingLancamentos] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [filtroBloco, setFiltroBloco] = useState("")

  const carregarKpis = useCallback(async () => {
    setLoadingKpis(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/kpis-mensal/kpis`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao carregar os KPIs`)
      const dados: KpiCadastro[] = await response.json()
      setKpis(dados)
      return dados
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar os KPIs" })
      return []
    } finally {
      setLoadingKpis(false)
    }
  }, [])

  const carregarVisaoGeral = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/kpis-mensal/visao-geral`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao carregar a visão geral`)
      setVisaoGeral(await response.json())
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar a visão geral" })
    }
  }, [])

  const carregarLancamentos = useCallback(async (kpiId: number) => {
    setLoadingLancamentos(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/kpis-mensal/lancamentos?kpi_id=${kpiId}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao carregar os lançamentos`)
      setLancamentos(await response.json())
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar os lançamentos" })
    } finally {
      setLoadingLancamentos(false)
    }
  }, [])

  useEffect(() => {
    carregarKpis().then((dados) => {
      if (dados.length > 0) setKpiSelecionadoId(dados[0].ID)
    })
    carregarVisaoGeral()
  }, [carregarKpis, carregarVisaoGeral])

  useEffect(() => {
    if (kpiSelecionadoId !== null) carregarLancamentos(kpiSelecionadoId)
  }, [kpiSelecionadoId, carregarLancamentos])

  async function handleCriarKpi(dados: NovoKpiValues) {
    const response = await fetch(`${API_BASE_URL}/api/kpis-mensal/kpis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    })

    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }

    const body = await response.json()
    setNotification({ type: "success", message: "KPI criado com sucesso!" })
    await carregarKpis()
    await carregarVisaoGeral()
    if (body?.item?.ID) setKpiSelecionadoId(body.item.ID)
  }

  async function handleSalvarLancamento(mes: string, meta: number, realizado: number | null, observacao: string | null) {
    if (kpiSelecionadoId === null) return

    const response = await fetch(`${API_BASE_URL}/api/kpis-mensal/lancamentos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpi_id: kpiSelecionadoId, mes, meta, realizado, observacao }),
    })

    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }

    await carregarLancamentos(kpiSelecionadoId)
    await carregarVisaoGeral()
  }

  const kpiSelecionado = useMemo(() => kpis.find((k) => k.ID === kpiSelecionadoId) ?? null, [kpis, kpiSelecionadoId])

  const opcoesBloco = useMemo(
    () => Array.from(new Set(kpis.map((k) => k.BLOCO).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [kpis],
  )

  const visaoGeralFiltrada = useMemo(
    () => (filtroBloco ? visaoGeral.filter((k) => k.BLOCO === filtroBloco) : visaoGeral),
    [visaoGeral, filtroBloco],
  )

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="KPIs Mensais"
        description="Acompanhamento mensal de indicadores: meta x realizado, com semáforo automático."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Resultados", href: "/resultados" },
          { label: "KPIs Mensais" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <Tabs defaultValue="detalhe">
        <TabsList>
          <TabsTrigger value="detalhe">Detalhe do KPI</TabsTrigger>
          <TabsTrigger value="geral">Visão Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="detalhe" className="mt-4 space-y-4">
          {loadingKpis && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              Carregando KPIs...
            </div>
          )}

          {!loadingKpis && kpis.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <EmptyState message="Nenhum KPI cadastrado ainda." />
              <div className="mx-auto w-fit">
                <KpiSeletor kpis={kpis} kpiSelecionadoId={null} onSelecionar={() => {}} onCriar={handleCriarKpi} />
              </div>
            </div>
          )}

          {!loadingKpis && kpis.length > 0 && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <KpiSeletor
                  kpis={kpis}
                  kpiSelecionadoId={kpiSelecionadoId}
                  onSelecionar={setKpiSelecionadoId}
                  onCriar={handleCriarKpi}
                />
              </div>

              {loadingLancamentos && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
                  Carregando lançamentos...
                </div>
              )}

              {!loadingLancamentos && kpiSelecionado && (
                <>
                  <KpiResumoCards kpi={kpiSelecionado} lancamentos={lancamentos} />

                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h2 className="mb-3 font-semibold text-slate-900">Meta x Realizado</h2>
                    <KpiGraficoMensal lancamentos={lancamentos} />
                  </div>

                  <KpiTabelaMensal kpiId={kpiSelecionado.ID} lancamentos={lancamentos} onSalvar={handleSalvarLancamento} />
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="geral" className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="max-w-xs">
              <FilterField label="Bloco">
                <Select value={filtroBloco || FILTRO_TODOS} onValueChange={(v) => setFiltroBloco(v === FILTRO_TODOS || v === null ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTRO_TODOS}>Todos os blocos</SelectItem>
                    {opcoesBloco.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
          </div>

          <KpisVisaoGeralTabela itens={visaoGeralFiltrada} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
