"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { API_BASE_URL } from "@/lib/config"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { exportarCsv } from "@/lib/csv"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EditarRegistroModal, type CampoEditavel } from "@/components/operacao/editar-registro-modal"
import { useCurrentUser } from "@/hooks/use-current-user"
import { getToken } from "@/lib/session"

// ------------------------------------------------------------------
// Este componente substitui três telas quase idênticas de "importar CSV
// -> consolidado + histórico + registros + editar registro":
// Operação > Cadastro de Técnicos, Operação > Cadastro de Equipes e
// Comercial > Cadastro Forms. Toda a variação (endpoints, cards, colunas,
// campos editáveis) entra por configuração.
// ------------------------------------------------------------------

type Registro = Record<string, unknown>
type Consolidado = Record<string, unknown> | null

type ResultadoImportacao = {
  lidos: number
  inseridos: number
  atualizados: number
  rejeitados: number
}

type HistoricoImportacao = {
  ID: number
  NOME_ARQUIVO: string
  DATA_IMPORTACAO: string
  USUARIO_IMPORTACAO?: string | null
  REGISTROS_LIDOS: number
  REGISTROS_INSERIDOS: number
  REGISTROS_ATUALIZADOS: number
  REGISTROS_REJEITADOS: number
  STATUS_IMPORTACAO: string
}

export type CardConsolidadoCtx = {
  consolidado: Consolidado
  registros: Registro[]
  registrosFiltrados: Registro[]
}

export type CardConsolidado = {
  titulo: string
  cor?: string
  valor: (ctx: CardConsolidadoCtx) => string | number
}

export type ColunaRegistro = {
  key: string
  titulo: string
  align?: "left" | "center" | "right"
  headClassName?: string
  strong?: boolean
  numeric?: boolean
  render?: (item: Registro) => ReactNode
  title?: (item: Registro) => string
}

export type EdicaoConfig = {
  funcionalidade: string
  campos: CampoEditavel[]
  valoresIniciais: (item: Registro) => Record<string, string | number | null>
  montarBody: (valores: Record<string, string | number | null>) => Record<string, unknown>
}

export type ImportadorCsvProps = {
  titulo: string
  descricao: string
  breadcrumbs: { label: string; href?: string }[]
  recurso: string
  uploadTitulo: string
  uploadSubtitulo: string
  cardsConsolidado: CardConsolidado[]
  colunasRegistro: ColunaRegistro[]
  buscaRegistroKeys: string[]
  csvColunas: string[]
  csvNomeArquivo: string
  edicao?: EdicaoConfig
}

export function formatarNumero(valor?: string | number | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0" : numero.toLocaleString("pt-BR")
}

export function formatarData(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString("pt-BR")
}

export function formatarDataCurta(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleDateString("pt-BR")
}

function statusClass(status?: string) {
  if (status === "SUCESSO") return "bg-green-100 text-green-700"
  if (status === "SUCESSO_PARCIAL") return "bg-yellow-100 text-yellow-700"
  if (status === "ERRO") return "bg-red-100 text-red-700"
  return "bg-slate-100 text-slate-700"
}

function CardResultado({ titulo, valor, cor }: { titulo: string; valor: string | number; cor: string }) {
  return (
    <div className="min-h-[92px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${cor}`}>{valor}</p>
    </div>
  )
}

