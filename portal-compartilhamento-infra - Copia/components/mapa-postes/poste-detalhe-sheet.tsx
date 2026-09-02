"use client"

import { useEffect, useState } from "react"
import { ClipboardList, ExternalLink, MapPin, ShieldAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { API_BASE_URL } from "@/lib/config"
import {
  formatarCnpj,
  nivelSaturacao,
  SATURACAO_INFO,
  type PosteMapa,
  type PosteOcupacao,
  type TipoAcao,
} from "@/lib/types/postes"

type PosteDetalheSheetProps = {
  poste: PosteMapa | null
  onOpenChange: (open: boolean) => void
  onAbrirAcao: (poste: PosteMapa, tipo: TipoAcao) => void
}

// Painel restrito à área do mapa (renderizado como filho do wrapper `relative`
// que envolve o MapaMapLibre em page.tsx) - de propósito não usa o componente
// Sheet global, que é um overlay fixo de página inteira e cobria o cabeçalho
// e os cards de resumo por cima.
export function PosteDetalheSheet({ poste, onOpenChange, onAbrirAcao }: PosteDetalheSheetProps) {
  const [ocupacoes, setOcupacoes] = useState<PosteOcupacao[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!poste) return

    let cancelado = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setErro(null)

    fetch(`${API_BASE_URL}/api/postes/${encodeURIComponent(poste.BARRAMENTO)}/ocupacoes`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Erro ${response.status} ao carregar as ocupações`)
        return response.json()
      })
      .then((dados) => {
        if (!cancelado) setOcupacoes(dados)
      })
      .catch((error) => {
        if (!cancelado) setErro(error instanceof Error ? error.message : "Erro ao carregar as ocupações")
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })

    return () => {
      cancelado = true
    }
  }, [poste])

  if (!poste) return null

  const linkStreetView = `https://www.google.com/maps?layer=c&cbll=${poste.Y},${poste.X}`
  const linkMapa = `https://www.google.com/maps?q=${poste.Y},${poste.X}`

  // O backend real ainda não expõe capacidade/pontos ocupados por poste
  // (só o mock). Sem esse dado, escondemos o painel de saturação.
  const temSaturacao = poste.CAPACIDADE != null && poste.CAPACIDADE > 0 && poste.PONTOS_OCUPADOS != null
  const nivel = nivelSaturacao(poste.PONTOS_OCUPADOS, poste.CAPACIDADE)
  const infoSaturacao = SATURACAO_INFO[nivel]
  const percentualOcupacao =
    temSaturacao ? Math.round(((poste.PONTOS_OCUPADOS ?? 0) / (poste.CAPACIDADE ?? 1)) * 100) : 0

  return (
    <div className="absolute inset-y-0 right-0 z-[1000] flex w-full flex-col border-l border-slate-200 bg-white shadow-xl sm:w-[360px]">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">Poste {poste.BARRAMENTO}</h2>
          <p className="text-xs text-slate-500">
            {poste.Y.toFixed(6)}, {poste.X.toFixed(6)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {temSaturacao && (
          <div className="mb-4 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saturação</span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: infoSaturacao.cor }}
              >
                {infoSaturacao.label}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1 text-sm text-slate-700">
              <strong className="text-lg text-slate-900">{poste.PONTOS_OCUPADOS}</strong>
              <span>/ {poste.CAPACIDADE} pontos de fixação ({percentualOcupacao}%)</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, percentualOcupacao)}%`, backgroundColor: infoSaturacao.cor }}
              />
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <a
            href={linkStreetView}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver no Street View
          </a>
          <a
            href={linkMapa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <MapPin className="h-3.5 w-3.5" />
            Ver no Google Maps
          </a>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-red-700"
            onClick={() => onAbrirAcao(poste, "FISCALIZACAO")}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Abrir Fiscalização
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-amber-700"
            onClick={() => onAbrirAcao(poste, "ORDENAMENTO")}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Marcar para Ordenamento
          </Button>
        </div>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ocupantes identificados
        </h3>

        {loading && <p className="text-sm text-slate-500">Carregando...</p>}

        {!loading && erro && <p className="text-sm text-destructive">{erro}</p>}

        {!loading && !erro && ocupacoes.length === 0 && (
          <EmptyState message="Nenhuma ocupação registrada neste poste." />
        )}

        {!loading && !erro && ocupacoes.length > 0 && (
          <div className="space-y-2">
            {ocupacoes.map((ocupacao) => (
              <div key={ocupacao.ID} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="truncate text-sm font-semibold text-slate-900" title={ocupacao.BOARD_NAME}>
                  {ocupacao.BOARD_NAME}
                </p>
                {ocupacao.ORGANIZATION_NAME ? (
                  <>
                    <p className="mt-1 truncate text-sm text-slate-600" title={ocupacao.ORGANIZATION_NAME}>
                      {ocupacao.ORGANIZATION_NAME}
                    </p>
                    {ocupacao.CNPJ && (
                      <p className="mt-0.5 text-xs text-slate-400">{formatarCnpj(ocupacao.CNPJ)}</p>
                    )}
                  </>
                ) : (
                  <span className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
                    Não identificado
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
