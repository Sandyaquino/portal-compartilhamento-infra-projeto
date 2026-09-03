"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, MapPinned, Plus, Users } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { EstatItem } from "@/components/projetos/projeto-ui"
import { NovaCarteiraModal } from "@/components/operacao/nova-carteira-modal"
import { API_BASE_URL } from "@/lib/config"
import {
  CLASSE_STATUS_CARTEIRA,
  LABEL_STATUS_CARTEIRA,
  type Carteira,
} from "@/lib/types/carteira"

function formatarData(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR")
}

export default function CarteiraServicoPage() {
  const router = useRouter()
  const [carteiras, setCarteiras] = useState<Carteira[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNova, setModalNova] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/carteira`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar as carteiras`)
      setCarteiras(await res.json())
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar as carteiras",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const totalOs = carteiras.reduce((s, c) => s + (c.QTD_OS ?? 0), 0)
  const rascunhos = carteiras.filter((c) => c.STATUS === "RASCUNHO").length

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Carteira de Serviço"
        description="Roteiro de trabalho das equipes de campo — geração diária, semanal ou mensal, manual ou automática, com otimização de rota."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Operação", href: "/operacao" },
          { label: "Carteira de Serviço" },
        ]}
        actions={
          <Button type="button" onClick={() => setModalNova(true)}>
            <Plus className="h-4 w-4" />
            Nova carteira
          </Button>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
        <EstatItem label="Carteiras" valor={carteiras.length} tom="primary" sub="geradas" />
        <EstatItem label="OS planejadas" valor={totalOs.toLocaleString("pt-BR")} sub="somando todas" />
        <EstatItem label="Rascunhos" valor={rascunhos} tom={rascunhos > 0 ? "amber" : "slate"} sub="aguardando publicação" />
        <EstatItem label="Publicadas" valor={carteiras.filter((c) => c.STATUS === "PUBLICADA").length} tom="green" sub="em execução" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[980px] text-sm">
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <TableHead className="px-5 py-3 font-semibold">Carteira</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Período</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Modo / lógica</TableHead>
                <TableHead className="px-5 py-3 font-semibold">EPS</TableHead>
                <TableHead className="px-5 py-3 font-semibold text-right">Equipes</TableHead>
                <TableHead className="px-5 py-3 font-semibold text-right">OS</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">Carregando...</TableCell></TableRow>
              ) : carteiras.length === 0 ? (
                <TableRow><TableCell colSpan={7}><EmptyState message="Nenhuma carteira gerada ainda. Clique em “Nova carteira”." /></TableCell></TableRow>
              ) : (
                carteiras.map((c) => (
                  <TableRow
                    key={c.ID_CARTEIRA}
                    className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    onClick={() => router.push(`/operacao/carteira/${c.ID_CARTEIRA}`)}
                  >
                    <TableCell className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{c.TITULO}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <CalendarRange className="h-3 w-3" /> {c.FREQUENCIA.toLowerCase()}
                      </p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-slate-600">
                      {formatarData(c.DATA_INICIO)} <span className="text-slate-400">a</span> {formatarData(c.DATA_FIM)}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-slate-600">
                      {c.MODO === "AUTOMATICA" ? (
                        <span className="text-xs">Auto · <span className="font-medium">{c.ESTRATEGIA}</span></span>
                      ) : (
                        <span className="text-xs">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-slate-600">{c.EPS ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-slate-700"><Users className="h-3.5 w-3.5 text-slate-400" />{c.QTD_EQUIPES}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800"><MapPinned className="h-3.5 w-3.5 text-slate-400" />{(c.QTD_OS ?? 0).toLocaleString("pt-BR")}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_STATUS_CARTEIRA[c.STATUS]}`}>
                        {LABEL_STATUS_CARTEIRA[c.STATUS]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <NovaCarteiraModal
        open={modalNova}
        onOpenChange={setModalNova}
        onCriada={(id) => router.push(`/operacao/carteira/${id}`)}
      />
    </div>
  )
}
