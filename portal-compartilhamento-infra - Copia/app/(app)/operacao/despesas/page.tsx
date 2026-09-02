"use client"

import { useEffect, useMemo, useState } from "react"

import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  DollarSign,
  Download,
  Filter,
  MapPin,
  RefreshCcw,
  Search,
  Warehouse,
  XCircle,
} from "lucide-react"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { PageHeader } from "@/components/layout/page-header"
import { API_BASE_URL } from "@/lib/config"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { fetchJsonOrNull as fetchJson } from "@/lib/http"
import { exportarCsv } from "@/lib/csv"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterField } from "@/components/ui/filter-field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { KpiCard } from "@/components/comercial/kpi-card"

const CORES_CATEGORIA = ["#005A34", "#F97316", "#2563EB", "#7C3AED"]
const CORES_EPS = ["#005A34", "#2563EB", "#F97316", "#7C3AED", "#0F766E", "#DC2626"]

type ResumoDespesas = {
  valor_total: number
  valor_fiscalizacao: number
  valor_remocao: number
  postes_executados: number
  registros: number
  total_eps: number
  total_municipios: number
  total_os: number
  ticket_medio: number
}

type EvolucaoDespesas = {
  mes: string
  valor_fiscalizacao: number
  valor_remocao: number
  valor_total: number
  postes_executados: number
}

type EpsDespesas = {
  eps: string
  valor_total: number
  valor_fiscalizacao: number
  valor_remocao: number
  postes_executados: number
  registros: number
}

type MunicipioDespesas = {
  municipio: string
  valor_total: number
  postes_executados: number
  registros: number
  total_eps: number
}

type CategoriaDespesas = {
  categoria: string
  valor_total: number
  postes_executados: number
  registros: number
  total_eps: number
  total_municipios: number
}

type DiarioOperacionalDespesas = {
  dia: string
  postes: number
  valor_total: number
}

type ComparativoDiarioDespesas = {
  dia: string
  valor_fiscalizacao: number
  valor_remocao: number
}

type DetalhamentoDespesas = {
  CATEGORIA?: string | null
  DATA_EXECUCAO?: string | null
  EPS?: string | null
  MUNICIPIO?: string | null
  TIPO_OS?: string | null
  NUMERO_OS?: string | null
  EXECUTOR?: string | null
  POSTES_EXECUTADOS?: number | string | null
  VALOR_BASE?: number | string | null
  VALOR_TOTAL?: number | string | null
}

type FiltrosDespesas = {
  periodo: string
  dataInicial: string
  dataFinal: string
  eps: string
  municipio: string
  categoria: string
}

type OpcoesFiltros = {
  eps: string[]
  municipios: string[]
  categorias: string[]
}

const resumoInicial: ResumoDespesas = {
  valor_total: 0,
  valor_fiscalizacao: 0,
  valor_remocao: 0,
  postes_executados: 0,
  registros: 0,
  total_eps: 0,
  total_municipios: 0,
  total_os: 0,
  ticket_medio: 0,
}

const filtrosIniciais: FiltrosDespesas = {
  periodo: "mes_atual",
  dataInicial: "",
  dataFinal: "",
  eps: "",
  municipio: "",
  categoria: "",
}

const opcoesFiltrosIniciais: OpcoesFiltros = {
  eps: [],
  municipios: [],
  categorias: [],
}

function formatarNumero(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "0"
  return numero.toLocaleString("pt-BR")
}

