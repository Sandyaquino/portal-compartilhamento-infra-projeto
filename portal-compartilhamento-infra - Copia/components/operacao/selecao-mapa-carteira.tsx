"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Circle, Hexagon, MousePointerSquareDashed, Square, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/config"
import type { CelulaDensidade, FormaSelecao, ViewportBounds } from "@/components/mapa-postes/mapa-maplibre"
import type { PosteMapa } from "@/lib/types/postes"
import type { AreaMunicipio } from "@/lib/types/carteira"
import type { BasePosteMapa } from "@/lib/types/base-postes"

const MapaMapLibre = dynamic(() => import("@/components/mapa-postes/mapa-maplibre"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">Carregando mapa...</div>
  ),
})

const FORMAS: { valor: FormaSelecao; Icone: typeof Square; rotulo: string }[] = [
  { valor: "retangulo", Icone: Square, rotulo: "Retângulo" },
  { valor: "poligono", Icone: Hexagon, rotulo: "Polígono" },
  { valor: "raio", Icone: Circle, rotulo: "Raio" },
]

type Props = {
  areas: AreaMunicipio[]
  selecionados: string[]
  onChange: (barramentos: string[]) => void
  onConcluir: () => void
}

function boundsDe(postes: PosteMapa[]): ViewportBounds | null {
  if (!postes.length) return null
  const xs = postes.map((p) => p.X)
  const ys = postes.map((p) => p.Y)
  return { min_x: Math.min(...xs), max_x: Math.max(...xs), min_y: Math.min(...ys), max_y: Math.max(...ys) }
}

