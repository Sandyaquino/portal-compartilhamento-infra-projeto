"use client"

/* eslint-disable @typescript-eslint/no-explicit-any --
   Os endpoints de dashboard devolvem agregações de forma dinâmica (colunas
   variam por perfil); `Record<string, any>` aqui é intencional, como no
   código anterior que este componente substituiu. */

import { useEffect, useMemo, useState, type ComponentType, type ElementType, type ReactNode } from "react"
import { Download, Filter, Pencil, RefreshCcw, Search, Trash2, XCircle } from "lucide-react"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { KpiCard } from "@/components/comercial/kpi-card"
import { EditarRegistroModal, type CampoEditavel } from "@/components/operacao/editar-registro-modal"
import { useCurrentUser } from "@/hooks/use-current-user"
import { getToken } from "@/lib/session"

// ------------------------------------------------------------------
// Framework único dos dashboards de campo (Operação). Antes, Fiscalização
// (técnicos) e Execução (turmas) eram duas telas de ~1.200 linhas cada com
// a mesma casca (cabeçalho, filtros, KPIs, tabela de registros editável,
// pipeline de fetch) copiada. Aqui a casca é uma só, parametrizada por
// `perfil`; cada dashboard só descreve seus KPIs, filtros, colunas e as
// seções analíticas (gráficos) via o componente `Secoes`.
// ------------------------------------------------------------------

const PERIODOS = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "ultimos_7_dias", label: "Últimos 7 dias" },
  { value: "ultimos_30_dias", label: "Últimos 30 dias" },
  { value: "mes_atual", label: "Mês atual" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "personalizado", label: "Personalizado" },
]

const GRID_XL: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
}

export type Registro = Record<string, any>

export type DadosDashboard = {
  resumo: Record<string, any>
  evolucao: any[]
  registros: Registro[]
  extra: Record<string, any[]>
}

export type KpiSpec =
  | {
      key: string
      title: string
      value: string | number
      subtitle: string
      icon: ElementType
      color: string
    }
  | { key: string; render: ReactNode }

export type FiltroDef =
  | {
      tipo: "select"
      campo: string
      label: string
      allLabel: string
      opcoes: string[] | ((dados: DadosDashboard) => string[])
    }
  | { tipo: "input"; campo: string; label: string; placeholder?: string }

export type ColunaRegistro = {
  key: string
  titulo: string
  align?: "left" | "center"
  strong?: boolean
  numeric?: boolean
  render?: (item: Registro) => ReactNode
}

export type EdicaoRegistro = {
  funcionalidade: string
  recurso: string
  campos: CampoEditavel[]
  montarBody: (valores: Record<string, string | number | null>) => Record<string, unknown>
  valoresIniciais: (item: Registro) => Record<string, string | number | null>
}

export type DashboardCampoConfig = {
  perfil: "tecnico" | "turma"
  titulo: string
  descricao: string
  breadcrumbLabel: string
  recursoDashboard: string
  breakdownEndpoints: string[]
  registrosEndpoint: string
  filtros: FiltroDef[]
  filtrosIniciais: Record<string, string>
  montarQuery: (filtros: Record<string, string>) => string
  normalizarResumo?: (bruto: Record<string, any>) => Record<string, any>
  normalizarEvolucao?: (item: Record<string, any>) => any
  resumoInicial: Record<string, any>
  kpis: (dados: DadosDashboard) => KpiSpec[][]
  Secoes: ComponentType<{ dados: DadosDashboard }>
  registros: {
    tituloTabela: string
    descricaoTabela: string
    colunas: ColunaRegistro[]
    buscaKeys: string[]
    csvColunas: string[]
    csvNomeArquivo: string
    edicao: EdicaoRegistro
  }
  rodape: string
}

// helper reutilizado pelos wrappers
export function formatarNumeroBR(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0" : numero.toLocaleString("pt-BR")
}

