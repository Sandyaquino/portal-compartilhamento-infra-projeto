"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Circle, Hexagon, Info, MousePointerSquareDashed, Square, X } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EstatItem } from "@/components/projetos/projeto-ui"
import { API_BASE_URL } from "@/lib/config"
import type { CelulaDensidade, FormaSelecao, ViewportBounds } from "@/components/mapa-postes/mapa-maplibre"
import type { PosteMapa } from "@/lib/types/postes"
import {
  LABEL_VINCULO_BASE,
  type BaseLocalidade,
  type BaseMunicipio,
  type BasePostesMapaResposta,
  type ResumoBasePostes,
  type VinculoBasePoste,
} from "@/lib/types/base-postes"

const MapaMapLibre = dynamic(() => import("@/components/mapa-postes/mapa-maplibre"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">Carregando mapa...</div>
  ),
})

const DEBOUNCE_MS = 450
const VINCULOS: VinculoBasePoste[] = ["todos", "sem_provedor", "com_provedor"]
const FORMAS: { valor: FormaSelecao; rotulo: string; Icone: typeof Square }[] = [
  { valor: "retangulo", rotulo: "Retângulo", Icone: Square },
  { valor: "poligono", rotulo: "Polígono", Icone: Hexagon },
  { valor: "raio", rotulo: "Raio", Icone: Circle },
]

