
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  Search,
  Users,
  XCircle,
} from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { API_BASE_URL } from "@/lib/config"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { PromptModal } from "@/components/ui/prompt-modal"
import { exportarCsv } from "@/lib/csv"
import { KpiCard } from "@/components/comercial/kpi-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FilterField } from "@/components/ui/filter-field"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import {
  useListaEntrantes,
  getEntranteId,
  normalizar,
  normalizarStatus,
  formatarData,
  formatarNumero,
  statusClass,
  statusLabel,
  getErrorMessage,
  type Entrante,
} from "@/hooks/use-lista-entrantes"

const DETALHE_BASE_PATH = "/comercial/novosentrantes"

export default function NovosEntrantesPage() {
  const router = useRouter()

  const {
    entrantes,
    filteredEntrantes,
    paginatedEntrantes,
    pagina,
    setPagina,
    totalPaginas,
    loading,
    filtroRazao,
    setFiltroRazao,
    filtroCNPJ,
    setFiltroCNPJ,
    filtroMunicipio,
    setFiltroMunicipio,
    filtroStatus,
    setFiltroStatus,
    mostrarDescartados,
    setMostrarDescartados,
    sortField,
    sortDirection,
    handleSort,
    carregarEntrantes,
    ultimoRegistro: ultimaEntrada,
  } = useListaEntrantes()

  const [notification, setNotification] = useState<Notification | null>(null)
  const [descartarAlvo, setDescartarAlvo] = useState<Entrante | null>(null)

  const ativos = entrantes.filter((e) => normalizarStatus(e.STATUS_ENTRADA) !== "DESCARTADO")
  const novos = ativos.filter((e) => normalizarStatus(e.STATUS_ENTRADA) === "NOVO").length
  const analisados = ativos.filter((e) => normalizarStatus(e.STATUS_ENTRADA) === "ANALISADO").length
  const provedoresCriados = ativos.filter((e) => normalizarStatus(e.STATUS_ENTRADA) === "PROVEDOR_CRIADO").length
  const processosCriados = ativos.filter((e) => normalizarStatus(e.STATUS_ENTRADA) === "PROCESSO_CRIADO").length
  const descartados = entrantes.length - ativos.length

  function handleVisualizar(item: Entrante) {
    const id = getEntranteId(item)

    if (!id) {
      setNotification({ type: "error", message: "Registro sem ID de entrada. Não foi possível abrir o detalhe." })
      return
    }

    router.push(`${DETALHE_BASE_PATH}/${id}`)
  }

  function handleCriarProvedor(item: Entrante) {
    const id = getEntranteId(item)
    if (!id) return
    router.push(`/comercial/provedores/novo/${id}`)
  }

  function handleCriarProcesso(item: Entrante) {
    const id = getEntranteId(item)
    if (!id) return
    router.push(`/comercial/processos/novo/${id}`)
  }

  function handleVerProcesso(item: Entrante) {
    if (!item.ID_PROCESSO) return
    router.push(`/comercial/processos/${item.ID_PROCESSO}`)
  }

  function handleDescartar(item: Entrante) {
    const id = getEntranteId(item)

    if (!id) {
      setNotification({ type: "error", message: "Registro sem ID de entrada. Não foi possível descartar." })
      return
    }

    setDescartarAlvo(item)
  }

  async function confirmarDescarte(motivo: string) {
    const item = descartarAlvo
    setDescartarAlvo(null)

    if (!item) return

    const id = getEntranteId(item)
    if (!id) return

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${id}/descartar`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ motivo }),
        }
      )

      const data = await response.json().catch(() => null)

      if (response.ok) {
        setNotification({ type: "success", message: "Entrante descartado." })
        await carregarEntrantes()
        return
      }

      setNotification({ type: "error", message: `Erro ao descartar: ${getErrorMessage(data, "Erro desconhecido")}` })
    } catch (error) {
      console.error(error)
      setNotification({ type: "error", message: String(error) })
    }
  }

  function exportarCSV() {
    if (filteredEntrantes.length === 0) {
      setNotification({ type: "warning", message: "Não há registros para exportar." })
      return
    }

    const colunas = [
      "ID_ENTRADA",
      "DATA_RECEBIMENTO",
      "RAZAO_SOCIAL",
      "CNPJ",
      "MUNICIPIO",
      "UF",
      "QTD_POSTES",
      "STATUS_ENTRADA",
    ]

    exportarCsv(colunas, filteredEntrantes, "jornada_entrantes.csv")
  }

  return (
    <div className="space-y-6 bg-slate-50 p-6">
      <PageHeader
        title="Jornada de Entrantes"
        description="Acompanhe cada entrante do recebimento até a criação do processo, em um único lugar."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Jornada de Entrantes" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <PromptModal
        open={descartarAlvo !== null}
        title="Descartar registro"
        label="Informe o motivo do descarte:"
        confirmLabel="Descartar"
        onCancel={() => setDescartarAlvo(null)}
        onConfirm={confirmarDescarte}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={Users}
          title="Ativos na Jornada"
          value={ativos.length}
          subtitle="Todos os estágios, exceto descartados"
          color="text-blue-600"
        />
        <KpiCard
          icon={Search}
          title="Novos"
          value={novos}
          subtitle="Aguardando análise"
          color="text-slate-600"
        />
        <KpiCard
          icon={CheckCircle2}
          title="Analisados"
          value={analisados}
          subtitle="Prontos para criar provedor"
          color="text-amber-600"
        />
        <KpiCard
          icon={Building2}
          title="Provedores Criados"
          value={provedoresCriados}
          subtitle="Prontos para criar processo"
          color="text-green-600"
        />
        <KpiCard
          icon={ClipboardCheck}
          title="Processos Criados"
          value={processosCriados}
          subtitle="Jornada concluída"
          color="text-blue-700"
        />
      </div>

      <div className="rounded-xl border-l-4 border-primary bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-slate-900">Último Entrante Recebido</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Razão Social</p>
            <p
              className="truncate text-sm font-semibold text-slate-900"
              title={normalizar(ultimaEntrada?.RAZAO_SOCIAL)}
            >
              {ultimaEntrada?.RAZAO_SOCIAL || ultimaEntrada?.NOME_FANTASIA || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Data</p>
            <p className="text-sm font-semibold text-slate-900">
              {formatarData(ultimaEntrada?.DATA_RECEBIMENTO)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Município</p>
            <p className="text-sm font-semibold text-slate-900">
              {ultimaEntrada?.MUNICIPIO || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Estágio</p>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                ultimaEntrada?.STATUS_ENTRADA
              )}`}
            >
              {statusLabel(ultimaEntrada?.STATUS_ENTRADA)}
            </span>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Todos os Entrantes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Filtre por estágio da jornada ou pesquise por dados cadastrais.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
              <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:w-[820px] xl:grid-cols-4 xl:gap-2">
                <FilterField label="Razão Social">
                  <Input
                    type="text"
                    placeholder="Razão Social"
                    className="h-10"
                    value={filtroRazao}
                    onChange={(event) => setFiltroRazao(event.target.value)}
                  />
                </FilterField>
                <FilterField label="CNPJ">
                  <Input
                    type="text"
                    placeholder="CNPJ"
                    className="h-10"
                    value={filtroCNPJ}
                    onChange={(event) => setFiltroCNPJ(event.target.value)}
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
                <FilterField label="Estágio">
                  <Select
                    value={filtroStatus || "__all__"}
                    onValueChange={(v) => setFiltroStatus(v === "__all__" || v === null ? "" : v)}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos os estágios</SelectItem>
                      <SelectItem value="NOVO">Novo</SelectItem>
                      <SelectItem value="ANALISADO">Analisado</SelectItem>
                      <SelectItem value="PROVEDOR_CRIADO">Provedor Criado</SelectItem>
                      <SelectItem value="PROCESSO_CRIADO">Processo Criado</SelectItem>
                      {mostrarDescartados && <SelectItem value="DESCARTADO">Descartado</SelectItem>}
                    </SelectContent>
                  </Select>
                </FilterField>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={mostrarDescartados}
                    onChange={(event) => setMostrarDescartados(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Mostrar descartados ({descartados})
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={carregarEntrantes}
                  className="h-10 bg-blue-600 px-4 text-white hover:bg-blue-700"
                  disabled={loading}
                >
                  <Search className="h-4 w-4" />
                  {loading ? "Carregando" : "Pesquisar"}
                </Button>

                <Button onClick={exportarCSV} className="h-10 px-4">
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Table className="min-w-[1040px]">
          <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <TableRow>
              <TableHead
                onClick={() => handleSort("ID_ENTRADA")}
                className="cursor-pointer px-4 py-3 font-semibold hover:text-primary"
              >
                ID {sortField === "ID_ENTRADA" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead
                onClick={() => handleSort("DATA_RECEBIMENTO")}
                className="cursor-pointer px-4 py-3 font-semibold hover:text-primary"
              >
                Data {sortField === "DATA_RECEBIMENTO" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead
                onClick={() => handleSort("RAZAO_SOCIAL")}
                className="cursor-pointer px-4 py-3 font-semibold hover:text-primary"
              >
                Razão Social {sortField === "RAZAO_SOCIAL" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead
                onClick={() => handleSort("CNPJ")}
                className="cursor-pointer px-4 py-3 font-semibold hover:text-primary"
              >
                CNPJ {sortField === "CNPJ" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead
                onClick={() => handleSort("MUNICIPIO")}
                className="cursor-pointer px-4 py-3 font-semibold hover:text-primary"
              >
                Município {sortField === "MUNICIPIO" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead
                onClick={() => handleSort("QTD_POSTES")}
                className="cursor-pointer px-4 py-3 text-center font-semibold hover:text-primary"
              >
                Postes {sortField === "QTD_POSTES" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead
                onClick={() => handleSort("STATUS_ENTRADA")}
                className="cursor-pointer px-4 py-3 text-center font-semibold hover:text-primary"
              >
                Estágio {sortField === "STATUS_ENTRADA" && (sortDirection === "asc" ? " ▲" : " ▼")}
              </TableHead>
              <TableHead className="px-4 py-3 text-center font-semibold">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="bg-white">
            {filteredEntrantes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState message="Nenhum entrante encontrado para os filtros selecionados." />
                </TableCell>
              </TableRow>
            ) : (
              paginatedEntrantes.map((item, index) => {
                const id = getEntranteId(item)
                const status = normalizarStatus(item.STATUS_ENTRADA)

                return (
                  <TableRow
                    key={`entrante-${id ?? index}-${index}`}
                    className={index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                  >
                    <TableCell className="px-4 py-3 text-slate-600">{id ?? "-"}</TableCell>
                    <TableCell className="px-4 py-3 text-slate-600">{formatarData(item.DATA_RECEBIMENTO)}</TableCell>
                    <TableCell
                      className="max-w-[260px] truncate px-4 py-3 font-semibold text-slate-800"
                      title={normalizar(item.RAZAO_SOCIAL)}
                    >
                      {item.RAZAO_SOCIAL || item.NOME_FANTASIA || "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-slate-600">{item.CNPJ || "-"}</TableCell>
                    <TableCell className="px-4 py-3 text-slate-600">{item.MUNICIPIO || "-"}</TableCell>
                    <TableCell className="px-4 py-3 text-center font-semibold text-primary">
                      {formatarNumero(item.QTD_POSTES)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.STATUS_ENTRADA)}`}>
                        {statusLabel(item.STATUS_ENTRADA)}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleVisualizar(item)}
                          title="Visualizar"
                          className="text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        {status === "ANALISADO" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCriarProvedor(item)}
                            title="Criar Provedor"
                            className="text-slate-600 hover:border-green-200 hover:bg-green-50 hover:text-primary"
                          >
                            <Building2 className="h-4 w-4" />
                          </Button>
                        )}

                        {status === "PROVEDOR_CRIADO" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCriarProcesso(item)}
                            title="Criar Processo"
                            className="text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                        )}

                        {status === "PROCESSO_CRIADO" && item.ID_PROCESSO && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleVerProcesso(item)}
                            title="Ver Processo"
                            className="text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                        )}

                        {status !== "DESCARTADO" && status !== "PROCESSO_CRIADO" && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDescartar(item)}
                            title="Descartar"
                            className="text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {filteredEntrantes.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row">
            <p className="text-xs text-slate-500">
              {filteredEntrantes.length} registro{filteredEntrantes.length === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPagina(pagina - 1)}
                disabled={pagina <= 1}
                className="h-8 px-3 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setPagina(pagina + 1)}
                disabled={pagina >= totalPaginas}
                className="h-8 px-3 text-xs"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
