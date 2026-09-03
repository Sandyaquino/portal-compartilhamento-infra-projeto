"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { ArrowLeft, Download, ExternalLink, FileSpreadsheet, Map as MapIcon, SlidersHorizontal, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NovaCarteiraModal } from "@/components/operacao/nova-carteira-modal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EstatItem, SecaoCard } from "@/components/projetos/projeto-ui"
import { API_BASE_URL } from "@/lib/config"
import { baixarCarteiraExcel } from "@/lib/exports/carteira-excel"
import { baixarCarteiraMapaHtml } from "@/lib/exports/carteira-mapa-html"
import {
  CLASSE_STATUS_CARTEIRA,
  LABEL_STATUS_CARTEIRA,
  type CarteiraDetalhe,
  type CriteriosCarteira,
  type StatusCarteira,
} from "@/lib/types/carteira"

const CarteiraMapaPreview = dynamic(() => import("@/components/operacao/carteira-mapa-preview"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-500">Carregando mapa...</div>,
})

function fmt(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR")
}

export default function CarteiraDetalhePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [det, setDet] = useState<CarteiraDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [modalRegerar, setModalRegerar] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/carteira/${id}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar a carteira`)
      setDet(await res.json())
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar a carteira" })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function mudarStatus(status: StatusCarteira) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/carteira/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("Não foi possível mudar o status")
      await carregar()
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao mudar o status" })
    }
  }

  async function excluir() {
    setExcluindo(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/carteira/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Não foi possível excluir a carteira")
      router.push("/operacao/carteira")
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir a carteira" })
      setExcluindo(false)
      setConfirmarExclusao(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Carregando...</div>
  if (!det) {
    return (
      <div className="p-6">
        <EmptyState message="Carteira não encontrada." className="rounded-xl border border-slate-200 bg-slate-50 p-8" />
      </div>
    )
  }

  const { carteira: c, os, resumo, por_dia, por_equipe } = det
  const dias = [...new Set(os.map((o) => o.DATA_PREVISTA))].sort()

  type ParamsCarteira = {
    ids_equipes?: number[]
    municipios?: string[]
    localidades?: number[]
    barramentos?: string[]
    params?: Record<string, number>
  }
  const parametros: ParamsCarteira = (() => {
    try {
      return c.PARAMETROS_JSON ? (JSON.parse(c.PARAMETROS_JSON) as ParamsCarteira) : {}
    } catch {
      return {}
    }
  })()
  const criterios: CriteriosCarteira = {
    id_carteira: c.ID_CARTEIRA,
    titulo: c.TITULO,
    frequencia: c.FREQUENCIA,
    data_inicio: c.DATA_INICIO,
    modo: c.MODO,
    estrategia: c.ESTRATEGIA ?? undefined,
    id_eps: c.ID_EPS,
    ids_equipes: parametros.ids_equipes ?? [],
    qtd_postes_dia: c.QTD_POSTES_DIA,
    municipios: parametros.municipios ?? [],
    localidades: parametros.localidades ?? [],
    barramentos: parametros.barramentos ?? [],
    params: parametros.params ?? {},
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <PageHeader
        title={c.TITULO}
        description={`${fmt(c.DATA_INICIO)} a ${fmt(c.DATA_FIM)} · ${c.MODO === "AUTOMATICA" ? `automática (${c.ESTRATEGIA})` : "manual"} · EPS ${c.EPS ?? "—"}`}
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Operação", href: "/operacao" },
          { label: "Carteira de Serviço", href: "/operacao/carteira" },
          { label: c.TITULO },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/operacao/carteira")}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button type="button" variant="outline" onClick={() => baixarCarteiraExcel(det)}>
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </Button>
            <Button type="button" variant="outline" onClick={() => baixarCarteiraMapaHtml(det)}>
              <MapIcon className="h-4 w-4" /> Exportar Mapa (.html)
            </Button>
            {c.STATUS === "RASCUNHO" && (
              <>
                <Button type="button" variant="outline" onClick={() => setModalRegerar(true)}>
                  <SlidersHorizontal className="h-4 w-4" /> Redefinir critérios
                </Button>
                <Button type="button" onClick={() => mudarStatus("PUBLICADA")}>
                  <Download className="h-4 w-4" /> Publicar
                </Button>
              </>
            )}
            <Button type="button" variant="outline" className="text-red-700" onClick={() => setConfirmarExclusao(true)}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 lg:grid-cols-6 sm:divide-y-0">
        <EstatItem label="OS" valor={resumo.qtd_os.toLocaleString("pt-BR")} tom="primary" sub={`${c.QTD_POSTES_DIA}/dia por equipe`} />
        <EstatItem label="Dias úteis" valor={resumo.qtd_dias} />
        <EstatItem label="Equipes" valor={resumo.qtd_equipes} />
        <EstatItem label="Municípios" valor={resumo.qtd_municipios} />
        <EstatItem label="Sem provedor" valor={resumo.sem_provedor.toLocaleString("pt-BR")} tom="amber" />
        <EstatItem
          label="Status"
          valor={
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${CLASSE_STATUS_CARTEIRA[c.STATUS]}`}>
              {LABEL_STATUS_CARTEIRA[c.STATUS]}
            </span>
          }
        />
      </div>

      <SecaoCard titulo="Rota no mapa" descricao="Postes coloridos por equipe; ponto cheio = sem provedor. O export .html traz satélite, camadas e filtro por dia.">
        {modalRegerar ? (
          <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
            Mapa oculto enquanto você redefine os critérios.
          </div>
        ) : (
          <CarteiraMapaPreview os={os} />
        )}
      </SecaoCard>

      <SecaoCard titulo="Distribuição" descricao="Como a carteira ficou por dia e por equipe">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Por dia</p>
            <ul className="space-y-1 text-sm">
              {por_dia.map((d) => (
                <li key={d.data} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                  <span>Dia {d.dia_indice} · {fmt(d.data)}</span>
                  <span className="text-slate-500">{d.qtd} OS · {d.municipios.join(", ")} · {d.equipes.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Por equipe</p>
            <ul className="space-y-1 text-sm">
              {por_equipe.map((e) => (
                <li key={e.nome} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                  <span>{e.nome}</span>
                  <span className="text-slate-500">{e.qtd} OS · {e.municipios.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SecaoCard>

      <SecaoCard titulo={`Ordens de serviço (${os.length})`} descricao="Sequência da rota. Cada OS tem link para Google Maps e Waze.">
        <div className="space-y-4">
          {dias.map((dia) => {
            const doDia = os.filter((o) => o.DATA_PREVISTA === dia)
            const diaIdx = doDia[0]?.DIA_INDICE
            return (
              <div key={dia} className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <span>Dia {diaIdx} — {fmt(dia)}</span>
                  <span>{doDia.length} paradas</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-sm">
                    <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">#</th>
                        <th className="px-3 py-2 text-left font-semibold">Equipe</th>
                        <th className="px-3 py-2 text-left font-semibold">Município / localidade</th>
                        <th className="px-3 py-2 text-left font-semibold">Barramento</th>
                        <th className="px-3 py-2 text-left font-semibold">Provedor</th>
                        <th className="px-3 py-2 text-left font-semibold">Coordenadas</th>
                        <th className="px-3 py-2 text-left font-semibold">Navegação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doDia.map((o) => (
                        <tr key={o.ID_CARTEIRA_OS ?? o.SEQ} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-500">{o.ORDEM_NO_DIA}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">{o.NOME_EQUIPE}</td>
                          <td className="px-3 py-2 text-slate-600">{o.MUNICIPIO}{o.LOCALIDADE ? ` · ${o.LOCALIDADE}` : ""}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{o.DE_BARRAMENTO}</td>
                          <td className="px-3 py-2">
                            {o.TEM_PROVEDOR === "N" ? (
                              <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">sem provedor</span>
                            ) : (
                              <span className="rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-700">com provedor</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{o.LATITUDE.toFixed(6)}, {o.LONGITUDE.toFixed(6)}</td>
                          <td className="px-3 py-2">
                            <span className="flex gap-2 text-xs">
                              <a href={o.LINK_GMAPS} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> Maps
                              </a>
                              <a href={o.LINK_WAZE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> Waze
                              </a>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </SecaoCard>

      <NovaCarteiraModal
        open={modalRegerar}
        onOpenChange={setModalRegerar}
        onCriada={() => {
          setModalRegerar(false)
          carregar()
        }}
        inicial={modalRegerar ? criterios : null}
      />

      <Dialog open={confirmarExclusao} onOpenChange={(o) => !excluindo && setConfirmarExclusao(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir carteira</DialogTitle>
            <DialogDescription>
              A carteira <strong>{c.TITULO}</strong> e as {resumo.qtd_os} ordens de serviço serão removidas. Esta ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmarExclusao(false)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={excluir} disabled={excluindo}>
              {excluindo ? "Excluindo..." : "Excluir carteira"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
