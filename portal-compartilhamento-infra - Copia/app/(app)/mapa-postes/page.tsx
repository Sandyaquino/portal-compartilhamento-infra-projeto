"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, CheckCircle2, Circle, Database, Flame, Gauge, Hexagon, Info, Layers, ListChecks, Maximize2, MapPin, Minimize2, MousePointerSquareDashed, Search, Square, X } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
import { Button } from "@/components/ui/button"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { FiltroSidebar } from "@/components/mapa-postes/filtro-sidebar"
import { PosteDetalheSheet } from "@/components/mapa-postes/poste-detalhe-sheet"
import { CriarAcaoModal, type CriarAcaoValues, type UsuarioOpcao } from "@/components/mapa-postes/criar-acao-modal"
import { useCurrentUser } from "@/hooks/use-current-user"
import { API_BASE_URL } from "@/lib/config"
import { carregarMunicipios, type MunicipioBounds } from "@/lib/municipios"
import {
  carregarCoresOperadoras,
  corPadraoOperadora,
  LABEL_STATUS_ACAO,
  LABEL_TIPO_ACAO,
  salvarCorOperadora,
  SATURACAO_INFO,
  type AcaoPoste,
  type Operadora,
  type PostePonto,
  type PosteMapa,
  type ResumoPostes,
  type SaturacaoFiltro,
  type StatusFiltro,
  type TipoAcao,
} from "@/lib/types/postes"
import type { CelulaDensidade, FormaSelecao, ViewportBounds } from "@/components/mapa-postes/mapa-maplibre"
import {
  LABEL_VINCULO_BASE,
  type BaseLocalidade,
  type BaseMunicipio,
  type BasePosteMapa,
  type BasePostesMapaResposta,
  type ResumoBasePostes,
  type VinculoBasePoste,
} from "@/lib/types/base-postes"

const VINCULOS_BASE: VinculoBasePoste[] = ["todos", "sem_provedor", "com_provedor"]

const MapaMapLibre = dynamic(() => import("@/components/mapa-postes/mapa-maplibre"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
      Carregando mapa...
    </div>
  ),
})

// Backend real: routers/postes.py + tabelas CLB349328.PORTAL_COMPARTILHAMENTO_POSTE,
// ...OPERADORA e ...POSTE_OCUPACAO (FastAPI + SAP HANA). O mapa carrega só os
// postes dentro da area visivel (viewport), refazendo a busca a cada
// movimento/zoom - 113 mil pontos nao cabem no navegador de uma vez.

const DEBOUNCE_MS = 400

const FORMAS_SELECAO: { valor: FormaSelecao; rotulo: string; Icone: typeof Square }[] = [
  { valor: "retangulo", rotulo: "Retângulo", Icone: Square },
  { valor: "poligono", rotulo: "Polígono", Icone: Hexagon },
  { valor: "raio", rotulo: "Raio", Icone: Circle },
]

const DICA_FORMA_SELECAO: Record<FormaSelecao, string> = {
  retangulo: "Arraste no mapa pra desenhar o retângulo.",
  poligono: "Clique pra adicionar vértices; clique no 1º ponto ou tecle Enter pra fechar (Esc cancela).",
  raio: "Arraste do centro pra fora pra definir o raio.",
}

function formatarDataCurta(valor: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleDateString("pt-BR")
}

export default function MapaPostesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando...</div>}>
      <MapaPostesConteudo />
    </Suspense>
  )
}