export function DashboardCampo({
  config,
  mostrarRegistros = false,
}: {
  config: DashboardCampoConfig
  mostrarRegistros?: boolean
}) {
  const { funcionalidades } = useCurrentUser()
  const podeEditar = funcionalidades.includes(config.registros.edicao.funcionalidade)

  const [dados, setDados] = useState<DadosDashboard>({
    resumo: config.resumoInicial,
    evolucao: [],
    registros: [],
    extra: {},
  })
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState<Record<string, string>>(config.filtrosIniciais)
  const [buscaRegistros, setBuscaRegistros] = useState("")
  const [notification, setNotification] = useState<Notification | null>(null)
  const [registroEditando, setRegistroEditando] = useState<Registro | null>(null)
  const [registroExcluindo, setRegistroExcluindo] = useState<Registro | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  async function carregar(filtrosAplicados = filtros) {
    setLoading(true)

    const query = config.montarQuery(filtrosAplicados)
    const sufixo = query ? `?${query}` : ""
    const base = `${API_BASE_URL}/api/${config.recursoDashboard}`

    const [resumoRes, evolucaoRes, registrosRes, ...breakdownRes] = await Promise.all([
      fetchJson<Record<string, any>>(`${base}/resumo${sufixo}`),
      fetchJson<any[]>(`${base}/evolucao${sufixo}`),
      fetchJson<Registro[]>(`${API_BASE_URL}/api/${config.registrosEndpoint}${sufixo}`),
      ...config.breakdownEndpoints.map((nome) => fetchJson<any[]>(`${base}/${nome}${sufixo}`)),
    ])

    const extra: Record<string, any[]> = {}
    config.breakdownEndpoints.forEach((nome, i) => {
      extra[nome] = Array.isArray(breakdownRes[i]) ? (breakdownRes[i] as any[]) : []
    })

    setDados({
      resumo: resumoRes
        ? config.normalizarResumo
          ? config.normalizarResumo(resumoRes)
          : { ...config.resumoInicial, ...resumoRes }
        : config.resumoInicial,
      evolucao: Array.isArray(evolucaoRes)
        ? config.normalizarEvolucao
          ? evolucaoRes.map(config.normalizarEvolucao)
          : evolucaoRes
        : [],
      registros: Array.isArray(registrosRes) ? registrosRes : [],
      extra,
    })
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar(config.filtrosIniciais)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.recursoDashboard])

  function atualizarFiltro(campo: string, valor: string) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }))
  }

  function limparFiltros() {
    setFiltros(config.filtrosIniciais)
    carregar(config.filtrosIniciais)
  }

  const registrosFiltrados = useMemo(() => {
    const termo = buscaRegistros.trim().toLowerCase()
    if (!termo) return dados.registros
    return dados.registros.filter((item) =>
      config.registros.buscaKeys.some((chave) => String(item[chave] ?? "").toLowerCase().includes(termo)),
    )
  }, [dados.registros, buscaRegistros, config.registros.buscaKeys])

  function exportarRegistrosCSV() {
    if (registrosFiltrados.length === 0) {
      setNotification({ type: "warning", message: "Não há registros para exportar." })
      return
    }
    exportarCsv(config.registros.csvColunas, registrosFiltrados, config.registros.csvNomeArquivo)
  }

  async function salvarEdicaoRegistro(valores: Record<string, string | number | null>) {
    if (!registroEditando) return
    const token = getToken()
    const id = registroEditando.ID
    const response = await fetch(`${API_BASE_URL}/api/${config.registros.edicao.recurso}/registro/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(config.registros.edicao.montarBody(valores)),
    })
    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }
    const data = await response.json()
    setDados((atual) => ({
      ...atual,
      registros: atual.registros.map((item) => (item.ID === id ? { ...item, ...(data.registro ?? {}) } : item)),
    }))
    setNotification({ type: "success", message: "Registro atualizado com sucesso!" })
  }

  async function excluirRegistro() {
    if (!registroExcluindo) return
    const id = registroExcluindo.ID
    setExcluindo(true)
    try {
      const token = getToken()
      const response = await fetch(`${API_BASE_URL}/api/${config.registros.edicao.recurso}/registro/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) {
        const texto = await response.text()
        throw new Error(`Erro ${response.status}: ${texto}`)
      }
      setDados((atual) => ({ ...atual, registros: atual.registros.filter((item) => item.ID !== id) }))
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

  const linhasKpi = config.kpis(dados)
  const totalColunas = config.registros.colunas.length + (podeEditar ? 1 : 0)

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <PageHeader
        title={config.titulo}
        description={config.descricao}
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Operação", href: "/operacao" },
          { label: config.breadcrumbLabel },
        ]}
      />

      <NotificationBanner notification={notification} />

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Filter className="h-5 w-5" />
          <h2 className="font-semibold text-slate-900">Filtros do acompanhamento</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <FilterField label="Período">
            <Select
              value={filtros.periodo}
              onValueChange={(valor) => valor !== null && atualizarFiltro("periodo", valor)}
            >
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Data inicial">
            <Input
              type="date"
              className="h-10"
              value={filtros.dataInicial ?? ""}
              disabled={filtros.periodo !== "personalizado"}
              onChange={(event) => atualizarFiltro("dataInicial", event.target.value)}
            />
          </FilterField>

          <FilterField label="Data final">
            <Input
              type="date"
              className="h-10"
              value={filtros.dataFinal ?? ""}
              disabled={filtros.periodo !== "personalizado"}
              onChange={(event) => atualizarFiltro("dataFinal", event.target.value)}
            />
          </FilterField>

          {config.filtros.map((filtro) => {
            if (filtro.tipo === "input") {
              return (
                <FilterField key={filtro.campo} label={filtro.label}>
                  <Input
                    className="h-10"
                    value={filtros[filtro.campo] ?? ""}
                    placeholder={filtro.placeholder}
                    onChange={(event) => atualizarFiltro(filtro.campo, event.target.value)}
                  />
                </FilterField>
              )
            }
            const opcoes = typeof filtro.opcoes === "function" ? filtro.opcoes(dados) : filtro.opcoes
            return (
              <FilterField key={filtro.campo} label={filtro.label}>
                <Select
                  value={filtros[filtro.campo] || "__all__"}
                  onValueChange={(valor) =>
                    atualizarFiltro(filtro.campo, valor === "__all__" || valor === null ? "" : valor)
                  }
                >
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{filtro.allLabel}</SelectItem>
                    {opcoes.map((opcao) => (
                      <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )
          })}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={limparFiltros}>
            <XCircle className="h-4 w-4" />
            Limpar filtros
          </Button>
          <Button type="button" onClick={() => carregar(filtros)} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar dashboard
          </Button>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Carregando indicadores...
        </div>
      )}

      {/* KPIs */}
      {linhasKpi.map((linha, i) => (
        <div
          key={`kpi-linha-${i}`}
          className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${GRID_XL[Math.min(linha.length, 6)] ?? "xl:grid-cols-4"}`}
        >
          {linha.map((kpi) =>
            "render" in kpi ? (
              <div key={kpi.key}>{kpi.render}</div>
            ) : (
              <KpiCard
                key={kpi.key}
                title={kpi.title}
                value={kpi.value}
                subtitle={kpi.subtitle}
                icon={kpi.icon}
                color={kpi.color}
              />
            ),
          )}
        </div>
      ))}

      {/* Seções analíticas específicas do perfil */}
      <config.Secoes dados={dados} />

      {/* Registros de campo (editáveis conforme o perfil) */}
      {mostrarRegistros && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{config.registros.tituloTabela}</h2>
              <p className="text-sm text-slate-500">{config.registros.descricaoTabela}</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative w-full md:w-[360px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={buscaRegistros}
                  onChange={(event) => setBuscaRegistros(event.target.value)}
                  placeholder="Pesquisar registros..."
                  className="h-10 pl-9"
                />
              </div>
              <Button type="button" onClick={exportarRegistrosCSV} className="h-10 w-fit">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1100px] text-xs">
              <TableHeader>
                <TableRow className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  {config.registros.colunas.map((coluna) => (
                    <TableHead
                      key={coluna.key}
                      className={`px-3 py-2 font-semibold ${coluna.align === "center" ? "text-center" : "text-left"}`}
                    >
                      {coluna.titulo}
                    </TableHead>
                  ))}
                  {podeEditar && <TableHead className="px-3 py-2 text-center font-semibold">Ações</TableHead>}
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
                      {config.registros.colunas.map((coluna) => (
                        <TableCell
                          key={coluna.key}
                          className={`px-3 py-2 ${coluna.align === "center" ? "text-center" : ""} ${
                            coluna.numeric
                              ? "font-semibold text-primary"
                              : coluna.strong
                                ? "font-medium text-slate-800"
                                : "text-slate-600"
                          }`}
                        >
                          {coluna.render
                            ? coluna.render(item)
                            : coluna.numeric
                              ? formatarNumeroBR(item[coluna.key])
                              : String(item[coluna.key] ?? "-")}
                        </TableCell>
                      ))}
                      {podeEditar && (
                        <TableCell className="px-3 py-2">
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
        </section>
      )}

      <p className="text-xs text-slate-500">{config.rodape}</p>

      <EditarRegistroModal
        open={registroEditando !== null}
        onOpenChange={(open) => {
          if (!open) setRegistroEditando(null)
        }}
        titulo={`Editar registro #${String(registroEditando?.ID ?? "")}`}
        campos={config.registros.edicao.campos}
        valoresIniciais={registroEditando ? config.registros.edicao.valoresIniciais(registroEditando) : {}}
        onSalvar={salvarEdicaoRegistro}
      />

      <Dialog open={registroExcluindo !== null} onOpenChange={(open) => !open && setRegistroExcluindo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir registro #{String(registroExcluindo?.ID ?? "")}</DialogTitle>
            <DialogDescription>
              Esta ação remove o apontamento de campo e recalcula os indicadores do dashboard. Não pode ser desfeita.
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
    </div>
  )
}
