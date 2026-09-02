"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, HardHat, MapPinned, XCircle } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
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
import { API_BASE_URL } from "@/lib/config"
import {
  LABEL_STATUS_ACAO,
  LABEL_TIPO_ACAO,
  type AcaoPoste,
  type StatusAcao,
  type TipoAcao,
} from "@/lib/types/postes"

const FILTRO_TODOS = "__todos__"

const CLASSE_STATUS: Record<StatusAcao, string> = {
  ABERTA: "bg-blue-100 text-blue-700 border-blue-200",
  CONCLUIDA: "bg-green-100 text-green-700 border-green-200",
  CANCELADA: "bg-slate-100 text-slate-600 border-slate-200",
}

const CLASSE_TIPO: Record<TipoAcao, string> = {
  FISCALIZACAO: "bg-red-100 text-red-700 border-red-200",
  ORDENAMENTO: "bg-amber-100 text-amber-700 border-amber-200",
  REMOCAO: "bg-purple-100 text-purple-700 border-purple-200",
}

function formatarData(valor: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return "-"
  return data.toLocaleDateString("pt-BR")
}

export default function AcoesMapaPage() {
  const [acoes, setAcoes] = useState<AcaoPoste[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)

  const [filtroTipo, setFiltroTipo] = useState<TipoAcao | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<StatusAcao | null>("ABERTA")

  // Execução de campo por ação (Operação): quanto de cada ação já foi a campo.
  const [execucao, setExecucao] = useState<Record<number, { registros: number; postes_executados: number; ultima_execucao: string | null }>>({})

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/execucao/acoes-resumo`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Array<{ ID_ACAO: number; registros: number; postes_executados: number; ultima_execucao: string | null }>) => {
        const mapa: Record<number, { registros: number; postes_executados: number; ultima_execucao: string | null }> = {}
        for (const item of Array.isArray(lista) ? lista : []) {
          mapa[item.ID_ACAO] = {
            registros: item.registros,
            postes_executados: item.postes_executados,
            ultima_execucao: item.ultima_execucao,
          }
        }
        setExecucao(mapa)
      })
      .catch(() => setExecucao({}))
  }, [])

  async function carregar() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroTipo) params.set("tipo", filtroTipo)
      if (filtroStatus) params.set("status", filtroStatus)

      const response = await fetch(`${API_BASE_URL}/api/postes/acoes?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao carregar as ações`)
      setAcoes(await response.json())
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar as ações do mapa",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, filtroStatus])

  async function mudarStatus(acao: AcaoPoste, status: StatusAcao) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/postes/acoes/${acao.ID_ACAO}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error(`Erro ${response.status} ao atualizar a ação`)
      setNotification({ type: "success", message: `Ação marcada como ${LABEL_STATUS_ACAO[status].toLowerCase()}.` })
      await carregar()
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao atualizar a ação",
      })
    }
  }

  const linkMapa = useMemo(
    () => (acao: AcaoPoste) => {
      if (acao.MIN_X == null || acao.MAX_X == null || acao.MIN_Y == null || acao.MAX_Y == null) {
        return "/mapa-postes"
      }
      const params = new URLSearchParams({
        min_x: String(acao.MIN_X),
        max_x: String(acao.MAX_X),
        min_y: String(acao.MIN_Y),
        max_y: String(acao.MAX_Y),
      })
      return `/mapa-postes?${params.toString()}`
    },
    [],
  )

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Ações do Mapa"
        description="Fiscalizações e ordenamentos criados a partir do Mapa de Postes."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Mapa de Postes", href: "/mapa-postes" },
          { label: "Ações do Mapa" },
        ]}
        actions={
          <Link href="/mapa-postes">
            <Button type="button" variant="outline">Voltar ao mapa</Button>
          </Link>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-48">
          <Select
            value={filtroTipo ?? FILTRO_TODOS}
            onValueChange={(v) => setFiltroTipo(v === FILTRO_TODOS || v === null ? null : (v as TipoAcao))}
          >
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODOS}>Todos os tipos</SelectItem>
              {(Object.keys(LABEL_TIPO_ACAO) as TipoAcao[]).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>{LABEL_TIPO_ACAO[tipo]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-48">
          <Select
            value={filtroStatus ?? FILTRO_TODOS}
            onValueChange={(v) => setFiltroStatus(v === FILTRO_TODOS || v === null ? null : (v as StatusAcao))}
          >
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTRO_TODOS}>Todos os status</SelectItem>
              {(Object.keys(LABEL_STATUS_ACAO) as StatusAcao[]).map((status) => (
                <SelectItem key={status} value={status}>{LABEL_STATUS_ACAO[status]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Carregando ações...
        </div>
      )}

      {!loading && acoes.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <EmptyState message="Nenhuma ação encontrada com esses filtros." />
        </div>
      )}

      {!loading && acoes.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Postes</TableHead>
                <TableHead>Execução em campo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {acoes.map((acao) => (
                <TableRow key={acao.ID_ACAO}>
                  <TableCell className="max-w-[260px] truncate font-medium text-slate-800" title={acao.TITULO ?? undefined}>
                    {acao.TITULO || `Ação #${acao.ID_ACAO}`}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_TIPO[acao.TIPO]}`}>
                      {LABEL_TIPO_ACAO[acao.TIPO]}
                    </span>
                  </TableCell>
                  <TableCell>{acao.RESPONSAVEL || "Não atribuído"}</TableCell>
                  <TableCell>{formatarData(acao.PRAZO)}</TableCell>
                  <TableCell>{acao.QTD_POSTES.toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    {execucao[acao.ID_ACAO] ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs text-slate-700"
                        title={`Última execução em ${formatarData(execucao[acao.ID_ACAO].ultima_execucao)}`}
                      >
                        <HardHat className="h-3.5 w-3.5 text-slate-400" />
                        <strong>{execucao[acao.ID_ACAO].registros}</strong> reg ·{" "}
                        {execucao[acao.ID_ACAO].postes_executados.toLocaleString("pt-BR")} postes
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sem execução</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_STATUS[acao.STATUS]}`}>
                      {LABEL_STATUS_ACAO[acao.STATUS]}
                    </span>
                  </TableCell>
                  <TableCell>{formatarData(acao.CREATED_AT)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={linkMapa(acao)}>
                        <Button type="button" variant="ghost" size="icon-sm" title="Ver no mapa">
                          <MapPinned className="h-4 w-4" />
                        </Button>
                      </Link>
                      {acao.STATUS === "ABERTA" && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Marcar como concluída"
                            onClick={() => mudarStatus(acao, "CONCLUIDA")}
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Cancelar"
                            onClick={() => mudarStatus(acao, "CANCELADA")}
                          >
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
