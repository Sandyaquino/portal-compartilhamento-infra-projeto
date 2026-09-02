"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Plus } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { Button } from "@/components/ui/button"
import { FilterField } from "@/components/ui/filter-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlanoMedidasTable, type SortField, type SortDirection } from "@/components/resultados/plano-medidas-table"
import {
  PlanoMedidasForm,
  VALORES_VAZIOS,
  valoresIniciaisDoItem,
  type PlanoMedidaFormValues,
} from "@/components/resultados/plano-medidas-form"
import { API_BASE_URL } from "@/lib/config"
import { estaVencido, STATUS_OPCOES, RISCO_OPCOES, type PlanoMedidaItem } from "@/lib/types/plano-medidas"

// Backend real: routers/plano_medidas.py + tabela CLB349328.PORTAL_COMPARTILHAMENTO_PLANO_MEDIDAS
// (FastAPI + SAP HANA, mesmo padrão do resto do portal). Não há camada de
// JSON local aqui - a API já é a fonte de dados definitiva.

const FILTRO_TODOS = "__todos__"

export default function PlanoDeMedidasPage() {
  const [itens, setItens] = useState<PlanoMedidaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)

  const [filtroBloco, setFiltroBloco] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")
  const [filtroResponsavel, setFiltroResponsavel] = useState("")
  const [filtroRisco, setFiltroRisco] = useState("")

  const [sortField, setSortField] = useState<SortField>("PRAZO")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const [modalAberto, setModalAberto] = useState(false)
  const [itemEditando, setItemEditando] = useState<PlanoMedidaItem | null>(null)

  async function carregar() {
    setLoading(true)
    setErro(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/plano-medidas`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao carregar o plano de medidas`)
      setItens(await response.json())
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar o plano de medidas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const opcoesBloco = useMemo(
    () => Array.from(new Set(itens.map((i) => i.BLOCO).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [itens],
  )
  const opcoesResponsavel = useMemo(
    () => Array.from(new Set(itens.map((i) => i.RESPONSAVEL).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [itens],
  )

  const itensFiltrados = useMemo(() => {
    let resultado = itens
    if (filtroBloco) resultado = resultado.filter((i) => i.BLOCO === filtroBloco)
    if (filtroStatus) resultado = resultado.filter((i) => i.STATUS === filtroStatus)
    if (filtroResponsavel) resultado = resultado.filter((i) => i.RESPONSAVEL === filtroResponsavel)
    if (filtroRisco) resultado = resultado.filter((i) => i.RISCO === filtroRisco)

    const statusOrdem: Record<string, number> = { "Não iniciado": 0, "Em andamento": 1, "Concluído": 2 }

    return [...resultado].sort((a, b) => {
      if (sortField === "PRAZO") {
        const cmp = (a.PRAZO || "").localeCompare(b.PRAZO || "")
        return sortDirection === "asc" ? cmp : -cmp
      }
      const cmp = (statusOrdem[a.STATUS] ?? 99) - (statusOrdem[b.STATUS] ?? 99)
      return sortDirection === "asc" ? cmp : -cmp
    })
  }, [itens, filtroBloco, filtroStatus, filtroResponsavel, filtroRisco, sortField, sortDirection])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((atual) => (atual === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const totalNaoIniciado = itens.filter((i) => i.STATUS === "Não iniciado").length
  const totalEmAndamento = itens.filter((i) => i.STATUS === "Em andamento").length
  const totalConcluido = itens.filter((i) => i.STATUS === "Concluído").length
  const totalVencido = itens.filter(estaVencido).length

  function abrirCriacao() {
    setItemEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(item: PlanoMedidaItem) {
    setItemEditando(item)
    setModalAberto(true)
  }

  async function salvar(valores: PlanoMedidaFormValues) {
    const payload = {
      bloco: valores.bloco.trim(),
      kpi: valores.kpi.trim(),
      mes: valores.mes,
      desvio_identificado: valores.desvioPercentual.trim() === "" ? null : Number(valores.desvioPercentual) / 100,
      causa_raiz: valores.causaRaiz.trim() || null,
      medida_acao: valores.medidaAcao.trim(),
      responsavel: valores.responsavel.trim(),
      prazo: valores.prazo,
      status: valores.status,
      risco: valores.risco,
      evidencia_link: valores.evidenciaLink.trim() || null,
      comentario_executivo: valores.comentarioExecutivo.trim() || null,
    }

    const url = itemEditando
      ? `${API_BASE_URL}/api/plano-medidas/${itemEditando.ID}`
      : `${API_BASE_URL}/api/plano-medidas`
    const method = itemEditando ? "PUT" : "POST"

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }

    setNotification({
      type: "success",
      message: itemEditando ? "Medida atualizada com sucesso!" : "Medida criada com sucesso!",
    })
    await carregar()
  }

  async function excluir(item: PlanoMedidaItem) {
    if (!window.confirm(`Excluir a medida "${item.KPI}" (${item.MES})? Essa ação não pode ser desfeita.`)) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/plano-medidas/${item.ID}`, { method: "DELETE" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao excluir`)
      setNotification({ type: "success", message: "Medida excluída com sucesso!" })
      await carregar()
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao excluir a medida",
      })
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Plano de Medidas"
        description="Acompanhamento de desvios de KPI: causa raiz, ação corretiva, responsável, prazo e risco."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Resultados", href: "/resultados" },
          { label: "Plano de Medidas" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Total"
          value={loading ? "…" : String(itens.length)}
          subtitle="Medidas cadastradas"
          icon={ClipboardList}
          color="text-primary"
        />
        <KpiCard
          title="Não Iniciado"
          value={loading ? "…" : String(totalNaoIniciado)}
          subtitle="Aguardando início"
          icon={Clock}
          color="text-slate-500"
        />
        <KpiCard
          title="Em Andamento"
          value={loading ? "…" : String(totalEmAndamento)}
          subtitle="Ação em curso"
          icon={Clock}
          color="text-blue-600"
        />
        <KpiCard
          title="Concluído"
          value={loading ? "…" : String(totalConcluido)}
          subtitle="Ação finalizada"
          icon={CheckCircle2}
          color="text-green-600"
        />
        <KpiCard
          title="Vencidos"
          value={loading ? "…" : String(totalVencido)}
          subtitle="Prazo já passou"
          icon={AlertTriangle}
          color="text-red-600"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <h2 className="font-semibold text-slate-900">Filtros</h2>
          <Button onClick={abrirCriacao} className="h-9 w-fit">
            <Plus className="h-4 w-4" />
            Nova medida
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

          <FilterField label="Status">
            <Select value={filtroStatus || FILTRO_TODOS} onValueChange={(v) => setFiltroStatus(v === FILTRO_TODOS || v === null ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos os status</SelectItem>
                {STATUS_OPCOES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Responsável">
            <Select
              value={filtroResponsavel || FILTRO_TODOS}
              onValueChange={(v) => setFiltroResponsavel(v === FILTRO_TODOS || v === null ? "" : v)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos os responsáveis</SelectItem>
                {opcoesResponsavel.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Risco">
            <Select value={filtroRisco || FILTRO_TODOS} onValueChange={(v) => setFiltroRisco(v === FILTRO_TODOS || v === null ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos os riscos</SelectItem>
                {RISCO_OPCOES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Carregando plano de medidas...
        </div>
      )}

      {!loading && erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          {erro}
        </div>
      )}

      {!loading && !erro && (
        <PlanoMedidasTable
          itens={itensFiltrados}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          onEditar={abrirEdicao}
          onExcluir={excluir}
        />
      )}

      <PlanoMedidasForm
        open={modalAberto}
        onOpenChange={setModalAberto}
        titulo={itemEditando ? `Editar medida — ${itemEditando.KPI}` : "Nova medida"}
        valoresIniciais={itemEditando ? valoresIniciaisDoItem(itemEditando) : VALORES_VAZIOS}
        onSalvar={salvar}
      />
    </div>
  )
}
