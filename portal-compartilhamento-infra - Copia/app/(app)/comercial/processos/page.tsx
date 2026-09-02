
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  RefreshCcw,
  Search,
  Timer,
} from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { API_BASE_URL } from "@/lib/config"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { exportarCsv } from "@/lib/csv"
import { KpiCard } from "@/components/comercial/kpi-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FilterField } from "@/components/ui/filter-field"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
const TIMELINE_BASE_PATH = "/comercial/processos"

type Processo = {
  ID_PROCESSO?: number | string | null
  ID_PROVEDOR?: number | string | null
  NUMERO_PROTOCOLO?: string | null
  TIPO_PROCESSO?: string | null
  STATUS_ATUAL?: string | null
  ETAPA_ATUAL?: number | string | null
  NOME_ETAPA_ATUAL?: string | null
  MUNICIPIO?: string | null
  REGIONAL?: string | null
  PRIORIDADE?: string | null
  DT_ABERTURA?: string | null
  DT_PREVISAO_CONCLUSAO?: string | null
  DT_CONCLUSAO?: string | null
  CNPJ?: string | null
  RAZAO_SOCIAL?: string | null
  NOME_FANTASIA?: string | null
  RESPONSAVEL?: string | null
  EMAIL?: string | null
  TELEFONE?: string | null
  SLA_DIAS?: number | string | null
  DIAS_CONSUMIDOS?: number | string | null
  DIAS_ATRASO?: number | string | null
}

function normalizar(valor: unknown) {
  return String(valor ?? "")
}

function normalizarStatus(status?: string | null) {
  const s = normalizar(status).trim().toUpperCase()
  return s || "SEM_STATUS"
}

function getProcessoId(item: Processo): number | string | null {
  return item.ID_PROCESSO ?? null
}

function getNomeProvedor(item: Processo) {
  return item.RAZAO_SOCIAL || item.NOME_FANTASIA || "-"
}

function formatarData(valor?: string | null) {
  if (!valor) return "-"

  const data = new Date(valor)

  if (Number.isNaN(data.getTime())) return String(valor)

  return data.toLocaleString("pt-BR")
}

function formatarNumero(valor: number | string | null | undefined) {
  const numero = Number(valor ?? 0)

  if (Number.isNaN(numero)) return "0"

  return numero.toLocaleString("pt-BR")
}

function statusClass(status?: string | null) {
  const s = normalizarStatus(status)

  if (["CONCLUIDO", "CONCLUÍDO", "FINALIZADO"].includes(s)) {
    return "bg-green-100 text-green-700 border border-green-200"
  }

  if (["EM_ANDAMENTO", "ABERTO", "RECEBIDO"].includes(s)) {
    return "bg-blue-100 text-blue-700 border border-blue-200"
  }

  if (["ATRASADO", "BLOQUEADO", "PENDENTE"].includes(s)) {
    return "bg-amber-100 text-amber-700 border border-amber-200"
  }

  if (["CANCELADO", "DESCARTADO"].includes(s)) {
    return "bg-red-100 text-red-700 border border-red-200"
  }

  return "bg-slate-100 text-slate-700 border border-slate-200"
}

function etapaClass(etapa?: string | null) {
  const e = normalizar(etapa).trim().toUpperCase()

  if (e.includes("ANALISE") || e.includes("ANÁLISE")) {
    return "bg-blue-50 text-blue-700 border border-blue-200"
  }

  if (e.includes("DOCUMENTACAO") || e.includes("DOCUMENTAÇÃO")) {
    return "bg-amber-50 text-amber-700 border border-amber-200"
  }

  if (e.includes("APROVACAO") || e.includes("APROVAÇÃO")) {
    return "bg-purple-50 text-purple-700 border border-purple-200"
  }

  if (e.includes("CONTRATACAO") || e.includes("CONTRATAÇÃO")) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200"
  }

  if (e.includes("CONCLUIDO") || e.includes("CONCLUÍDO")) {
    return "bg-green-50 text-green-700 border border-green-200"
  }

  return "bg-slate-50 text-slate-700 border border-slate-200"
}