export default function SelecaoMapaCarteira({ areas, selecionados, onChange, onConcluir }: Props) {
  const [municipio, setMunicipio] = useState("")
  const [localidade, setLocalidade] = useState<number | null>(null)
  const [postes, setPostes] = useState<PosteMapa[]>([])
  const [voo, setVoo] = useState<ViewportBounds | null>(null)
  const [forma, setForma] = useState<FormaSelecao>("retangulo")
  const [carregando, setCarregando] = useState(false)
  const [grande, setGrande] = useState(false)

  // Pilha de estados anteriores para "desfazer".
  const historicoRef = useRef<string[][]>([])
  const [temHistorico, setTemHistorico] = useState(false)

  const localidades = useMemo(
    () => areas.find((a) => a.MUNICIPIO === municipio)?.localidades ?? [],
    [areas, municipio],
  )
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalidade(null)
  }, [municipio])

  useEffect(() => {
    if (!localidade && !municipio) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPostes([])
      return
    }
    let cancelado = false
    setCarregando(true)
    const qs = localidade ? `localidade=${localidade}` : `municipio=${encodeURIComponent(municipio)}`
    fetch(`${API_BASE_URL}/api/base-postes/mapa?${qs}&vinculo=todos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { postes: [] }))
      .then((d: { postes: BasePosteMapa[] }) => {
        if (cancelado) return
        const lista: PosteMapa[] = (d.postes ?? []).map((bp) => ({
          BARRAMENTO: bp.DE_BARRAMENTO,
          X: bp.NU_LONGITUDE,
          Y: bp.NU_LATITUDE,
          TEM_OCUPACAO_IDENTIFICADA: bp.TEM_PROVEDOR,
        }))
        setPostes(lista)
        const b = boundsDe(lista)
        if (b) setVoo(b)
      })
      .catch(() => {
        if (!cancelado) setPostes([])
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [municipio, localidade])

  function registrar() {
    historicoRef.current = [...historicoRef.current.slice(-29), [...selecionados]]
    setTemHistorico(true)
  }
  function adicionar(barramentos: string[]) {
    if (!barramentos.length) return
    registrar()
    const set = new Set(selecionados)
    for (const b of barramentos) set.add(b)
    onChange([...set])
  }
  function alternar(barramento: string) {
    registrar()
    const set = new Set(selecionados)
    if (set.has(barramento)) set.delete(barramento)
    else set.add(barramento)
    onChange([...set])
  }
  function limpar() {
    registrar()
    onChange([])
  }
  function desfazer() {
    const anterior = historicoRef.current.pop()
    setTemHistorico(historicoRef.current.length > 0)
    if (anterior) onChange(anterior)
  }

  const semCelulas: CelulaDensidade[] = []

  return (
    <div className={`flex ${grande ? "h-[86vh]" : "h-[70vh]"} min-h-[440px] flex-col gap-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={municipio}
          onChange={(e) => setMunicipio(e.target.value)}
          className="h-8 rounded-lg border border-slate-300 px-2 text-sm"
        >
          <option value="">Município...</option>
          {areas.map((a) => (
            <option key={a.MUNICIPIO} value={a.MUNICIPIO}>
              {a.MUNICIPIO}
            </option>
          ))}
        </select>
        <select
          value={localidade ?? ""}
          onChange={(e) => setLocalidade(e.target.value ? Number(e.target.value) : null)}
          disabled={!municipio}
          className="h-8 rounded-lg border border-slate-300 px-2 text-sm disabled:opacity-50"
        >
          <option value="">Localidade (recomendado)</option>
          {localidades.map((l) => (
            <option key={l.NU_LOCALIDADE_ID} value={l.NU_LOCALIDADE_ID}>
              {l.LOCALIDADE} · {l.SEM_PROVEDOR} s/ prov.
            </option>
          ))}
        </select>

        <span className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
          <MousePointerSquareDashed className="ml-1 h-3.5 w-3.5 text-slate-400" />
          {FORMAS.map(({ valor, Icone, rotulo }) => (
            <button
              key={valor}
              type="button"
              title={rotulo}
              onClick={() => setForma(valor)}
              className={`rounded-md p-1.5 transition ${forma === valor ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <Icone className="h-3.5 w-3.5" />
            </button>
          ))}
        </span>

        {carregando && <span className="text-xs text-slate-400">carregando postes...</span>}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">{selecionados.length} poste(s) selecionado(s)</span>
          <Button type="button" size="sm" variant="outline" onClick={desfazer} disabled={!temHistorico}>
            <Undo2 className="h-3.5 w-3.5" />
            Desfazer
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" title="Limpar seleção" onClick={limpar} disabled={!selecionados.length}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setGrande((v) => !v)}>
            {grande ? "Reduzir" : "Ampliar"}
          </Button>
          <Button type="button" size="sm" onClick={onConcluir}>
            Concluir seleção
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Desenhe uma área para adicionar todos os postes dentro dela, ou clique num poste para incluir/remover. Selecionados
        ficam <span className="font-semibold text-red-600">vermelhos</span>; verde = com provedor, cinza = sem provedor. Arraste
        a borda inferior do mapa para ajustar a altura.
      </p>

      <div className="relative min-h-[360px] flex-1 resize-y overflow-hidden rounded-xl border border-slate-200">
        {!municipio && !localidade ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Escolha um município (e uma localidade) para carregar os postes.
          </div>
        ) : (
          <MapaMapLibre
            postes={postes}
            onMudarViewport={() => {}}
            onSelecionarPoste={(p) => alternar(p.BARRAMENTO)}
            barramentosDestacados={selecionados}
            modoSelecao
            formaSelecao={forma}
            onSelecionarArea={(_, postesNaArea) => adicionar(postesNaArea.map((p) => p.BARRAMENTO))}
            mostrarDensidade={false}
            celulasDensidade={semCelulas}
            vooPara={voo}
          />
        )}
        {selecionados.length > 0 && (
          <div className="absolute left-2 top-2 z-[1000] rounded-lg border border-red-300 bg-white/95 px-2.5 py-1 text-xs font-semibold text-red-600 shadow">
            {selecionados.length} selecionado(s)
          </div>
        )}
      </div>
    </div>
  )
}