function BasePostesConteudo() {
  const router = useRouter()

  const [resumo, setResumo] = useState<ResumoBasePostes | null>(null)
  const [municipios, setMunicipios] = useState<BaseMunicipio[]>([])
  const [localidades, setLocalidades] = useState<BaseLocalidade[]>([])

  const [municipio, setMunicipio] = useState("")
  const [localidade, setLocalidade] = useState<number | null>(null)
  const [vinculo, setVinculo] = useState<VinculoBasePoste>("sem_provedor")

  const [postes, setPostes] = useState<PosteMapa[]>([])
  const [celulas, setCelulas] = useState<CelulaDensidade[]>([])
  const [agregando, setAgregando] = useState(true)
  const [truncado, setTruncado] = useState(false)
  const [totalSelecao, setTotalSelecao] = useState(0)
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [vooPara, setVooPara] = useState<ViewportBounds | null>(null)

  const [modoSelecao, setModoSelecao] = useState(false)
  const [formaSelecao, setFormaSelecao] = useState<FormaSelecao>("retangulo")
  const [selecao, setSelecao] = useState<{ bounds: ViewportBounds; semProvedor: number } | null>(null)
  const [gerando, setGerando] = useState(false)

  const viewportRef = useRef<ViewportBounds | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  type Filtros = { municipio: string; localidade: number | null; vinculo: VinculoBasePoste }

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/base-postes/resumo`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setResumo)
      .catch(() => {})
    fetch(`${API_BASE_URL}/api/base-postes/municipios`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMunicipios(Array.isArray(d) ? d : []))
      .catch(() => setMunicipios([]))
  }, [])

  const carregar = useCallback(async (bounds: ViewportBounds | null, f: Filtros) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ vinculo: f.vinculo })
      if (f.localidade) p.set("localidade", String(f.localidade))
      else if (f.municipio) p.set("municipio", f.municipio)
      if (bounds) {
        p.set("min_x", String(bounds.min_x))
        p.set("max_x", String(bounds.max_x))
        p.set("min_y", String(bounds.min_y))
        p.set("max_y", String(bounds.max_y))
      }
      const r = await fetch(`${API_BASE_URL}/api/base-postes/mapa?${p.toString()}`, { cache: "no-store" })
      if (!r.ok) throw new Error(`Erro ${r.status} ao carregar a base de postes`)
      const d: BasePostesMapaResposta = await r.json()
      setTotalSelecao(d.total_na_selecao ?? 0)
      setTruncado(Boolean(d.truncado))
      setAgregando(Boolean(d.agregar))

      if (d.agregar) {
        setPostes([])
        if (bounds) {
          const pd = new URLSearchParams({
            vinculo: f.vinculo,
            grade: "24",
            min_x: String(bounds.min_x),
            max_x: String(bounds.max_x),
            min_y: String(bounds.min_y),
            max_y: String(bounds.max_y),
          })
          if (f.municipio) pd.set("municipio", f.municipio)
          const rd = await fetch(`${API_BASE_URL}/api/base-postes/densidade?${pd.toString()}`, { cache: "no-store" })
          setCelulas(rd.ok ? (await rd.json()).celulas ?? [] : [])
        } else {
          setCelulas([])
        }
      } else {
        setCelulas([])
        setPostes(
          (d.postes ?? []).map((bp) => ({
            BARRAMENTO: bp.DE_BARRAMENTO,
            X: bp.NU_LONGITUDE,
            Y: bp.NU_LATITUDE,
            TEM_OCUPACAO_IDENTIFICADA: bp.TEM_PROVEDOR,
          })),
        )
      }
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar a base de postes",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  function agendarCarga(bounds: ViewportBounds) {
    viewportRef.current = bounds
    const f: Filtros = { municipio, localidade, vinculo }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregar(bounds, f), DEBOUNCE_MS)
  }

  useEffect(() => {
    carregar(viewportRef.current, { municipio, localidade, vinculo })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio, localidade, vinculo])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalidade(null)
    if (!municipio) {
      setLocalidades([])
      return
    }
    let cancelado = false
    fetch(`${API_BASE_URL}/api/base-postes/localidades?municipio=${encodeURIComponent(municipio)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((ls) => {
        if (!cancelado) setLocalidades(Array.isArray(ls) ? ls : [])
      })
      .catch(() => {
        if (!cancelado) setLocalidades([])
      })
    const m = municipios.find((x) => x.MUNICIPIO === municipio)
    if (m?.bounds) setVooPara(m.bounds)
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio])

  useEffect(() => {
    if (!localidade) return
    const l = localidades.find((x) => x.NU_LOCALIDADE_ID === localidade)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (l?.bounds) setVooPara(l.bounds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localidade])

  async function gerarFiscalizacao() {
    if (!selecao) return
    setGerando(true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/base-postes/fiscalizacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bounds: selecao.bounds,
          municipio: municipio || null,
          localidade: localidade || null,
        }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.detail || "Erro ao gerar a fiscalização")
      setNotification({
        type: "success",
        message: `Fiscalização #${d.id_acao} criada com ${d.qtd_postes} poste(s) sem provedor. Abra em Ações do Mapa.`,
      })
      setSelecao(null)
      setModoSelecao(false)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao gerar a fiscalização",
      })
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-4 md:p-6">
      <PageHeader
        title="Base de Postes Coelba"
        description="Cadastro de ativos — todo o parque. Navegue por município e localidade; selecione uma área para gerar fiscalização dos postes sem provedor."
        breadcrumbs={[{ label: "Início", href: "/" }, { label: "Base de Postes" }]}
        actions={
          <Button type="button" variant="outline" onClick={() => router.push("/mapa-postes/acoes")}>
            Ações do Mapa
          </Button>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
        <EstatItem label="Postes na base" valor={resumo ? resumo.total.toLocaleString("pt-BR") : "—"} tom="primary" sub={`${resumo?.municipios ?? "—"} municípios`} />
        <EstatItem label="Sem provedor" valor={resumo ? resumo.sem_provedor.toLocaleString("pt-BR") : "—"} tom="amber" sub="alvo de fiscalização" />
        <EstatItem label="Com provedor" valor={resumo ? resumo.com_provedor.toLocaleString("pt-BR") : "—"} tom="green" sub="ocupação identificada" />
        <EstatItem label="Na seleção" valor={totalSelecao ? totalSelecao.toLocaleString("pt-BR") : "—"} sub={LABEL_VINCULO_BASE[vinculo]} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={municipio}
          onChange={(e) => setMunicipio(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">Todos os municípios</option>
          {municipios.map((m) => (
            <option key={m.MUNICIPIO} value={m.MUNICIPIO}>
              {m.MUNICIPIO} ({m.TOTAL.toLocaleString("pt-BR")})
            </option>
          ))}
        </select>

        <select
          value={localidade ?? ""}
          onChange={(e) => setLocalidade(e.target.value ? Number(e.target.value) : null)}
          disabled={!municipio}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm disabled:opacity-50"
        >
          <option value="">Todas as localidades</option>
          {localidades.map((l) => (
            <option key={l.NU_LOCALIDADE_ID} value={l.NU_LOCALIDADE_ID}>
              {l.LOCALIDADE} · {l.SEM_PROVEDOR.toLocaleString("pt-BR")} s/ provedor
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {VINCULOS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVinculo(v)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                vinculo === v ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {LABEL_VINCULO_BASE[v]}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant={modoSelecao ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setModoSelecao((v) => !v)
            setSelecao(null)
          }}
        >
          <MousePointerSquareDashed className="h-4 w-4" />
          {modoSelecao ? "Selecionando área" : "Selecionar área"}
        </Button>

        {modoSelecao && (
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {FORMAS.map(({ valor, rotulo, Icone }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFormaSelecao(valor)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                  formaSelecao === valor ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icone className="h-3.5 w-3.5" />
                {rotulo}
              </button>
            ))}
          </div>
        )}

        {selecao && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span>
              Área com <strong>{selecao.semProvedor}</strong> poste(s) sem provedor visíveis
            </span>
            <Button type="button" size="sm" onClick={gerarFiscalizacao} disabled={gerando}>
              {gerando ? "Gerando..." : "Gerar fiscalização"}
            </Button>
            <button type="button" onClick={() => setSelecao(null)} className="text-amber-600 hover:text-amber-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {loading && <span className="text-xs text-slate-400">carregando...</span>}
      </div>

      {(agregando || truncado) && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Info className="h-4 w-4 shrink-0" />
          {agregando
            ? "Seleção ampla — mostrando densidade por região. Escolha uma localidade ou aproxime o zoom para ver os postes individualmente."
            : `Mostrando 2.000 de ${totalSelecao.toLocaleString("pt-BR")} postes na área. Aproxime o zoom ou filtre por localidade.`}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <MapaMapLibre
          postes={postes}
          onMudarViewport={agendarCarga}
          onSelecionarPoste={() => {}}
          mostrarDensidade={agregando}
          celulasDensidade={celulas}
          vooPara={vooPara}
          modoSelecao={modoSelecao}
          formaSelecao={formaSelecao}
          onSelecionarArea={(bounds, postesNaArea) =>
            setSelecao({
              bounds,
              semProvedor: postesNaArea.filter((p) => p.TEM_OCUPACAO_IDENTIFICADA === "N").length,
            })
          }
        />
      </div>
    </div>
  )
}

export default function BasePostesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando...</div>}>
      <BasePostesConteudo />
    </Suspense>
  )
}