export default function ProcessosPage() {
  const router = useRouter()

  const [processos, setProcessos] = useState<Processo[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroProtocolo, setFiltroProtocolo] = useState("")
  const [filtroProvedor, setFiltroProvedor] = useState("")
  const [filtroMunicipio, setFiltroMunicipio] = useState("")
  const [filtroEtapa, setFiltroEtapa] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")

  const [sortField, setSortField] = useState<keyof Processo>("DT_ABERTURA")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const [notification, setNotification] = useState<Notification | null>(null)

  function handleSort(field: keyof Processo) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  async function carregarProcessos() {
    try {
      setLoading(true)

      const response = await fetch(`${API_BASE_URL}/api/processos`, {
        cache: "no-store",
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("PROCESSOS", response.status, errorText)
        throw new Error(`Erro ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      setProcessos(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Erro ao carregar processos:", error)
      setProcessos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarProcessos()
  }, [])

  const filteredProcessos = useMemo(() => {
    const protocoloFiltro = filtroProtocolo.trim().toLowerCase()
    const provedorFiltro = filtroProvedor.trim().toLowerCase()
    const municipioFiltro = filtroMunicipio.trim().toLowerCase()
    const etapaFiltro = filtroEtapa.trim().toLowerCase()
    const statusFiltro = filtroStatus.trim().toLowerCase()

    const resultado = processos.filter((item) => {
      const protocolo = normalizar(item.NUMERO_PROTOCOLO).toLowerCase()
      const provedor = `${normalizar(item.RAZAO_SOCIAL)} ${normalizar(item.NOME_FANTASIA)}`.toLowerCase()
      const municipio = normalizar(item.MUNICIPIO).toLowerCase()
      const etapa = normalizar(item.NOME_ETAPA_ATUAL || item.ETAPA_ATUAL).toLowerCase()
      const status = normalizar(item.STATUS_ATUAL).toLowerCase()

      return (
        protocolo.includes(protocoloFiltro) &&
        provedor.includes(provedorFiltro) &&
        municipio.includes(municipioFiltro) &&
        etapa.includes(etapaFiltro) &&
        status.includes(statusFiltro)
      )
    })

    resultado.sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (["ID_PROCESSO", "ID_PROVEDOR", "ETAPA_ATUAL", "SLA_DIAS", "DIAS_CONSUMIDOS", "DIAS_ATRASO"].includes(String(sortField))) {
        const numA = Number(aValue ?? 0)
        const numB = Number(bValue ?? 0)
        return sortDirection === "asc" ? numA - numB : numB - numA
      }

      if (["DT_ABERTURA", "DT_PREVISAO_CONCLUSAO", "DT_CONCLUSAO"].includes(String(sortField))) {
        const dataA = new Date(String(aValue ?? "")).getTime() || 0
        const dataB = new Date(String(bValue ?? "")).getTime() || 0
        return sortDirection === "asc" ? dataA - dataB : dataB - dataA
      }

      return sortDirection === "asc"
        ? String(aValue ?? "").localeCompare(String(bValue ?? ""))
        : String(bValue ?? "").localeCompare(String(aValue ?? ""))
    })

    return resultado
  }, [processos, filtroProtocolo, filtroProvedor, filtroMunicipio, filtroEtapa, filtroStatus, sortField, sortDirection])

  const total = processos.length
  const ativos = processos.filter((p) => !["CONCLUIDO", "CONCLUÍDO", "FINALIZADO", "CANCELADO"].includes(normalizarStatus(p.STATUS_ATUAL))).length
  const emAnalise = processos.filter((p) => normalizar(p.NOME_ETAPA_ATUAL).toUpperCase().includes("ANALISE") || normalizar(p.NOME_ETAPA_ATUAL).toUpperCase().includes("ANÁLISE")).length
  const emDocumentacao = processos.filter((p) => normalizar(p.NOME_ETAPA_ATUAL).toUpperCase().includes("DOCUMENTACAO") || normalizar(p.NOME_ETAPA_ATUAL).toUpperCase().includes("DOCUMENTAÇÃO")).length
  const atrasados = processos.filter((p) => Number(p.DIAS_ATRASO ?? 0) > 0 || normalizarStatus(p.STATUS_ATUAL) === "ATRASADO").length

  const ultimoProcesso = useMemo(() => {
    if (processos.length === 0) return null

    return [...processos].sort((a, b) => {
      const dataA = new Date(normalizar(a.DT_ABERTURA)).getTime() || 0
      const dataB = new Date(normalizar(b.DT_ABERTURA)).getTime() || 0
      return dataB - dataA
    })[0]
  }, [processos])

  function handleVisualizarTimeline(item: Processo) {
    const id = getProcessoId(item)

    if (!id) {
      setNotification({ type: "error", message: "Processo sem ID. Não foi possível abrir a timeline." })
      return
    }

    router.push(`${TIMELINE_BASE_PATH}/${id}`)
  }

  function exportarCSV() {
    if (filteredProcessos.length === 0) {
      setNotification({ type: "warning", message: "Não há registros para exportar." })
      return
    }

    const colunas = [
      "ID_PROCESSO",
      "NUMERO_PROTOCOLO",
      "RAZAO_SOCIAL",
      "CNPJ",
      "MUNICIPIO",
      "TIPO_PROCESSO",
      "NOME_ETAPA_ATUAL",
      "STATUS_ATUAL",
      "DT_ABERTURA",
    ]

    exportarCsv(colunas, filteredProcessos, "esteira_processos.csv")
  }

  return (
    <div className="space-y-6 bg-slate-50 p-6">
      <PageHeader
        title="Esteira de Processos"
        description="Acompanhe os processos criados e acesse a timeline operacional de cada jornada."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Processos" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={FileText}
          title="Total Processos"
          value={total}
          subtitle="Processos cadastrados"
          color="text-blue-600"
        />
        <KpiCard
          icon={Clock3}
          title="Ativos"
          value={ativos}
          subtitle="Em tramitação"
          color="text-emerald-700"
        />
        <KpiCard
          icon={BarChart3}
          title="Em Análise"
          value={emAnalise}
          subtitle="Etapa cadastral"
          color="text-indigo-600"
        />
        <KpiCard
          icon={Timer}
          title="Documentação"
          value={emDocumentacao}
          subtitle="Coleta documental"
          color="text-amber-600"
        />
        <KpiCard
          icon={AlertTriangle}
          title="Atrasados"
          value={atrasados}
          subtitle="Com atraso registrado"
          color="text-red-600"
        />
      </div>

      <div className="rounded-xl border-l-4 border-primary bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-slate-900">Último Processo Criado</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div>
            <p className="text-xs font-medium text-slate-500">Protocolo</p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {ultimoProcesso?.NUMERO_PROTOCOLO || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Provedor</p>
            <p className="truncate text-sm font-semibold text-slate-900" title={getNomeProvedor(ultimoProcesso || {})}>
              {ultimoProcesso ? getNomeProvedor(ultimoProcesso) : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Município</p>
            <p className="text-sm font-semibold text-slate-900">
              {ultimoProcesso?.MUNICIPIO || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Etapa Atual</p>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${etapaClass(ultimoProcesso?.NOME_ETAPA_ATUAL)}`}>
              {ultimoProcesso?.NOME_ETAPA_ATUAL || ultimoProcesso?.ETAPA_ATUAL || "-"}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Status</p>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(ultimoProcesso?.STATUS_ATUAL)}`}>
              {ultimoProcesso?.STATUS_ATUAL || "-"}
            </span>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Processos em Esteira
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Visualize a fila de processos e acesse a timeline individual pela coluna de ações.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
              <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:w-[900px] xl:grid-cols-5 xl:gap-2">
                <FilterField label="Protocolo">
                  <Input
                    type="text"
                    placeholder="Protocolo"
                    className="h-10"
                    value={filtroProtocolo}
                    onChange={(event) => setFiltroProtocolo(event.target.value)}
                  />
                </FilterField>
                <FilterField label="Provedor">
                  <Input
                    type="text"
                    placeholder="Provedor"
                    className="h-10"
                    value={filtroProvedor}
                    onChange={(event) => setFiltroProvedor(event.target.value)}
                  />
                </FilterField>
                <FilterField label="Município">
                  <Input
                    type="text"
                    placeholder="Município"
                    className="h-10"
                    value={filtroMunicipio}
                    onChange={(event) => setFiltroMunicipio(event.target.value)}
                  />
                </FilterField>
                <FilterField label="Etapa">
                  <Input
                    type="text"
                    placeholder="Etapa"
                    className="h-10"
                    value={filtroEtapa}
                    onChange={(event) => setFiltroEtapa(event.target.value)}
                  />
                </FilterField>
                <FilterField label="Status">
                  <Input
                    type="text"
                    placeholder="Status"
                    className="h-10"
                    value={filtroStatus}
                    onChange={(event) => setFiltroStatus(event.target.value)}
                  />
                </FilterField>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={carregarProcessos}
                  className="h-10 bg-blue-600 px-4 text-white hover:bg-blue-700"
                  disabled={loading}
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Carregando" : "Atualizar"}
                </Button>

                <Button onClick={exportarCSV} className="h-10 px-4">
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Table className="min-w-[1180px]">
          <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <TableRow>
              <TableHead onClick={() => handleSort("ID_PROCESSO")} className="cursor-pointer px-4 py-3 font-semibold hover:text-primary">
                ID {sortField === "ID_PROCESSO" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("NUMERO_PROTOCOLO")} className="cursor-pointer px-4 py-3 font-semibold hover:text-primary">
                Protocolo {sortField === "NUMERO_PROTOCOLO" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("RAZAO_SOCIAL")} className="cursor-pointer px-4 py-3 font-semibold hover:text-primary">
                Provedor {sortField === "RAZAO_SOCIAL" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("CNPJ")} className="cursor-pointer px-4 py-3 font-semibold hover:text-primary">
                CNPJ {sortField === "CNPJ" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("MUNICIPIO")} className="cursor-pointer px-4 py-3 font-semibold hover:text-primary">
                Município {sortField === "MUNICIPIO" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("NOME_ETAPA_ATUAL")} className="cursor-pointer px-4 py-3 text-center font-semibold hover:text-primary">
                Etapa Atual {sortField === "NOME_ETAPA_ATUAL" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("STATUS_ATUAL")} className="cursor-pointer px-4 py-3 text-center font-semibold hover:text-primary">
                Status {sortField === "STATUS_ATUAL" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead onClick={() => handleSort("DT_ABERTURA")} className="cursor-pointer px-4 py-3 font-semibold hover:text-primary">
                Abertura {sortField === "DT_ABERTURA" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead className="px-4 py-3 text-center font-semibold">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="bg-white">
            {filteredProcessos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <EmptyState message="Nenhum processo encontrado na esteira." />
                </TableCell>
              </TableRow>
            ) : (
              filteredProcessos.map((item, index) => {
                const id = getProcessoId(item)

                return (
                  <TableRow
                    key={`processo-${id ?? index}-${index}`}
                    className={index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                  >
                    <TableCell className="px-4 py-3 text-slate-600">{id ?? "-"}</TableCell>
                    <TableCell className="px-4 py-3 font-semibold text-slate-800">{item.NUMERO_PROTOCOLO || "-"}</TableCell>
                    <TableCell className="max-w-[260px] truncate px-4 py-3 font-semibold text-slate-800" title={getNomeProvedor(item)}>
                      {getNomeProvedor(item)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-slate-600">{item.CNPJ || "-"}</TableCell>
                    <TableCell className="px-4 py-3 text-slate-600">{item.MUNICIPIO || "-"}</TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${etapaClass(item.NOME_ETAPA_ATUAL)}`}>
                        {item.NOME_ETAPA_ATUAL || item.ETAPA_ATUAL || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.STATUS_ATUAL)}`}>
                        {item.STATUS_ATUAL || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-slate-600">{formatarData(item.DT_ABERTURA)}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleVisualizarTimeline(item)}
                          title="Abrir Timeline do Processo"
                          className="text-slate-600 hover:border-green-200 hover:bg-green-50 hover:text-primary"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