function formatarMoeda(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "R$ 0,00"
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatarPercentual(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "0,0%"
  return `${numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatarData(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return String(valor)
  return data.toLocaleDateString("pt-BR")
}

function montarQueryString(filtros: FiltrosDespesas) {
  const params = new URLSearchParams()

  params.set("periodo", filtros.periodo)

  if (filtros.periodo === "personalizado") {
    if (filtros.dataInicial) params.set("data_inicial", filtros.dataInicial)
    if (filtros.dataFinal) params.set("data_final", filtros.dataFinal)
  }

  if (filtros.eps) params.set("eps", filtros.eps)
  if (filtros.municipio) params.set("municipio", filtros.municipio)
  if (filtros.categoria) params.set("categoria", filtros.categoria)

  return params.toString()
}

function normalizarResumo(item: Record<string, any>): ResumoDespesas {
  return {
    valor_total: Number(item?.valor_total ?? item?.VALOR_TOTAL ?? 0),
    valor_fiscalizacao: Number(item?.valor_fiscalizacao ?? item?.VALOR_FISCALIZACAO ?? 0),
    valor_remocao: Number(item?.valor_remocao ?? item?.VALOR_REMOCAO ?? 0),
    postes_executados: Number(item?.postes_executados ?? item?.POSTES_EXECUTADOS ?? 0),
    registros: Number(item?.registros ?? item?.REGISTROS ?? 0),
    total_eps: Number(item?.total_eps ?? item?.TOTAL_EPS ?? 0),
    total_municipios: Number(item?.total_municipios ?? item?.TOTAL_MUNICIPIOS ?? 0),
    total_os: Number(item?.total_os ?? item?.TOTAL_OS ?? 0),
    ticket_medio: Number(item?.ticket_medio ?? item?.TICKET_MEDIO ?? 0),
  }
}

function normalizarEvolucao(item: Record<string, any>): EvolucaoDespesas {
  return {
    mes: item?.mes ?? item?.MES ?? "-",
    valor_fiscalizacao: Number(item?.valor_fiscalizacao ?? item?.VALOR_FISCALIZACAO ?? 0),
    valor_remocao: Number(item?.valor_remocao ?? item?.VALOR_REMOCAO ?? 0),
    valor_total: Number(item?.valor_total ?? item?.VALOR_TOTAL ?? 0),
    postes_executados: Number(item?.postes_executados ?? item?.POSTES_EXECUTADOS ?? 0),
  }
}

function normalizarEps(item: Record<string, any>): EpsDespesas {
  return {
    eps: item?.eps ?? item?.EPS ?? "SEM EPS",
    valor_total: Number(item?.valor_total ?? item?.VALOR_TOTAL ?? 0),
    valor_fiscalizacao: Number(item?.valor_fiscalizacao ?? item?.VALOR_FISCALIZACAO ?? 0),
    valor_remocao: Number(item?.valor_remocao ?? item?.VALOR_REMOCAO ?? 0),
    postes_executados: Number(item?.postes_executados ?? item?.POSTES_EXECUTADOS ?? 0),
    registros: Number(item?.registros ?? item?.REGISTROS ?? 0),
  }
}

function normalizarMunicipio(item: Record<string, any>): MunicipioDespesas {
  return {
    municipio: item?.municipio ?? item?.MUNICIPIO ?? "SEM MUNICÍPIO",
    valor_total: Number(item?.valor_total ?? item?.VALOR_TOTAL ?? 0),
    postes_executados: Number(item?.postes_executados ?? item?.POSTES_EXECUTADOS ?? 0),
    registros: Number(item?.registros ?? item?.REGISTROS ?? 0),
    total_eps: Number(item?.total_eps ?? item?.TOTAL_EPS ?? 0),
  }
}

function normalizarCategoria(item: Record<string, any>): CategoriaDespesas {
  return {
    categoria: item?.categoria ?? item?.CATEGORIA ?? "OUTROS",
    valor_total: Number(item?.valor_total ?? item?.VALOR_TOTAL ?? 0),
    postes_executados: Number(item?.postes_executados ?? item?.POSTES_EXECUTADOS ?? 0),
    registros: Number(item?.registros ?? item?.REGISTROS ?? 0),
    total_eps: Number(item?.total_eps ?? item?.TOTAL_EPS ?? 0),
    total_municipios: Number(item?.total_municipios ?? item?.TOTAL_MUNICIPIOS ?? 0),
  }
}

function normalizarDiario(item: Record<string, any>): DiarioOperacionalDespesas {
  return {
    dia: item?.dia ?? item?.DIA ?? "-",
    postes: Number(item?.postes ?? item?.POSTES ?? 0),
    valor_total: Number(item?.valor_total ?? item?.VALOR_TOTAL ?? 0),
  }
}

function normalizarComparativoDiario(item: Record<string, any>): ComparativoDiarioDespesas {
  return {
    dia: item?.dia ?? item?.DIA ?? "-",
    valor_fiscalizacao: Number(item?.valor_fiscalizacao ?? item?.VALOR_FISCALIZACAO ?? 0),
    valor_remocao: Number(item?.valor_remocao ?? item?.VALOR_REMOCAO ?? 0),
  }
}

function normalizarOpcoes(item: Record<string, any>): OpcoesFiltros {
  return {
    eps: Array.isArray(item?.eps) ? item.eps : [],
    municipios: Array.isArray(item?.municipios) ? item.municipios : [],
    categorias: Array.isArray(item?.categorias) ? item.categorias : [],
  }
}

export default function DespesasPage() {
  const [resumo, setResumo] = useState<ResumoDespesas>(resumoInicial)
  const [evolucao, setEvolucao] = useState<EvolucaoDespesas[]>([])
  const [epsData, setEpsData] = useState<EpsDespesas[]>([])
  const [municipios, setMunicipios] = useState<MunicipioDespesas[]>([])
  const [categorias, setCategorias] = useState<CategoriaDespesas[]>([])
  const [fiscalizacaoDiaria, setFiscalizacaoDiaria] = useState<DiarioOperacionalDespesas[]>([])
  const [remocaoDiaria, setRemocaoDiaria] = useState<DiarioOperacionalDespesas[]>([])
  const [comparativoDiario, setComparativoDiario] = useState<ComparativoDiarioDespesas[]>([])
  const [detalhamento, setDetalhamento] = useState<DetalhamentoDespesas[]>([])
  const [opcoesFiltros, setOpcoesFiltros] = useState<OpcoesFiltros>(opcoesFiltrosIniciais)
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState<FiltrosDespesas>(filtrosIniciais)
  const [buscaTabela, setBuscaTabela] = useState("")
  const [notification, setNotification] = useState<Notification | null>(null)

  async function carregarDashboard(filtrosAplicados = filtros) {
    setLoading(true)

    const queryString = montarQueryString(filtrosAplicados)
    const sufixo = queryString ? `?${queryString}` : ""

    const [
      resumoData,
      evolucaoData,
      epsResponse,
      municipiosResponse,
      categoriasResponse,
      fiscalizacaoDiariaResponse,
      remocaoDiariaResponse,
      comparativoDiarioResponse,
      detalhamentoResponse,
      filtrosResponse,
    ] = await Promise.all([
      fetchJson<ResumoDespesas>(`${API_BASE_URL}/api/despesas/resumo${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/evolucao${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/eps${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/municipios${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/categorias${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/fiscalizacao-diaria${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/remocao-diaria${sufixo}`),
      fetchJson<any[]>(`${API_BASE_URL}/api/despesas/comparativo-diario${sufixo}`),
      fetchJson<DetalhamentoDespesas[]>(`${API_BASE_URL}/api/despesas/detalhamento${sufixo}`),
      fetchJson<OpcoesFiltros>(`${API_BASE_URL}/api/despesas/filtros`),
    ])

    setResumo(resumoData ? normalizarResumo(resumoData) : resumoInicial)
    setEvolucao(Array.isArray(evolucaoData) ? evolucaoData.map(normalizarEvolucao) : [])
    setEpsData(Array.isArray(epsResponse) ? epsResponse.map(normalizarEps) : [])
    setMunicipios(Array.isArray(municipiosResponse) ? municipiosResponse.map(normalizarMunicipio) : [])
    setCategorias(Array.isArray(categoriasResponse) ? categoriasResponse.map(normalizarCategoria) : [])
    setFiscalizacaoDiaria(Array.isArray(fiscalizacaoDiariaResponse) ? fiscalizacaoDiariaResponse.map(normalizarDiario) : [])
    setRemocaoDiaria(Array.isArray(remocaoDiariaResponse) ? remocaoDiariaResponse.map(normalizarDiario) : [])
    setComparativoDiario(Array.isArray(comparativoDiarioResponse) ? comparativoDiarioResponse.map(normalizarComparativoDiario) : [])
    setDetalhamento(Array.isArray(detalhamentoResponse) ? detalhamentoResponse : [])
    setOpcoesFiltros(filtrosResponse ? normalizarOpcoes(filtrosResponse) : opcoesFiltrosIniciais)

    setLoading(false)
  }

  useEffect(() => {
    carregarDashboard(filtrosIniciais)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function atualizarFiltro(campo: keyof FiltrosDespesas, valor: string) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }))
  }

  function aplicarFiltros() {
    carregarDashboard(filtros)
  }

  function limparFiltros() {
    setFiltros(filtrosIniciais)
    carregarDashboard(filtrosIniciais)
  }

  const detalhamentoFiltrado = useMemo(() => {
    const termo = buscaTabela.trim().toLowerCase()
    if (!termo) return detalhamento
    return detalhamento.filter((item) => {
      return (
        String(item.CATEGORIA ?? "").toLowerCase().includes(termo) ||
        String(item.EPS ?? "").toLowerCase().includes(termo) ||
        String(item.MUNICIPIO ?? "").toLowerCase().includes(termo) ||
        String(item.TIPO_OS ?? "").toLowerCase().includes(termo) ||
        String(item.NUMERO_OS ?? "").toLowerCase().includes(termo) ||
        String(item.EXECUTOR ?? "").toLowerCase().includes(termo)
      )
    })
  }, [detalhamento, buscaTabela])

  const totalCategorias = useMemo(() => categorias.reduce((acc, item) => acc + item.valor_total, 0), [categorias])
  const categoriasComPercentual = useMemo(() => categorias.map((item) => ({ ...item, percentual: totalCategorias > 0 ? (item.valor_total / totalCategorias) * 100 : 0 })), [categorias, totalCategorias])
  const topMunicipios = useMemo(() => municipios.slice(0, 10), [municipios])
  const topEps = useMemo(() => epsData.slice(0, 8), [epsData])

  function exportarCSV() {
    if (detalhamentoFiltrado.length === 0) {
      setNotification({ type: "warning", message: "Não há registros para exportar." })
      return
    }
    const colunas: Array<keyof DetalhamentoDespesas> = ["CATEGORIA", "DATA_EXECUCAO", "EPS", "MUNICIPIO", "TIPO_OS", "NUMERO_OS", "EXECUTOR", "POSTES_EXECUTADOS", "VALOR_BASE", "VALOR_TOTAL"]
    exportarCsv(colunas, detalhamentoFiltrado, "DESPESAS_COMPARTILHAMENTO.csv")
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Despesas"
        description="Controle dos custos de Fiscalização e Remoção por EPS, período, município e categoria de serviço."
        breadcrumbs={[{ label: "Início", href: "/" }, { label: "Operação" }, { label: "Despesas" }]}
      />

      <NotificationBanner notification={notification} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Filter className="h-5 w-5" />
          <h2 className="font-semibold text-slate-900">Filtros do controle de despesas</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <FilterField label="Período">
            <Select value={filtros.periodo} onValueChange={(valor) => valor !== null && atualizarFiltro("periodo", valor)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
                <SelectItem value="ultimos_7_dias">Últimos 7 dias</SelectItem>
                <SelectItem value="ultimos_30_dias">Últimos 30 dias</SelectItem>
                <SelectItem value="mes_atual">Mês atual</SelectItem>
                <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Data inicial">
            <Input type="date" value={filtros.dataInicial} disabled={filtros.periodo !== "personalizado"} onChange={(event) => atualizarFiltro("dataInicial", event.target.value)} />
          </FilterField>
          <FilterField label="Data final">
            <Input type="date" value={filtros.dataFinal} disabled={filtros.periodo !== "personalizado"} onChange={(event) => atualizarFiltro("dataFinal", event.target.value)} />
          </FilterField>
          <FilterField label="EPS">
            <Select value={filtros.eps || "__all__"} onValueChange={(valor) => atualizarFiltro("eps", valor === "__all__" || valor === null ? "" : valor)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {opcoesFiltros.eps.map((opcao) => <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Município">
            <Select value={filtros.municipio || "__all__"} onValueChange={(valor) => atualizarFiltro("municipio", valor === "__all__" || valor === null ? "" : valor)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {opcoesFiltros.municipios.map((opcao) => <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Categoria">
            <Select value={filtros.categoria || "__all__"} onValueChange={(valor) => atualizarFiltro("categoria", valor === "__all__" || valor === null ? "" : valor)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {opcoesFiltros.categorias.map((opcao) => <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={limparFiltros}>
            <XCircle className="h-4 w-4" /> Limpar filtros
          </Button>
          <Button type="button" onClick={aplicarFiltros} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar dashboard
          </Button>
        </div>
      </div>

      {loading && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">Carregando indicadores de despesas...</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 xl:grid-cols-4">
        <KpiCard title="Despesa Total" value={formatarMoeda(resumo.valor_total)} subtitle="Fiscalização + Remoção" icon={DollarSign} color="text-primary" />
        <KpiCard title="Fiscalização" value={formatarMoeda(resumo.valor_fiscalizacao)} subtitle="Técnicos" icon={ClipboardList} color="text-blue-600" />
        <KpiCard title="Remoção" value={formatarMoeda(resumo.valor_remocao)} subtitle="Equipes de campo" icon={Warehouse} color="text-orange-600" />
        <KpiCard title="Ticket Médio" value={formatarMoeda(resumo.ticket_medio)} subtitle="Valor por poste" icon={Activity} color="text-purple-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 xl:grid-cols-4">
        <KpiCard title="Postes Executados" value={formatarNumero(resumo.postes_executados)} subtitle="Base de cálculo" icon={Building2} color="text-primary" />
        <KpiCard title="OS Distintas" value={formatarNumero(resumo.total_os)} subtitle="Ordens consideradas" icon={ClipboardList} color="text-slate-700" />
        <KpiCard title="Municípios" value={formatarNumero(resumo.total_municipios)} subtitle="Municípios com custo" icon={MapPin} color="text-green-600" />
        <KpiCard title="EPS" value={formatarNumero(resumo.total_eps)} subtitle="Empresas com despesa" icon={BarChart3} color="text-blue-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Evolução Mensal das Despesas</h2>
              <p className="text-sm text-slate-500">Acompanhamento mensal dos custos de fiscalização e remoção.</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Fiscalização x Remoção</div>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucao} margin={{ top: 20, right: 18, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorFiscalizacao" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorRemocao" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#F97316" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <Tooltip formatter={(value, name) => name === "Fiscalização" ? [formatarMoeda(value as number), "Fiscalização"] : name === "Remoção" ? [formatarMoeda(value as number), "Remoção"] : [formatarMoeda(value as number), "Total"]} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }} />
                <Legend />
                <Area type="monotone" dataKey="valor_fiscalizacao" name="Fiscalização" stroke="#2563EB" strokeWidth={3} fill="url(#colorFiscalizacao)" />
                <Area type="monotone" dataKey="valor_remocao" name="Remoção" stroke="#F97316" strokeWidth={3} fill="url(#colorRemocao)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Rateio por Categoria</h2>
            <p className="text-sm text-slate-500">Participação da despesa por tipo de serviço.</p>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoriasComPercentual} nameKey="categoria" dataKey="valor_total" innerRadius={54} outerRadius={88} paddingAngle={3}>{categoriasComPercentual.map((item, index) => <Cell key={item.categoria} fill={CORES_CATEGORIA[index % CORES_CATEGORIA.length]} />)}</Pie>
                <Tooltip formatter={(value) => [formatarMoeda(value as number), "Valor"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {categoriasComPercentual.length === 0 ? <p className="text-sm text-slate-500">Nenhuma categoria encontrada.</p> : categoriasComPercentual.map((item, index) => (
              <div key={item.categoria} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: CORES_CATEGORIA[index % CORES_CATEGORIA.length] }} /><span className="text-slate-600">{item.categoria}</span></div>
                <span className="font-semibold text-slate-800">{formatarMoeda(item.valor_total)} · {formatarPercentual(item.percentual)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GraficoDiario titulo="Fiscalização Diária" subtitulo="Produção diária dos técnicos e valor calculado de fiscalização." selo="Técnicos" dados={fiscalizacaoDiaria} corBarra="#2563EB" corLinha="#005A34" />
        <GraficoDiario titulo="Remoção Diária" subtitulo="Produção diária das equipes de campo e valor calculado de remoção." selo="Equipes de campo" dados={remocaoDiaria} corBarra="#F97316" corLinha="#DC2626" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Comparativo Diário: Fiscalização x Remoção</h2>
            <p className="text-sm text-slate-500">Comparação diária do valor de despesa entre fiscalização técnica e remoção em campo.</p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Valor diário</div>
        </div>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparativoDiario} margin={{ top: 18, right: 18, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
              <Tooltip formatter={(value, name) => name === "Fiscalização" ? [formatarMoeda(value as number), "Fiscalização"] : [formatarMoeda(value as number), "Remoção"]} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }} />
              <Legend />
              <Bar dataKey="valor_fiscalizacao" name="Fiscalização" fill="#2563EB" radius={[7, 7, 0, 0]} />
              <Bar dataKey="valor_remocao" name="Remoção" fill="#F97316" radius={[7, 7, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">Custos por EPS</h2><p className="text-sm text-slate-500">Despesa total por empresa prestadora de serviço.</p></div><div className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Top EPS</div></div>
          <div className="h-[310px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={topEps} margin={{ top: 12, right: 18, left: -18, bottom: 12 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="eps" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} /><Tooltip formatter={(value) => [formatarMoeda(value as number), "Valor"]} /><Bar dataKey="valor_total" name="Valor Total" radius={[7, 7, 0, 0]}>{topEps.map((item, index) => <Cell key={item.eps} fill={CORES_EPS[index % CORES_EPS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Ranking EPS</h2>
          <div className="space-y-3">
            {epsData.length === 0 ? <p className="text-sm text-slate-500">Nenhuma EPS encontrada.</p> : epsData.map((item, index) => <div key={item.eps} className="rounded-lg border border-slate-100 p-3"><div className="mb-1 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span><p className="font-semibold text-slate-800">{item.eps}</p></div><span className="text-sm font-bold text-primary">{formatarMoeda(item.valor_total)}</span></div><p className="text-xs text-slate-500">{formatarNumero(item.postes_executados)} postes · {formatarNumero(item.registros)} registros</p></div>)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">Municípios Mais Custosos</h2><p className="text-sm text-slate-500">Top municípios por valor total no período filtrado.</p></div><div className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Top 10 municípios</div></div>
        <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={topMunicipios} margin={{ top: 12, right: 18, left: -18, bottom: 45 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="municipio" interval={0} angle={-25} textAnchor="end" tick={{ fontSize: 11, fill: "#64748B" }} /><YAxis tick={{ fontSize: 12, fill: "#64748B" }} /><Tooltip formatter={(value) => [formatarMoeda(value as number), "Valor"]} /><Bar dataKey="valor_total" name="Valor Total" fill="#005A34" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Detalhamento das Despesas</h2>
            <p className="text-sm text-slate-500">Registros calculados por categoria, EPS, município, postes executados e valor base.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 md:w-[360px]">
              <Search className="h-4 w-4 text-slate-400" />
              <input placeholder="Pesquisar categoria, EPS, município, OS, executor..." value={buscaTabela} onChange={(event) => setBuscaTabela(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
            <Button type="button" onClick={exportarCSV} className="h-9 w-fit">
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>
        <Table className="min-w-[1100px] text-xs">
          <TableHeader>
            <TableRow className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <TableHead className="p-2 text-left">Data</TableHead>
              <TableHead className="p-2 text-left">Categoria</TableHead>
              <TableHead className="p-2 text-left">EPS</TableHead>
              <TableHead className="p-2 text-left">Município</TableHead>
              <TableHead className="p-2 text-left">Tipo OS</TableHead>
              <TableHead className="p-2 text-left">Número OS</TableHead>
              <TableHead className="p-2 text-left">Executor</TableHead>
              <TableHead className="p-2 text-center">Postes</TableHead>
              <TableHead className="p-2 text-center">Valor Base</TableHead>
              <TableHead className="p-2 text-center">Valor Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detalhamentoFiltrado.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10}>
                  <EmptyState message="Nenhum registro encontrado." />
                </TableCell>
              </TableRow>
            ) : (
              detalhamentoFiltrado.map((item, index) => (
                <TableRow key={`${item.CATEGORIA}-${item.NUMERO_OS}-${index}`}>
                  <TableCell className="p-2 text-slate-600">{formatarData(item.DATA_EXECUCAO)}</TableCell>
                  <TableCell className="p-2 font-medium text-slate-800">{item.CATEGORIA ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-700">{item.EPS ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{item.MUNICIPIO ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{item.TIPO_OS ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{item.NUMERO_OS ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{item.EXECUTOR ?? "-"}</TableCell>
                  <TableCell className="p-2 text-center font-semibold text-primary">{formatarNumero(item.POSTES_EXECUTADOS)}</TableCell>
                  <TableCell className="p-2 text-center font-semibold text-blue-600">{formatarMoeda(item.VALOR_BASE)}</TableCell>
                  <TableCell className="p-2 text-center font-bold text-primary">{formatarMoeda(item.VALOR_TOTAL)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-500">Dados carregados via FastAPI com cálculo direto de POSTES_EXECUTADOS × VALOR_BASE para Fiscalização e Remoção.</p>
    </div>
  )
}

function GraficoDiario({ titulo, subtitulo, selo, dados, corBarra, corLinha }: { titulo: string; subtitulo: string; selo: string; dados: DiarioOperacionalDespesas[]; corBarra: string; corLinha: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">{titulo}</h2><p className="text-sm text-slate-500">{subtitulo}</p></div><div className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">{selo}</div></div>
      <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={dados} margin={{ top: 18, right: 18, left: -18, bottom: 0 }}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} /><YAxis yAxisId="valor" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} /><YAxis yAxisId="postes" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} /><Tooltip formatter={(value, name) => name === "Despesa" ? [formatarMoeda(value as number), "Despesa"] : [formatarNumero(value as number), "Postes"]} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }} /><Legend /><Bar yAxisId="valor" dataKey="valor_total" name="Despesa" fill={corBarra} radius={[7, 7, 0, 0]} /><Line yAxisId="postes" type="monotone" dataKey="postes" name="Postes" stroke={corLinha} strokeWidth={3} dot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div>
    </div>
  )
}