export function ImportadorCsv({
  titulo,
  descricao,
  breadcrumbs,
  recurso,
  uploadTitulo,
  uploadSubtitulo,
  cardsConsolidado,
  colunasRegistro,
  buscaRegistroKeys,
  csvColunas,
  csvNomeArquivo,
  edicao,
}: ImportadorCsvProps) {
  const { funcionalidades } = useCurrentUser()
  const podeEditar = edicao ? funcionalidades.includes(edicao.funcionalidade) : false

  const base = `${API_BASE_URL}/api/${recurso}`

  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDados, setLoadingDados] = useState(false)
  const [search, setSearch] = useState("")
  const [searchRegistros, setSearchRegistros] = useState("")
  const [notification, setNotification] = useState<Notification | null>(null)
  const [registroEditando, setRegistroEditando] = useState<Registro | null>(null)
  const [registroExcluindo, setRegistroExcluindo] = useState<Registro | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const [resultado, setResultado] = useState<ResultadoImportacao>({ lidos: 0, inseridos: 0, atualizados: 0, rejeitados: 0 })
  const [historico, setHistorico] = useState<HistoricoImportacao[]>([])
  const [consolidado, setConsolidado] = useState<Consolidado>(null)
  const [registros, setRegistros] = useState<Registro[]>([])

  async function carregarTudo() {
    setLoadingDados(true)
    try {
      const [consolidadoRes, historicoRes, registrosRes] = await Promise.allSettled([
        fetch(`${base}/consolidado`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${base}/importacoes`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${base}/registros`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      ])

      const consolidadoData = consolidadoRes.status === "fulfilled" ? consolidadoRes.value : null
      setConsolidado(Array.isArray(consolidadoData) ? consolidadoData[0] ?? null : consolidadoData ?? null)
      setHistorico(historicoRes.status === "fulfilled" && Array.isArray(historicoRes.value) ? historicoRes.value : [])
      setRegistros(registrosRes.status === "fulfilled" && Array.isArray(registrosRes.value) ? registrosRes.value : [])
    } finally {
      setLoadingDados(false)
    }
  }

  useEffect(() => {
    // Carga inicial das três listas assim que o recurso muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarTudo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurso])

  const historicoFiltrado = useMemo(() => {
    const termo = search.trim().toLowerCase()
    if (!termo) return historico
    return historico.filter((item) => String(item.NOME_ARQUIVO ?? "").toLowerCase().includes(termo))
  }, [historico, search])

  const registrosFiltrados = useMemo(() => {
    const termo = searchRegistros.trim().toLowerCase()
    if (!termo) return registros
    return registros.filter((item) =>
      buscaRegistroKeys.some((chave) => String(item[chave] ?? "").toLowerCase().includes(termo)),
    )
  }, [registros, searchRegistros, buscaRegistroKeys])

  const ultimaImportacao = historico?.[0]

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = event.target.files?.[0]
    if (selecionado) setFile(selecionado)
  }

  async function handleImport() {
    if (!file) {
      setNotification({ type: "warning", message: "Selecione um arquivo CSV." })
      return
    }
    try {
      setLoading(true)
      setNotification(null)

      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch(`${base}/importar`, { method: "POST", body: formData })
      const texto = await response.text()

      if (!response.ok) {
        setNotification({ type: "error", message: `Erro ${response.status}: ${texto}` })
        return
      }

      const data = JSON.parse(texto)
      setResultado({
        lidos: data.registros_lidos ?? data.lidos ?? 0,
        inseridos: data.registros_inseridos ?? data.inseridos ?? 0,
        atualizados: data.registros_atualizados ?? data.atualizados ?? 0,
        rejeitados: data.registros_rejeitados ?? data.rejeitados ?? 0,
      })

      await carregarTudo()
      setNotification({ type: "success", message: "Arquivo importado com sucesso!" })
    } catch (error) {
      setNotification({ type: "error", message: `Erro: ${String(error)}` })
    } finally {
      setLoading(false)
    }
  }

  function exportarRegistrosCSV() {
    if (registrosFiltrados.length === 0) {
      setNotification({ type: "warning", message: "Não há registros para exportar." })
      return
    }
    exportarCsv(csvColunas, registrosFiltrados, csvNomeArquivo)
  }

  async function salvarEdicaoRegistro(valores: Record<string, string | number | null>) {
    if (!registroEditando || !edicao) return

    const token = getToken()
    const id = registroEditando.ID
    const response = await fetch(`${base}/registro/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(edicao.montarBody(valores)),
    })

    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }

    const data = await response.json()
    setRegistros((atual) => atual.map((item) => (item.ID === id ? { ...item, ...(data.registro ?? {}) } : item)))
    setNotification({ type: "success", message: "Registro atualizado com sucesso!" })
  }

  async function excluirRegistro() {
    if (!registroExcluindo || !edicao) return
    const id = registroExcluindo.ID
    setExcluindo(true)
    try {
      const token = getToken()
      const response = await fetch(`${base}/registro/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) {
        const texto = await response.text()
        throw new Error(`Erro ${response.status}: ${texto}`)
      }
      setRegistros((atual) => atual.filter((item) => item.ID !== id))
      setNotification({ type: "success", message: "Registro excluído." })
      setRegistroExcluindo(null)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao excluir o registro.",
      })
    } finally {
      setExcluindo(false)
    }
  }

  const cardCtx: CardConsolidadoCtx = { consolidado, registros, registrosFiltrados }
  const totalColunas = colunasRegistro.length + (podeEditar ? 1 : 0)

  return (
    <div className="max-w-full space-y-5 overflow-x-hidden p-4 md:p-6">
      <PageHeader title={titulo} description={descricao} breadcrumbs={breadcrumbs} />

      <NotificationBanner notification={notification} />

      {/* Upload */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Importar Arquivo CSV</h2>
          </div>
          <Button variant="outline" onClick={carregarTudo} disabled={loadingDados} className="w-fit">
            <RefreshCw className={`h-4 w-4 ${loadingDados ? "animate-spin" : ""}`} />
            Atualizar dados
          </Button>
        </div>

        <label
          htmlFor="import-file-upload"
          className="flex cursor-pointer flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-primary hover:bg-primary/5 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{uploadTitulo}</p>
              <p className="text-sm text-slate-500">{uploadSubtitulo}</p>
            </div>
          </div>
          <div className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Selecionar Arquivo
          </div>
          <input id="import-file-upload" type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        </label>

        {file && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-primary">Arquivo Selecionado</p>
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
            <Button onClick={handleImport} disabled={loading} className="mt-3">
              {loading ? "Importando..." : "Importar Arquivo"}
            </Button>
          </div>
        )}
      </div>

      {/* Resultado da última importação nesta sessão */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardResultado titulo="Registros Lidos" valor={resultado.lidos} cor="text-primary" />
        <CardResultado titulo="Inseridos" valor={resultado.inseridos} cor="text-green-600" />
        <CardResultado titulo="Atualizados" valor={resultado.atualizados} cor="text-blue-600" />
        <CardResultado titulo="Rejeitados" valor={resultado.rejeitados} cor="text-red-600" />
      </div>

      {/* Consolidado (configurável) */}
      {cardsConsolidado.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cardsConsolidado.map((card) => (
            <CardResultado key={card.titulo} titulo={card.titulo} valor={card.valor(cardCtx)} cor={card.cor ?? "text-primary"} />
          ))}
        </div>
      )}

      {/* Histórico de importações */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Histórico de Importações</h2>
              <p className="text-sm text-slate-500">Registro das cargas executadas.</p>
            </div>
            <div className="relative w-full lg:w-[280px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar arquivo..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 pl-9"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[800px] text-xs">
            <TableHeader>
              <TableRow className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <TableHead className="px-3 py-2 text-left font-semibold">ID</TableHead>
                <TableHead className="px-3 py-2 text-left font-semibold">Arquivo</TableHead>
                <TableHead className="px-3 py-2 text-left font-semibold">Data</TableHead>
                <TableHead className="px-2 py-2 text-center font-semibold">Inseridos</TableHead>
                <TableHead className="px-2 py-2 text-center font-semibold">Atualizados</TableHead>
                <TableHead className="px-2 py-2 text-center font-semibold">Rejeitados</TableHead>
                <TableHead className="px-2 py-2 text-center font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historicoFiltrado.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState message="Nenhuma importação encontrada." />
                  </TableCell>
                </TableRow>
              ) : (
                historicoFiltrado.map((item) => (
                  <TableRow key={item.ID}>
                    <TableCell className="px-3 py-2 text-slate-600">{item.ID}</TableCell>
                    <TableCell className="max-w-[260px] truncate px-3 py-2 font-medium text-slate-700" title={item.NOME_ARQUIVO}>
                      <span className="mr-1 text-primary">📄</span>
                      {item.NOME_ARQUIVO}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-slate-600">{formatarData(item.DATA_IMPORTACAO)}</TableCell>
                    <TableCell className="px-2 py-2 text-center font-bold text-green-600">{item.REGISTROS_INSERIDOS}</TableCell>
                    <TableCell className="px-2 py-2 text-center font-bold text-blue-600">{item.REGISTROS_ATUALIZADOS}</TableCell>
                    <TableCell className="px-2 py-2 text-center font-bold text-red-600">{item.REGISTROS_REJEITADOS}</TableCell>
                    <TableCell className="px-2 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(item.STATUS_IMPORTACAO)}`}>
                        {item.STATUS_IMPORTACAO}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Última importação */}
      <div className="rounded-xl border-l-4 border-primary bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Última Importação</h2>
        </div>
        {ultimaImportacao ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Arquivo</p>
              <p className="truncate font-medium" title={ultimaImportacao.NOME_ARQUIVO}>{ultimaImportacao.NOME_ARQUIVO}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Data</p>
              <p className="font-medium">{formatarData(ultimaImportacao.DATA_IMPORTACAO)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Registros</p>
              <p className="font-medium">{ultimaImportacao.REGISTROS_LIDOS}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Status</p>
              <div className="flex items-center gap-2 font-semibold text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                {ultimaImportacao.STATUS_IMPORTACAO}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma importação realizada.</p>
        )}
      </div>

      {/* Registros importados */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Dados Importados</h2>
              <p className="text-sm text-slate-500">Consulta dos registros gravados na base.</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative w-full md:w-[320px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar registros..."
                  value={searchRegistros}
                  onChange={(event) => setSearchRegistros(event.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              <Button onClick={exportarRegistrosCSV} className="h-9 w-fit">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[900px] text-xs">
            <TableHeader>
              <TableRow className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                {colunasRegistro.map((coluna) => (
                  <TableHead
                    key={coluna.key}
                    className={`px-3 py-2 font-semibold ${
                      coluna.align === "center" ? "text-center" : coluna.align === "right" ? "text-right" : "text-left"
                    } ${coluna.headClassName ?? ""}`}
                  >
                    {coluna.titulo}
                  </TableHead>
                ))}
                {podeEditar && <TableHead className="px-2 py-2 text-center font-semibold">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalColunas}>
                    <EmptyState message="Nenhum registro encontrado." />
                  </TableCell>
                </TableRow>
              ) : (
                registrosFiltrados.map((item, indice) => (
                  <TableRow key={String(item.ID ?? indice)}>
                    {colunasRegistro.map((coluna) => {
                      const conteudo = coluna.render
                        ? coluna.render(item)
                        : coluna.numeric
                          ? formatarNumero(item[coluna.key] as string | number | null)
                          : String(item[coluna.key] ?? "-")
                      return (
                        <TableCell
                          key={coluna.key}
                          title={coluna.title ? coluna.title(item) : undefined}
                          className={`px-3 py-2 ${
                            coluna.align === "center" ? "text-center" : coluna.align === "right" ? "text-right" : ""
                          } ${coluna.numeric ? "font-semibold text-primary" : coluna.strong ? "font-medium text-slate-700" : "text-slate-600"} ${
                            coluna.title ? "max-w-[220px] truncate" : ""
                          }`}
                        >
                          {conteudo}
                        </TableCell>
                      )
                    })}
                    {podeEditar && (
                      <TableCell className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon-sm" title="Editar" onClick={() => setRegistroEditando(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Excluir"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setRegistroExcluindo(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {edicao && (
        <EditarRegistroModal
          open={registroEditando !== null}
          onOpenChange={(open) => {
            if (!open) setRegistroEditando(null)
          }}
          titulo={`Editar registro #${String(registroEditando?.ID ?? "")}`}
          campos={edicao.campos}
          valoresIniciais={registroEditando ? edicao.valoresIniciais(registroEditando) : {}}
          onSalvar={salvarEdicaoRegistro}
        />
      )}

      {edicao && (
        <Dialog open={registroExcluindo !== null} onOpenChange={(open) => !open && setRegistroExcluindo(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir registro #{String(registroExcluindo?.ID ?? "")}</DialogTitle>
              <DialogDescription>
                O registro importado será removido da base. Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRegistroExcluindo(null)} disabled={excluindo}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={excluirRegistro} disabled={excluindo}>
                <Trash2 className="h-4 w-4" />
                {excluindo ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