function MapaPostesConteudo() {
  const { user } = useCurrentUser()
  const searchParams = useSearchParams()

  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [resumo, setResumo] = useState<ResumoPostes | null>(null)
  const [postes, setPostes] = useState<PosteMapa[]>([])
  const [truncado, setTruncado] = useState(false)
  const [loadingPostes, setLoadingPostes] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)

  const [idsOperadoras, setIdsOperadoras] = useState<number[]>([])
  const [status, setStatus] = useState<StatusFiltro | null>(null)
  const [saturacao, setSaturacao] = useState<SaturacaoFiltro | null>(null)
  const [colorirPorSaturacao, setColorirPorSaturacao] = useState(false)
  const [posteSelecionado, setPosteSelecionado] = useState<PosteMapa | null>(null)
  const [coresOperadoras, setCoresOperadoras] = useState<Record<number, string>>({})

  // Ações do mapa (Fiscalização/Ordenamento) - via card individual ou seleção de área.
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([])
  const [modoSelecao, setModoSelecao] = useState(false)
  const [formaSelecao, setFormaSelecao] = useState<FormaSelecao>("retangulo")
  const [selecaoArea, setSelecaoArea] = useState<{ bounds: ViewportBounds; postes: PosteMapa[] } | null>(null)
  const [modalAcaoAberto, setModalAcaoAberto] = useState(false)
  const [contextoAcao, setContextoAcao] = useState<{ barramentos: string[]; titulo: string; tipoInicial?: TipoAcao } | null>(null)

  // Densidade (overlay de calor) - agregado no backend em células de grade.
  const [mostrarDensidade, setMostrarDensidade] = useState(false)
  const [celulasDensidade, setCelulasDensidade] = useState<CelulaDensidade[]>([])

  // Camada de ações (Fiscalização/Ordenamento/Remoção) sobre o mapa - só as
  // abertas, carregadas uma vez quando a camada é ligada.
  const [mostrarAcoes, setMostrarAcoes] = useState(false)
  const [acoesMapa, setAcoesMapa] = useState<AcaoPoste[]>([])
  const [acaoSelecionadaId, setAcaoSelecionadaId] = useState<number | null>(null)

  // Busca "Ir para poste" (por barramento) - voa até o poste e abre o detalhe.
  const [buscaBarramento, setBuscaBarramento] = useState("")
  const [posteDestaque, setPosteDestaque] = useState<PosteMapa | null>(null)

  // Camadas do mapa — independentes, podem ficar ligadas ao mesmo tempo
  // (a exibição é a UNIÃO das duas):
  //  - "parque": postes com ocupação mapeada (operadoras, saturação)
  //  - "base"  : Base de Postes Coelba (cadastro de ativos); ao aprofundar
  //             numa localidade mostra cada poste e os provedores alocados,
  //             deixando claro os que não têm provedor associado.
  const [mostrarParque, setMostrarParque] = useState(true)
  const [mostrarBase, setMostrarBase] = useState(false)
  const [baseResumo, setBaseResumo] = useState<ResumoBasePostes | null>(null)
  const [baseMunicipios, setBaseMunicipios] = useState<BaseMunicipio[]>([])
  const [baseLocalidades, setBaseLocalidades] = useState<BaseLocalidade[]>([])
  const [baseMunicipio, setBaseMunicipio] = useState("")
  const [baseLocalidade, setBaseLocalidade] = useState<number | null>(null)
  const [baseVinculo, setBaseVinculo] = useState<VinculoBasePoste>("sem_provedor")
  const [baseAgregar, setBaseAgregar] = useState(true)
  const [baseTruncado, setBaseTruncado] = useState(false)
  const [baseTotalSelecao, setBaseTotalSelecao] = useState(0)
  const [basePostesMapa, setBasePostesMapa] = useState<PosteMapa[]>([])
  const [baseCelulas, setBaseCelulas] = useState<CelulaDensidade[]>([])
  const [basePorBarramento, setBasePorBarramento] = useState<Record<string, BasePosteMapa>>({})
  const [basePosteSel, setBasePosteSel] = useState<BasePosteMapa | null>(null)

  // Navegação rápida por município - so move o mapa (fitBounds), nao filtra
  // dados: quem filtra os postes continua sendo o viewport, igual sempre foi.
  const [municipios, setMunicipios] = useState<MunicipioBounds[]>([])
  const [buscaMunicipio, setBuscaMunicipio] = useState("")
  const [vooPara, setVooPara] = useState<ViewportBounds | null>(null)

  // Mapa em tela cheia (sobrepõe o app; sai no botão ou tecla Esc).
  const [telaCheia, setTelaCheia] = useState(false)
  useEffect(() => {
    if (!telaCheia) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTelaCheia(false)
    }
    window.addEventListener("keydown", aoTeclar)
    return () => window.removeEventListener("keydown", aoTeclar)
  }, [telaCheia])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoresOperadoras(carregarCoresOperadoras())
    carregarMunicipios().then(setMunicipios).catch(() => setMunicipios([]))

    // Deep-link vindo da página de Ações do Mapa ("Ver no mapa"): voa até
    // a área da ação e já marca a(s) operadora(s) usada(s) na época.
    const min_x = searchParams.get("min_x")
    const max_x = searchParams.get("max_x")
    const min_y = searchParams.get("min_y")
    const max_y = searchParams.get("max_y")
    if (min_x && max_x && min_y && max_y) {
      setVooPara({ min_x: Number(min_x), max_x: Number(max_x), min_y: Number(min_y), max_y: Number(max_y) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function irParaMunicipio(nomeDigitado: string) {
    const municipio = municipios.find((item) => item.nome.toLowerCase() === nomeDigitado.trim().toLowerCase())
    if (!municipio) return
    setVooPara({ min_x: municipio.min_x, max_x: municipio.max_x, min_y: municipio.min_y, max_y: municipio.max_y })
    setBuscaMunicipio(municipio.nome)
  }

  function mudarCorOperadora(id: number, cor: string) {
    setCoresOperadoras((atual) => ({ ...atual, [id]: cor }))
    salvarCorOperadora(id, cor)
  }

  // Carrega as ações abertas na primeira vez que a camada é ligada.
  useEffect(() => {
    if (!mostrarAcoes || acoesMapa.length > 0) return
    fetch(`${API_BASE_URL}/api/postes/acoes?status=ABERTA`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((dados: AcaoPoste[]) => setAcoesMapa(dados))
      .catch(() =>
        setNotification({ type: "error", message: "Não foi possível carregar as ações do mapa." }),
      )
  }, [mostrarAcoes, acoesMapa.length])

  const acoesComBounds = mostrarAcoes ? acoesMapa.filter((a) => a.MIN_X !== null) : []
  const acaoSelecionada = acoesMapa.find((a) => a.ID_ACAO === acaoSelecionadaId) ?? null

  function selecionarAcao(id: number) {
    const acao = acoesMapa.find((a) => a.ID_ACAO === id)
    setAcaoSelecionadaId(id)
    if (acao && acao.MIN_X !== null && acao.MAX_X !== null && acao.MIN_Y !== null && acao.MAX_Y !== null) {
      setVooPara({ min_x: acao.MIN_X, max_x: acao.MAX_X, min_y: acao.MIN_Y, max_y: acao.MAX_Y })
    }
  }

  async function buscarPoste() {
    const codigo = buscaBarramento.trim()
    if (!codigo) return
    try {
      const response = await fetch(`${API_BASE_URL}/api/postes/${encodeURIComponent(codigo)}`, { cache: "no-store" })
      if (response.status === 404) {
        setNotification({ type: "error", message: `Poste "${codigo}" não encontrado.` })
        return
      }
      if (!response.ok) throw new Error(`Erro ${response.status} ao buscar o poste`)
      const poste: PosteMapa = await response.json()
      const margem = 0.0025
      setVooPara({ min_x: poste.X - margem, max_x: poste.X + margem, min_y: poste.Y - margem, max_y: poste.Y + margem })
      setPosteDestaque(poste)
      setPosteSelecionado(poste)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao buscar o poste",
      })
    }
  }

  function zoomOperadoraMunicipio(
    idOperadora: number,
    bounds: { min_x: number; max_x: number; min_y: number; max_y: number },
  ) {
    // Garante que a operadora esteja marcada pra o parque desenhar os pontos
    // dela, e voa até o município escolhido.
    setIdsOperadoras((atual) => (atual.includes(idOperadora) ? atual : [...atual, idOperadora]))
    setVooPara(bounds)
  }

  async function verOperadoraNoMapa(id: number) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/postes/por-operadora?id_operadora=${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Erro ${response.status} ao carregar os postes da operadora`)
      const pontos: PostePonto[] = await response.json()
      if (pontos.length === 0) {
        setNotification({ type: "error", message: "Esta operadora não tem postes cadastrados." })
        return
      }
      const xs = pontos.map((p) => p.X)
      const ys = pontos.map((p) => p.Y)
      setVooPara({ min_x: Math.min(...xs), max_x: Math.max(...xs), min_y: Math.min(...ys), max_y: Math.max(...ys) })
      setIdsOperadoras((atual) => (atual.includes(id) ? atual : [...atual, id]))
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao localizar a operadora no mapa",
      })
    }
  }

  const viewportAtualRef = useRef<ViewportBounds | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/novos-entrantes/analistas`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setUsuarios)
      .catch(() => setUsuarios([]))

    fetch(`${API_BASE_URL}/api/postes/operadoras`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setOperadoras)
      .catch(() => setOperadoras([]))

    fetch(`${API_BASE_URL}/api/postes/resumo`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setResumo)
      .catch(() => setResumo(null))
  }, [])

  const carregarPostes = useCallback(
    async (
      bounds: ViewportBounds,
      filtrosOperadoras: number[],
      filtroStatus: StatusFiltro | null,
      filtroSaturacao: SaturacaoFiltro | null,
    ) => {
      if (filtrosOperadoras.length === 0) {
        setPostes([])
        setTruncado(false)
        return
      }

      setLoadingPostes(true)
      try {
        const params = new URLSearchParams({
          min_x: String(bounds.min_x),
          max_x: String(bounds.max_x),
          min_y: String(bounds.min_y),
          max_y: String(bounds.max_y),
        })
        for (const id of filtrosOperadoras) params.append("id_operadora", String(id))
        if (filtroStatus !== null) params.set("status", filtroStatus)
        if (filtroSaturacao !== null) params.set("saturacao", filtroSaturacao)

        const response = await fetch(`${API_BASE_URL}/api/postes/mapa?${params.toString()}`, { cache: "no-store" })
        if (!response.ok) throw new Error(`Erro ${response.status} ao carregar os postes`)
        const dados = await response.json()
        setPostes(dados.postes ?? [])
        setTruncado(Boolean(dados.truncado))
      } catch (error) {
        setNotification({
          type: "error",
          message: error instanceof Error ? error.message : "Erro ao carregar os postes",
        })
      } finally {
        setLoadingPostes(false)
      }
    },
    [],
  )

  const carregarDensidade = useCallback(
    async (
      bounds: ViewportBounds,
      filtrosOperadoras: number[],
      filtroStatus: StatusFiltro | null,
      filtroSaturacao: SaturacaoFiltro | null,
    ) => {
      if (filtrosOperadoras.length === 0) {
        setCelulasDensidade([])
        return
      }
      try {
        const params = new URLSearchParams({
          min_x: String(bounds.min_x),
          max_x: String(bounds.max_x),
          min_y: String(bounds.min_y),
          max_y: String(bounds.max_y),
          grade: "24",
        })
        for (const id of filtrosOperadoras) params.append("id_operadora", String(id))
        if (filtroStatus !== null) params.set("status", filtroStatus)
        if (filtroSaturacao !== null) params.set("saturacao", filtroSaturacao)

        const response = await fetch(`${API_BASE_URL}/api/postes/densidade?${params.toString()}`, { cache: "no-store" })
        if (!response.ok) return
        const dados = await response.json()
        setCelulasDensidade(dados.celulas ?? [])
      } catch {
        // Densidade é um overlay auxiliar - falha aqui não deve travar o mapa principal.
      }
    },
    [],
  )

  // --- Camada Base: carrega postes da base Coelba aplicando a estratégia
  // (agrega quando a seleção é ampla; pontos + provedores quando é estreita).
  const carregarBase = useCallback(
    async (bounds: ViewportBounds | null, mun: string, loc: number | null, vinculo: VinculoBasePoste) => {
      setLoadingPostes(true)
      try {
        const p = new URLSearchParams({ vinculo })
        if (loc) p.set("localidade", String(loc))
        else if (mun) p.set("municipio", mun)
        if (bounds) {
          p.set("min_x", String(bounds.min_x))
          p.set("max_x", String(bounds.max_x))
          p.set("min_y", String(bounds.min_y))
          p.set("max_y", String(bounds.max_y))
        }
        const res = await fetch(`${API_BASE_URL}/api/base-postes/mapa?${p.toString()}`, { cache: "no-store" })
        if (!res.ok) throw new Error(`Erro ${res.status} ao carregar a base de postes`)
        const dados: BasePostesMapaResposta = await res.json()
        setBaseTotalSelecao(dados.total_na_selecao ?? 0)
        setBaseTruncado(Boolean(dados.truncado))
        setBaseAgregar(Boolean(dados.agregar))

        if (dados.agregar) {
          setBasePostesMapa([])
          setBasePorBarramento({})
          if (bounds) {
            const pd = new URLSearchParams({
              vinculo,
              grade: "24",
              min_x: String(bounds.min_x),
              max_x: String(bounds.max_x),
              min_y: String(bounds.min_y),
              max_y: String(bounds.max_y),
            })
            if (mun) pd.set("municipio", mun)
            const rd = await fetch(`${API_BASE_URL}/api/base-postes/densidade?${pd.toString()}`, { cache: "no-store" })
            setBaseCelulas(rd.ok ? (await rd.json()).celulas ?? [] : [])
          } else {
            setBaseCelulas([])
          }
        } else {
          setBaseCelulas([])
          const indice: Record<string, BasePosteMapa> = {}
          const paraMapa: PosteMapa[] = (dados.postes ?? []).map((bp) => {
            indice[bp.DE_BARRAMENTO] = bp
            return {
              BARRAMENTO: bp.DE_BARRAMENTO,
              X: bp.NU_LONGITUDE,
              Y: bp.NU_LATITUDE,
              TEM_OCUPACAO_IDENTIFICADA: bp.TEM_PROVEDOR,
            }
          })
          setBasePorBarramento(indice)
          setBasePostesMapa(paraMapa)
        }
      } catch (error) {
        setNotification({
          type: "error",
          message: error instanceof Error ? error.message : "Erro ao carregar a base de postes",
        })
      } finally {
        setLoadingPostes(false)
      }
    },
    [],
  )

  function agendarCarga(bounds: ViewportBounds) {
    viewportAtualRef.current = bounds
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const mun = baseMunicipio
    const loc = baseLocalidade
    const vinc = baseVinculo
    debounceRef.current = setTimeout(() => {
      if (mostrarParque) {
        carregarPostes(bounds, idsOperadoras, status, saturacao)
        if (mostrarDensidade) carregarDensidade(bounds, idsOperadoras, status, saturacao)
      }
      if (mostrarBase) carregarBase(bounds, mun, loc, vinc)
    }, DEBOUNCE_MS)
  }

  // Refaz a busca do parque quando o filtro muda, reaproveitando o viewport.
  useEffect(() => {
    if (!mostrarParque || !viewportAtualRef.current) return
    carregarPostes(viewportAtualRef.current, idsOperadoras, status, saturacao)
    if (mostrarDensidade) carregarDensidade(viewportAtualRef.current, idsOperadoras, status, saturacao)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsOperadoras, status, saturacao, mostrarParque])

  // Camada Base: (re)carrega ao ligar / trocar município / localidade / vínculo.
  // (Não precisa limpar ao desligar: `postesNoMapa`/`celulasNoMapa` já ignoram
  // a base quando `mostrarBase` é falso.)
  useEffect(() => {
    if (!mostrarBase) return
    carregarBase(viewportAtualRef.current, baseMunicipio, baseLocalidade, baseVinculo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarBase, baseMunicipio, baseLocalidade, baseVinculo])

  // Carga inicial da camada Base (resumo + municípios), uma vez.
  useEffect(() => {
    if (!mostrarBase || baseMunicipios.length > 0) return
    fetch(`${API_BASE_URL}/api/base-postes/resumo`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBaseResumo)
      .catch(() => {})
    fetch(`${API_BASE_URL}/api/base-postes/municipios`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBaseMunicipios(Array.isArray(d) ? d : []))
      .catch(() => setBaseMunicipios([]))
  }, [mostrarBase, baseMunicipios.length])

  // Exibição do mapa = UNIÃO das duas camadas (dedupe por barramento; a
  // entrada do parque prevalece por ter saturação/capacidade).
  const postesParque = mostrarParque ? postes : []
  const postesNoMapa = mostrarBase
    ? (() => {
        const doParque = new Set(postesParque.map((p) => p.BARRAMENTO))
        return [...postesParque, ...basePostesMapa.filter((p) => !doParque.has(p.BARRAMENTO))]
      })()
    : postesParque

  // Densidade: a do parque quando ligada; senão a da base (quando o parque
  // não está desenhando pontos, pra os overlays não brigarem pelo canvas).
  const densidadeAtiva = mostrarParque && mostrarDensidade
  const celulasNoMapa = densidadeAtiva
    ? celulasDensidade
    : mostrarBase && baseAgregar && !mostrarParque
      ? baseCelulas
      : []
  const mostrarDensidadeMapa = densidadeAtiva || (mostrarBase && baseAgregar && !mostrarParque)

  // Localidades do município escolhido + voo até a área.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseLocalidade(null)
    if (!baseMunicipio) {
      setBaseLocalidades([])
      return
    }
    let cancelado = false
    fetch(`${API_BASE_URL}/api/base-postes/localidades?municipio=${encodeURIComponent(baseMunicipio)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((ls) => {
        if (!cancelado) setBaseLocalidades(Array.isArray(ls) ? ls : [])
      })
      .catch(() => {
        if (!cancelado) setBaseLocalidades([])
      })
    const m = baseMunicipios.find((x) => x.MUNICIPIO === baseMunicipio)
    if (m?.bounds) setVooPara(m.bounds)
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMunicipio])

  useEffect(() => {
    if (!baseLocalidade) return
    const l = baseLocalidades.find((x) => x.NU_LOCALIDADE_ID === baseLocalidade)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (l?.bounds) setVooPara(l.bounds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLocalidade])

  // Liga/desliga o overlay de densidade sem esperar o próximo movimento do mapa.
  useEffect(() => {
    if (mostrarDensidade && viewportAtualRef.current) {
      carregarDensidade(viewportAtualRef.current, idsOperadoras, status, saturacao)
    }
    if (!mostrarDensidade) {
      setCelulasDensidade([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarDensidade])

  function abrirAcaoPoste(poste: PosteMapa, tipo: TipoAcao) {
    setContextoAcao({ barramentos: [poste.BARRAMENTO], titulo: `Poste ${poste.BARRAMENTO}`, tipoInicial: tipo })
    setModalAcaoAberto(true)
  }

  function abrirAcaoSelecao() {
    if (!selecaoArea || selecaoArea.postes.length === 0) return
    const semProvedor = selecaoArea.postes.filter((p) => p.TEM_OCUPACAO_IDENTIFICADA === "N").length
    setContextoAcao({
      barramentos: selecaoArea.postes.map((item) => item.BARRAMENTO),
      titulo: `Seleção de área (${selecaoArea.postes.length} postes)`,
      // Com a camada Base ligada e postes sem provedor na seleção, o caso
      // mais comum é fiscalizar — já abre o modal nesse tipo.
      tipoInicial: mostrarBase && semProvedor > 0 ? "FISCALIZACAO" : undefined,
    })
    setModalAcaoAberto(true)
  }

  async function salvarAcao(valores: CriarAcaoValues) {
    if (!contextoAcao) return

    const bounds = contextoAcao.barramentos.length > 1 ? selecaoArea?.bounds ?? null : null

    const response = await fetch(`${API_BASE_URL}/api/postes/acoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: valores.tipo,
        titulo: valores.titulo || contextoAcao.titulo,
        responsavel: valores.responsavel || null,
        prazo: valores.prazo || null,
        observacao: valores.observacao || null,
        criado_por: user?.login ?? null,
        barramentos: contextoAcao.barramentos,
        bounds,
      }),
    })

    if (!response.ok) {
      const texto = await response.text()
      throw new Error(`Erro ${response.status}: ${texto}`)
    }

    setNotification({ type: "success", message: "Ação criada com sucesso!" })
    setSelecaoArea(null)
    setModoSelecao(false)
  }

  return (
    <div className="mx-auto flex max-w-[1700px] flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Mapa de Postes"
        description="Consulta de postes e ocupações compartilhadas (Uso Compartilhado)."
        breadcrumbs={[{ label: "Início", href: "/" }, { label: "Mapa de Postes" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs">
              <span className="pl-1 font-medium text-slate-400">Camadas:</span>
              <button
                type="button"
                aria-pressed={mostrarParque}
                onClick={() => setMostrarParque((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition ${
                  mostrarParque ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Parque
              </button>
              <button
                type="button"
                aria-pressed={mostrarBase}
                onClick={() => setMostrarBase((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition ${
                  mostrarBase ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                Base Coelba
              </button>
            </div>
            <Link href="/mapa-postes/acoes">
              <Button type="button" variant="outline">
                Ações do Mapa
              </Button>
            </Link>
          </div>
        }
      />

      <NotificationBanner notification={notification} />

      {mostrarBase && !mostrarParque ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Postes na base"
            value={baseResumo ? baseResumo.total.toLocaleString("pt-BR") : "…"}
            subtitle={`${baseResumo?.municipios ?? "—"} municípios · ${baseResumo?.localidades ?? "—"} localidades`}
            icon={Database}
            color="text-primary"
          />
          <KpiCard
            title="Sem provedor"
            value={baseResumo ? baseResumo.sem_provedor.toLocaleString("pt-BR") : "…"}
            subtitle="Alvo de fiscalização"
            icon={AlertTriangle}
            color="text-amber-600"
          />
          <KpiCard
            title="Com provedor"
            value={baseResumo ? baseResumo.com_provedor.toLocaleString("pt-BR") : "…"}
            subtitle="Ocupação identificada"
            icon={CheckCircle2}
            color="text-green-600"
          />
          <KpiCard
            title="Na seleção"
            value={baseTotalSelecao ? baseTotalSelecao.toLocaleString("pt-BR") : "…"}
            subtitle={LABEL_VINCULO_BASE[baseVinculo]}
            icon={ListChecks}
            color="text-slate-600"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Postes"
            value={resumo ? (resumo.total_postes ?? 0).toLocaleString("pt-BR") : "…"}
            subtitle="Total cadastrado"
            icon={MapPin}
            color="text-primary"
          />
          <KpiCard
            title="Ocupações"
            value={resumo ? (resumo.total_ocupacoes ?? 0).toLocaleString("pt-BR") : "…"}
            subtitle="Total de registros"
            icon={ListChecks}
            color="text-slate-600"
          />
          <KpiCard
            title="Identificados"
            value={resumo ? `${resumo.percentual_identificado ?? 0}%` : "…"}
            subtitle={resumo ? `${(resumo.postes_identificados ?? 0).toLocaleString("pt-BR")} postes com ao menos 1 ocupação identificada` : "Carregando..."}
            icon={CheckCircle2}
            color="text-green-600"
          />
          <KpiCard
            title="Esgotados"
            value={resumo && resumo.postes_esgotados != null ? resumo.postes_esgotados.toLocaleString("pt-BR") : "n/d"}
            subtitle={
              resumo && resumo.postes_sobrecarga != null
                ? `${resumo.postes_sobrecarga.toLocaleString("pt-BR")} em sobrecarga`
                : "Sem dado de capacidade do poste"
            }
            icon={AlertTriangle}
            color="text-red-600"
          />
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row">
        {mostrarParque && (
          <FiltroSidebar
            operadoras={operadoras}
            idsOperadoras={idsOperadoras}
            onMudarIdsOperadoras={setIdsOperadoras}
            status={status}
            onMudarStatus={setStatus}
            saturacao={saturacao}
            onMudarSaturacao={setSaturacao}
            coresOperadoras={coresOperadoras}
            onMudarCorOperadora={mudarCorOperadora}
            onVerNoMapa={verOperadoraNoMapa}
            onZoomOperadoraMunicipio={zoomOperadoraMunicipio}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {mostrarBase && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <select
                value={baseMunicipio}
                onChange={(event) => setBaseMunicipio(event.target.value)}
                className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="">Todos os municípios</option>
                {baseMunicipios.map((m) => (
                  <option key={m.MUNICIPIO} value={m.MUNICIPIO}>
                    {m.MUNICIPIO} ({m.TOTAL.toLocaleString("pt-BR")})
                  </option>
                ))}
              </select>
              <select
                value={baseLocalidade ?? ""}
                onChange={(event) => setBaseLocalidade(event.target.value ? Number(event.target.value) : null)}
                disabled={!baseMunicipio}
                className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm disabled:opacity-50"
              >
                <option value="">Todas as localidades</option>
                {baseLocalidades.map((l) => (
                  <option key={l.NU_LOCALIDADE_ID} value={l.NU_LOCALIDADE_ID}>
                    {l.LOCALIDADE} · {l.SEM_PROVEDOR.toLocaleString("pt-BR")} s/ provedor
                  </option>
                ))}
              </select>
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
                {VINCULOS_BASE.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBaseVinculo(v)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      baseVinculo === v ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {LABEL_VINCULO_BASE[v]}
                  </button>
                ))}
              </div>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> com provedor
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" /> sem provedor
                </span>
              </span>
            </div>
          )}

          {mostrarParque && idsOperadoras.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <MapPin className="h-4 w-4 shrink-0" />
              Selecione ao menos uma operadora para ver os postes no mapa.
            </div>
          )}
          {mostrarParque && truncado && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Muitos postes nesta área — mostrando só uma parte. Dê zoom para ver os pontos individuais.
            </div>
          )}
          {mostrarBase && (baseAgregar || baseTruncado) && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Info className="h-4 w-4 shrink-0" />
              {baseAgregar
                ? "Seleção ampla — mostrando densidade por região. Escolha uma localidade ou aproxime o zoom para ver os postes da base e seus provedores."
                : `Mostrando 2.000 de ${baseTotalSelecao.toLocaleString("pt-BR")} postes na área. Aproxime o zoom ou filtre por localidade.`}
            </div>
          )}
          {loadingPostes && <p className="text-xs text-slate-500">Atualizando postes...</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={modoSelecao ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setModoSelecao((atual) => !atual)
                setSelecaoArea(null)
              }}
            >
              <MousePointerSquareDashed className="h-4 w-4" />
              {modoSelecao ? "Cancelar seleção" : "Selecionar área"}
            </Button>

            {modoSelecao && (
              <div className="flex items-center rounded-lg border border-slate-300 p-0.5">
                {FORMAS_SELECAO.map(({ valor, rotulo, Icone }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => {
                      setFormaSelecao(valor)
                      setSelecaoArea(null)
                    }}
                    title={rotulo}
                    aria-pressed={formaSelecao === valor}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                      formaSelecao === valor ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icone className="h-3.5 w-3.5" />
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
            {mostrarParque && (
              <>
                <Button
                  type="button"
                  variant={mostrarDensidade ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMostrarDensidade((atual) => !atual)}
                >
                  <Flame className="h-4 w-4" />
                  Densidade
                </Button>
                <Button
                  type="button"
                  variant={mostrarAcoes ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMostrarAcoes((atual) => !atual)}
                >
                  <Layers className="h-4 w-4" />
                  Ações{mostrarAcoes && acoesComBounds.length > 0 ? ` (${acoesComBounds.length})` : ""}
                </Button>
                <Button
                  type="button"
                  variant={colorirPorSaturacao ? "default" : "outline"}
                  size="sm"
                  onClick={() => setColorirPorSaturacao((atual) => !atual)}
                >
                  <Gauge className="h-4 w-4" />
                  Saturação
                </Button>
              </>
            )}
            {modoSelecao && (
              <span className="text-xs text-slate-500">{DICA_FORMA_SELECAO[formaSelecao]}</span>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <div className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 focus-within:border-primary">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  value={buscaBarramento}
                  onChange={(event) => setBuscaBarramento(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && buscarPoste()}
                  placeholder="Ir para poste (barramento)..."
                  className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              <input
                list="lista-municipios"
                value={buscaMunicipio}
                onChange={(event) => setBuscaMunicipio(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && irParaMunicipio(buscaMunicipio)}
                onBlur={(event) => irParaMunicipio(event.target.value)}
                placeholder="Ir para município..."
                className="h-8 w-48 rounded-lg border border-slate-300 px-2.5 text-sm outline-none focus:border-primary"
              />
              <datalist id="lista-municipios">
                {municipios.map((municipio) => (
                  <option key={municipio.nome} value={municipio.nome} />
                ))}
              </datalist>
            </div>
          </div>

          {colorirPorSaturacao && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium">Saturação:</span>
              {(Object.keys(SATURACAO_INFO) as (keyof typeof SATURACAO_INFO)[]).map((nivel) => (
                <span key={nivel} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SATURACAO_INFO[nivel].cor }}
                  />
                  {SATURACAO_INFO[nivel].label}
                </span>
              ))}
            </div>
          )}

          {selecaoArea && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <span>
                <strong>{selecaoArea.postes.length.toLocaleString("pt-BR")}</strong> postes na área
                {mostrarBase && (
                  <>
                    {" · "}
                    <strong>
                      {selecaoArea.postes.filter((p) => p.TEM_OCUPACAO_IDENTIFICADA === "N").length.toLocaleString("pt-BR")}
                    </strong>{" "}
                    sem provedor
                  </>
                )}
                .
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={abrirAcaoSelecao} disabled={selecaoArea.postes.length === 0}>
                  Criar ação
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelecaoArea(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div
            className={
              telaCheia
                ? "fixed inset-0 z-[1100] h-[100dvh] w-screen overflow-hidden border-0 bg-white"
                : "relative h-[70vh] w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm"
            }
          >
            <button
              type="button"
              onClick={() => setTelaCheia((v) => !v)}
              className="absolute right-3 top-3 z-[1200] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-md hover:bg-white"
              title={telaCheia ? "Sair da tela cheia (Esc)" : "Ampliar o mapa (tela cheia)"}
            >
              {telaCheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {telaCheia ? "Sair" : "Tela cheia"}
            </button>
            <MapaMapLibre
              postes={postesNoMapa}
              onMudarViewport={agendarCarga}
              onSelecionarPoste={(poste) => {
                const naBase = basePorBarramento[poste.BARRAMENTO]
                if (naBase) {
                  setPosteSelecionado(null)
                  setBasePosteSel(naBase)
                } else {
                  setBasePosteSel(null)
                  setPosteSelecionado(poste)
                }
              }}
              corOperadoraSelecionada={
                mostrarParque && idsOperadoras.length === 1
                  ? coresOperadoras[idsOperadoras[0]] ?? corPadraoOperadora(idsOperadoras[0])
                  : null
              }
              colorirPorSaturacao={mostrarParque && colorirPorSaturacao}
              modoSelecao={modoSelecao}
              formaSelecao={formaSelecao}
              onSelecionarArea={(bounds, postesNaArea) => setSelecaoArea({ bounds, postes: postesNaArea })}
              mostrarDensidade={mostrarDensidadeMapa}
              celulasDensidade={celulasNoMapa}
              vooPara={vooPara}
              acoes={acoesComBounds}
              onSelecionarAcao={selecionarAcao}
              posteDestaque={posteDestaque}
              redimensionarSinal={telaCheia}
            />
            <PosteDetalheSheet
              poste={posteSelecionado}
              basePoste={basePosteSel}
              onOpenChange={(open) => {
                if (!open) {
                  setPosteSelecionado(null)
                  setPosteDestaque(null)
                  setBasePosteSel(null)
                }
              }}
              onAbrirAcao={(poste, tipo) => {
                setPosteSelecionado(null)
                setBasePosteSel(null)
                abrirAcaoPoste(poste, tipo)
              }}
            />

            {acaoSelecionada && (
              <div className="absolute left-3 top-3 z-[1000] w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {LABEL_TIPO_ACAO[acaoSelecionada.TIPO]}
                    </span>
                    <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      {LABEL_STATUS_ACAO[acaoSelecionada.STATUS]}
                    </span>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAcaoSelecionadaId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-slate-900">
                  {acaoSelecionada.TITULO || `Ação #${acaoSelecionada.ID_ACAO}`}
                </h3>
                <dl className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Responsável</dt>
                    <dd>{acaoSelecionada.RESPONSAVEL || "Não atribuído"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Prazo</dt>
                    <dd>{formatarDataCurta(acaoSelecionada.PRAZO)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Postes</dt>
                    <dd>{acaoSelecionada.QTD_POSTES.toLocaleString("pt-BR")}</dd>
                  </div>
                </dl>
                <Link
                  href="/mapa-postes/acoes"
                  className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
                >
                  Abrir em Ações do Mapa
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <CriarAcaoModal
        open={modalAcaoAberto}
        onOpenChange={setModalAcaoAberto}
        qtdPostes={contextoAcao?.barramentos.length ?? 0}
        usuarios={usuarios}
        tituloSugerido={contextoAcao?.titulo}
        tipoInicial={contextoAcao?.tipoInicial}
        onSalvar={salvarAcao}
      />
    </div>
  )
}
