"use client"

import { useEffect, useRef, useState } from "react"
import * as maplibregl from "maplibre-gl"
import type { StyleSpecification } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { nivelSaturacao, SATURACAO_INFO, type AcaoPoste, type PosteMapa } from "@/lib/types/postes"

// Importado via next/dynamic com ssr:false pela page - por isso pode importar
// maplibre-gl direto aqui (ele toca `window` no carregamento do modulo e
// quebra em SSR se importado fora de um componente client-only).
//
// Marcadores sao renderizados via maplibregl.Marker (DOM), nao via fonte
// GeoJSON + camada `circle`: o processamento de fontes GeoJSON no maplibre-gl
// roda num Web Worker interno da biblioteca que, neste projeto, trava
// silenciosamente (a fonte nunca sai do estado "loading", sem erro nenhum -
// reproduzido tanto com build Turbopack quanto Webpack, é bug conhecido da
// lib). Com os postes já limitados a poucas milhares por viewport (backend),
// marcador em DOM tem performance de sobra e não depende desse worker. Pelo
// mesmo motivo, a densidade é desenhada num <canvas> 2D comum (via
// map.project por cima da célula), nao numa camada `heatmap` do maplibre
// (que também depende de fonte GeoJSON).

const CENTRO_PADRAO: [number, number] = [-41, -12] // maplibre usa [lng, lat]
const ZOOM_PADRAO = 6

export type ViewportBounds = {
  min_x: number
  max_x: number
  min_y: number
  max_y: number
}

export type CelulaDensidade = {
  min_x: number
  max_x: number
  min_y: number
  max_y: number
  qtd: number
}

// Aresta da rede de distribuição (trecho MT/BT), desenhada como linha
// sobre o mapa na análise de "postes na rota não faturados".
export type SegmentoRede = {
  ax: number
  ay: number
  bx: number
  by: number
  entidade?: string
  implicado?: boolean
}

// Basemap raster do OSM (mesmos tiles que o Leaflet usava) - evita depender
// de um provedor de vetor com API key (Mapbox/CARTO) só pra trocar o motor
// de renderizacao pra WebGL. Pode ser trocado por NEXT_PUBLIC_MAP_TILES_URL
// (um template {z}/{x}/{y}) quando a rede bloqueia o tile.openstreetmap.org -
// se nao houver rede pro basemap, o mapa cai num fundo cinza mas os
// marcadores continuam funcionando.
const TILES_BASE: string[] = process.env.NEXT_PUBLIC_MAP_TILES_URL
  ? [process.env.NEXT_PUBLIC_MAP_TILES_URL]
  : [
      "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
    ]

const ESTILO_BASE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: TILES_BASE,
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "fundo", type: "background", paint: { "background-color": "#e8edf1" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
}

// Erros de carregamento de tile do basemap (rede corporativa bloqueando o
// OSM, offline, etc.) não devem virar erro de console/overlay: o mapa
// degrada pro fundo cinza e os marcadores continuam. Só deixa passar o que
// não for falha de tile.
function ehErroDeTile(evento: unknown): boolean {
  const err = (evento as { error?: { message?: string; url?: string } })?.error
  const texto = `${err?.message ?? ""} ${err?.url ?? ""}`.toLowerCase()
  return (
    texto.includes("tile.openstreetmap.org") ||
    texto.includes(".png") ||
    texto.includes("failed to fetch") ||
    texto.includes("ajaxerror")
  )
}

function criarElementoMarcador(cor: string) {
  const el = document.createElement("div")
  el.style.width = "12px"
  el.style.height = "12px"
  el.style.borderRadius = "9999px"
  el.style.background = cor
  el.style.border = "2px solid white"
  el.style.boxShadow = "0 0 2px rgba(0,0,0,0.5)"
  el.style.cursor = "pointer"
  return el
}

// Cor da borda/preenchimento do retângulo de cada ação sobreposta ao mapa,
// por tipo - alinhado com os badges da tela "Ações do Mapa".
const COR_TIPO_ACAO: Record<string, string> = {
  FISCALIZACAO: "#DC2626",
  ORDENAMENTO: "#D97706",
  REMOCAO: "#7C3AED",
}

function hexParaRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function corPorIntensidade(intensidade: number) {
  // 0 -> amarelo bem transparente, 1 -> vermelho quase opaco.
  const clamp = Math.max(0, Math.min(1, intensidade))
  const r = 234 - Math.round(clamp * (234 - 185))
  const g = Math.round(179 - clamp * 179)
  const b = 8
  const alpha = 0.12 + clamp * 0.6
  return `rgba(${r},${g},${b},${alpha})`
}

// Formas disponíveis pra "Selecionar área": retângulo (arrastar), raio/círculo
// (arrastar do centro pra fora) e polígono (clicar vértice a vértice).
export type FormaSelecao = "retangulo" | "poligono" | "raio"

// Ray casting em coordenadas lng/lat - o anel do polígono não precisa estar
// fechado (o par (i, j) já liga o último vértice ao primeiro).
function pontoEmPoligono(x: number, y: number, anel: { lng: number; lat: number }[]) {
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i].lng
    const yi = anel[i].lat
    const xj = anel[j].lng
    const yj = anel[j].lat
    const intersecta = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersecta) dentro = !dentro
  }
  return dentro
}

const SEM_DESTAQUE: string[] = []
const SEM_SEGMENTOS: SegmentoRede[] = []

export type MapaMapLibreProps = {
  postes: PosteMapa[]
  onMudarViewport: (bounds: ViewportBounds) => void
  onSelecionarPoste: (poste: PosteMapa) => void
  corOperadoraSelecionada?: string | null
  // Barramentos que devem aparecer em vermelho (ex.: postes já escolhidos
  // para a carteira de serviço).
  barramentosDestacados?: string[]
  // Colore cada poste pelo nível de saturação (ocupados x capacidade) em vez
  // da cor de identificação/operadora.
  colorirPorSaturacao?: boolean
  modoSelecao?: boolean
  formaSelecao?: FormaSelecao
  onSelecionarArea?: (bounds: ViewportBounds, postesNaArea: PosteMapa[]) => void
  mostrarDensidade?: boolean
  celulasDensidade?: CelulaDensidade[]
  vooPara?: ViewportBounds | null
  // Ações (Fiscalização/Ordenamento/Remoção) desenhadas como retângulos
  // clicáveis sobre o mapa - só as que têm bounds definidos.
  acoes?: AcaoPoste[]
  onSelecionarAcao?: (idAcao: number) => void
  // Poste alvo de uma busca por barramento - ganha um marcador em destaque
  // pra ser achado mesmo quando o filtro de operadora esconde os demais.
  posteDestaque?: PosteMapa | null
  // Sinal de que o container mudou de tamanho (ex.: modo tela cheia) - o
  // MapLibre só escuta resize da janela, então força um map.resize() aqui.
  redimensionarSinal?: unknown
  // Arestas da rede de distribuição desenhadas como linhas (análise de rede).
  segmentos?: SegmentoRede[]
}

export default function MapaMapLibre({
  postes,
  onMudarViewport,
  onSelecionarPoste,
  corOperadoraSelecionada = null,
  barramentosDestacados = SEM_DESTAQUE,
  colorirPorSaturacao = false,
  modoSelecao = false,
  formaSelecao = "retangulo",
  onSelecionarArea,
  mostrarDensidade = false,
  celulasDensidade = [],
  vooPara = null,
  acoes = [],
  onSelecionarAcao,
  posteDestaque = null,
  redimensionarSinal,
  segmentos = SEM_SEGMENTOS,
}: MapaMapLibreProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasDensidadeRef = useRef<HTMLCanvasElement | null>(null)
  const canvasSegmentosRef = useRef<HTMLCanvasElement | null>(null)
  const segmentosRef = useRef<SegmentoRede[]>(segmentos)
  const svgSelecaoRef = useRef<SVGSVGElement | null>(null)
  const overlayAcoesRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const marcadoresRef = useRef<maplibregl.Marker[]>([])
  const marcadorDestaqueRef = useRef<maplibregl.Marker | null>(null)
  const postesRef = useRef<PosteMapa[]>(postes)
  const acoesRef = useRef<AcaoPoste[]>(acoes)
  const onSelecionarAcaoRef = useRef(onSelecionarAcao)
  const [pronto, setPronto] = useState(false)

  // Refs sempre atualizadas pros handlers de evento do mapa (criados uma
  // unica vez no mount) nunca ficarem com closures desatualizadas.
  const onMudarViewportRef = useRef(onMudarViewport)
  const onSelecionarPosteRef = useRef(onSelecionarPoste)
  const onSelecionarAreaRef = useRef(onSelecionarArea)
  const modoSelecaoRef = useRef(modoSelecao)
  const formaSelecaoRef = useRef(formaSelecao)
  const celulasDensidadeRef = useRef(celulasDensidade)
  const mostrarDensidadeRef = useRef(mostrarDensidade)
  useEffect(() => {
    onMudarViewportRef.current = onMudarViewport
  }, [onMudarViewport])
  useEffect(() => {
    onSelecionarPosteRef.current = onSelecionarPoste
  }, [onSelecionarPoste])
  useEffect(() => {
    onSelecionarAreaRef.current = onSelecionarArea
  }, [onSelecionarArea])
  useEffect(() => {
    modoSelecaoRef.current = modoSelecao
  }, [modoSelecao])
  useEffect(() => {
    formaSelecaoRef.current = formaSelecao
  }, [formaSelecao])
  useEffect(() => {
    postesRef.current = postes
  }, [postes])
  useEffect(() => {
    onSelecionarAcaoRef.current = onSelecionarAcao
  }, [onSelecionarAcao])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO_BASE,
      center: CENTRO_PADRAO,
      zoom: ZOOM_PADRAO,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left")

    // Sem esse listener o MapLibre joga cada tile que falha no console.error
    // (e o overlay do Next). Silencia falha de basemap; loga o resto.
    map.on("error", (evento) => {
      if (ehErroDeTile(evento)) return
      console.warn("[mapa-maplibre]", (evento as { error?: unknown }).error ?? evento)
    })

    function reportarBounds() {
      const b = map.getBounds()
      onMudarViewportRef.current({
        min_x: b.getWest(),
        max_x: b.getEast(),
        min_y: b.getSouth(),
        max_y: b.getNorth(),
      })
    }

    function desenharDensidade() {
      const canvas = canvasDensidadeRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const largura = canvas.clientWidth
      const altura = canvas.clientHeight
      if (canvas.width !== largura * dpr || canvas.height !== altura * dpr) {
        canvas.width = largura * dpr
        canvas.height = altura * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, largura, altura)

      if (!mostrarDensidadeRef.current) return

      const celulas = celulasDensidadeRef.current
      const maiorQtd = celulas.reduce((max, celula) => Math.max(max, celula.qtd), 0) || 1

      for (const celula of celulas) {
        const p1 = map.project([celula.min_x, celula.min_y])
        const p2 = map.project([celula.max_x, celula.max_y])
        const x = Math.min(p1.x, p2.x)
        const y = Math.min(p1.y, p2.y)
        const w = Math.abs(p2.x - p1.x)
        const h = Math.abs(p2.y - p1.y)
        ctx.fillStyle = corPorIntensidade(celula.qtd / maiorQtd)
        ctx.fillRect(x, y, w, h)
      }
    }
    ;(map as unknown as { __desenharDensidade: () => void }).__desenharDensidade = desenharDensidade

    // Linhas da rede de distribuição (trechos MT/BT). Canvas + map.project,
    // pelo mesmo motivo da densidade (fonte GeoJSON trava no worker da lib).
    function desenharSegmentos() {
      const canvas = canvasSegmentosRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const largura = canvas.clientWidth
      const altura = canvas.clientHeight
      if (canvas.width !== largura * dpr || canvas.height !== altura * dpr) {
        canvas.width = largura * dpr
        canvas.height = altura * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, largura, altura)

      const lista = segmentosRef.current
      if (!lista.length) return
      ctx.lineCap = "round"
      // dois passes: primeiro os normais (fininhos), depois os implicados
      // (grossos, por cima) pra o corredor suspeito saltar aos olhos.
      for (const implicadoPass of [false, true]) {
        for (const s of lista) {
          if (Boolean(s.implicado) !== implicadoPass) continue
          const p1 = map.project([s.ax, s.ay])
          const p2 = map.project([s.bx, s.by])
          const mt = s.entidade === "TRECHO DE MT"
          if (implicadoPass) {
            // corredor suspeito: vermelho, por cima de tudo
            ctx.strokeStyle = "#dc2626"
            ctx.lineWidth = mt ? 4.5 : 3.5
          } else if (mt) {
            // média tensão: roxo, traço mais grosso (é o tronco)
            ctx.strokeStyle = "rgba(147,51,234,0.75)"
            ctx.lineWidth = 2.6
          } else {
            // baixa tensão: azul, traço fino (são os ramais)
            ctx.strokeStyle = "rgba(37,99,235,0.5)"
            ctx.lineWidth = 1.4
          }
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }
      }
    }
    ;(map as unknown as { __desenharSegmentos: () => void }).__desenharSegmentos = desenharSegmentos

    // Retângulos das ações: reprojetados a cada movimento (são poucos, então
    // recriar os elementos é barato) e clicáveis pra abrir o resumo da ação.
    // DOM em vez de camada `fill` do maplibre pelo mesmo motivo dos
    // marcadores - fontes GeoJSON travam no worker da lib neste projeto.
    function desenharAcoes() {
      const overlay = overlayAcoesRef.current
      if (!overlay) return
      overlay.replaceChildren()

      for (const acao of acoesRef.current) {
        if (acao.MIN_X == null || acao.MAX_X == null || acao.MIN_Y == null || acao.MAX_Y == null) continue

        const p1 = map.project([acao.MIN_X, acao.MIN_Y])
        const p2 = map.project([acao.MAX_X, acao.MAX_Y])
        const x = Math.min(p1.x, p2.x)
        const y = Math.min(p1.y, p2.y)
        const w = Math.abs(p2.x - p1.x)
        const h = Math.abs(p2.y - p1.y)
        const cor = COR_TIPO_ACAO[acao.TIPO] ?? "#2563EB"
        const aberta = acao.STATUS === "ABERTA"
        const rotulo = acao.TITULO ?? `Ação #${acao.ID_ACAO}`

        const caixa = document.createElement("div")
        Object.assign(caixa.style, {
          position: "absolute",
          left: `${x}px`,
          top: `${y}px`,
          width: `${w}px`,
          height: `${h}px`,
          border: `2px ${aberta ? "solid" : "dashed"} ${cor}`,
          background: aberta ? hexParaRgba(cor, 0.1) : "transparent",
          borderRadius: "4px",
          // No modo de seleção os retângulos não podem "roubar" os cliques
          // que estão desenhando a área.
          pointerEvents: modoSelecaoRef.current ? "none" : "auto",
          cursor: "pointer",
        })
        caixa.title = rotulo
        caixa.addEventListener("click", (evento) => {
          evento.stopPropagation()
          onSelecionarAcaoRef.current?.(acao.ID_ACAO)
        })

        const etiqueta = document.createElement("span")
        Object.assign(etiqueta.style, {
          position: "absolute",
          left: "0",
          top: "-20px",
          maxWidth: "220px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          padding: "1px 6px",
          borderRadius: "4px",
          background: cor,
          color: "white",
          fontSize: "11px",
          fontWeight: "600",
          lineHeight: "16px",
        })
        etiqueta.textContent = rotulo
        caixa.appendChild(etiqueta)
        overlay.appendChild(caixa)
      }
    }
    ;(map as unknown as { __desenharAcoes: () => void }).__desenharAcoes = desenharAcoes

    map.on("load", () => {
      reportarBounds()
      setPronto(true)
      desenharDensidade()
      desenharAcoes()
      desenharSegmentos()
    })
    map.on("moveend", reportarBounds)
    map.on("move", desenharDensidade)
    map.on("resize", desenharDensidade)
    map.on("move", desenharAcoes)
    map.on("resize", desenharAcoes)
    map.on("move", desenharSegmentos)
    map.on("resize", desenharSegmentos)

    // === Seleção de área ===
    // Só quando modoSelecao está ativo. Três formas: retângulo e raio/círculo
    // são gestos de arrastar; polígono é clique a clique. Todas resolvem contra
    // os postes já carregados no viewport (sem chamada nova à API, já respeitando
    // os filtros) e devolvem também o bounding box, que é o que a ação persiste.
    function desenharPrevia(conteudo: string) {
      if (svgSelecaoRef.current) svgSelecaoRef.current.innerHTML = conteudo
    }

    function resolverSelecao(bounds: ViewportBounds, dentro: (poste: PosteMapa) => boolean) {
      onSelecionarAreaRef.current?.(bounds, postesRef.current.filter(dentro))
    }

    // --- Retângulo e raio: arrastar ---
    let inicioPixel: maplibregl.Point | null = null
    let elementoRetangulo: HTMLDivElement | null = null
    // Vértices do polígono em construção, guardados em lng/lat (reprojetados a
    // cada redraw) pra ficarem ancorados no mapa mesmo se o usuário der pan/zoom
    // no meio do desenho. Declarado aqui em cima porque o handler de mousemove
    // já o usa.
    const verticesPoligono: maplibregl.LngLat[] = []

    map.on("mousedown", (event) => {
      if (!modoSelecaoRef.current) return
      const forma = formaSelecaoRef.current
      if (forma !== "retangulo" && forma !== "raio") return
      event.preventDefault()
      map.dragPan.disable()
      inicioPixel = event.point
      if (forma === "retangulo") {
        elementoRetangulo = document.createElement("div")
        Object.assign(elementoRetangulo.style, {
          position: "absolute",
          border: "2px dashed #2563EB",
          background: "rgba(37,99,235,0.15)",
          pointerEvents: "none",
          zIndex: "10",
        })
        containerRef.current?.appendChild(elementoRetangulo)
      }
    })

    map.on("mousemove", (event) => {
      const atual = event.point

      if (inicioPixel) {
        const forma = formaSelecaoRef.current
        if (forma === "retangulo" && elementoRetangulo) {
          elementoRetangulo.style.left = `${Math.min(inicioPixel.x, atual.x)}px`
          elementoRetangulo.style.top = `${Math.min(inicioPixel.y, atual.y)}px`
          elementoRetangulo.style.width = `${Math.abs(atual.x - inicioPixel.x)}px`
          elementoRetangulo.style.height = `${Math.abs(atual.y - inicioPixel.y)}px`
        } else if (forma === "raio") {
          const raio = Math.hypot(atual.x - inicioPixel.x, atual.y - inicioPixel.y)
          desenharPrevia(
            `<circle cx="${inicioPixel.x}" cy="${inicioPixel.y}" r="${raio}" fill="rgba(37,99,235,0.12)" stroke="#2563EB" stroke-width="2" />`,
          )
        }
        return
      }

      // polígono em construção: acompanha o cursor entre um clique e outro
      if (verticesPoligono.length > 0) desenharPoligono(atual)
    })

    // Mantém o polígono em construção ancorado ao mapa durante pan/zoom.
    map.on("move", () => {
      if (verticesPoligono.length > 0) desenharPoligono(null)
    })

    map.on("mouseup", (event) => {
      if (!inicioPixel) return
      const forma = formaSelecaoRef.current
      const centroPixel = inicioPixel
      const fim = event.point
      const distancia = Math.hypot(fim.x - centroPixel.x, fim.y - centroPixel.y)

      inicioPixel = null
      elementoRetangulo?.remove()
      elementoRetangulo = null
      desenharPrevia("")
      map.dragPan.enable()

      if (distancia < 6) return // clique sem arrastar - ignora

      if (forma === "raio") {
        // bbox = quadrado que circunscreve o círculo (centro ± raio em pixels,
        // desprojetado nos dois cantos). O teste em si é feito na tela, já que
        // o raio está em pixels e os postes já são do viewport.
        const cantoA = map.unproject([centroPixel.x - distancia, centroPixel.y - distancia])
        const cantoB = map.unproject([centroPixel.x + distancia, centroPixel.y + distancia])
        const bounds: ViewportBounds = {
          min_x: Math.min(cantoA.lng, cantoB.lng),
          max_x: Math.max(cantoA.lng, cantoB.lng),
          min_y: Math.min(cantoA.lat, cantoB.lat),
          max_y: Math.max(cantoA.lat, cantoB.lat),
        }
        resolverSelecao(bounds, (poste) => {
          const pp = map.project([poste.X, poste.Y])
          return Math.hypot(pp.x - centroPixel.x, pp.y - centroPixel.y) <= distancia
        })
        return
      }

      // retângulo
      const p1 = map.unproject(centroPixel)
      const p2 = map.unproject(fim)
      const bounds: ViewportBounds = {
        min_x: Math.min(p1.lng, p2.lng),
        max_x: Math.max(p1.lng, p2.lng),
        min_y: Math.min(p1.lat, p2.lat),
        max_y: Math.max(p1.lat, p2.lat),
      }
      resolverSelecao(
        bounds,
        (poste) =>
          poste.X >= bounds.min_x && poste.X <= bounds.max_x && poste.Y >= bounds.min_y && poste.Y <= bounds.max_y,
      )
    })

    // --- Polígono: clicar vértice a vértice ---
    function desenharPoligono(cursor: maplibregl.Point | null) {
      const pixels = verticesPoligono.map((v) => map.project(v))
      const pontos = pixels.map((p) => `${p.x},${p.y}`)
      if (cursor) pontos.push(`${cursor.x},${cursor.y}`)
      const bolinhas = pixels
        .map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${i === 0 ? 5 : 4}" fill="#2563EB" />`)
        .join("")
      desenharPrevia(
        `<polygon points="${pontos.join(" ")}" fill="rgba(37,99,235,0.12)" stroke="#2563EB" stroke-width="2" stroke-dasharray="4 3" />${bolinhas}`,
      )
    }

    function fecharPoligono() {
      if (verticesPoligono.length < 3) return
      const anel = verticesPoligono.map((v) => ({ lng: v.lng, lat: v.lat }))
      const lngs = anel.map((c) => c.lng)
      const lats = anel.map((c) => c.lat)
      const bounds: ViewportBounds = {
        min_x: Math.min(...lngs),
        max_x: Math.max(...lngs),
        min_y: Math.min(...lats),
        max_y: Math.max(...lats),
      }
      resolverSelecao(bounds, (poste) => pontoEmPoligono(poste.X, poste.Y, anel))
      verticesPoligono.length = 0
      desenharPrevia("")
    }

    function cancelarPoligono() {
      verticesPoligono.length = 0
      desenharPrevia("")
    }

    map.on("click", (event) => {
      if (!modoSelecaoRef.current || formaSelecaoRef.current !== "poligono") return
      if (verticesPoligono.length >= 3) {
        const primeiroPixel = map.project(verticesPoligono[0])
        const perto = Math.hypot(event.point.x - primeiroPixel.x, event.point.y - primeiroPixel.y) <= 12
        if (perto) {
          fecharPoligono()
          return
        }
      }
      verticesPoligono.push(event.lngLat)
      desenharPoligono(null)
    })

    function aoTeclar(e: KeyboardEvent) {
      if (!modoSelecaoRef.current || formaSelecaoRef.current !== "poligono") return
      if (e.key === "Enter") fecharPoligono()
      else if (e.key === "Escape") cancelarPoligono()
    }
    window.addEventListener("keydown", aoTeclar)

    // Chamado pela página quando o modo/forma de seleção muda, pra não deixar
    // um polígono ou retângulo pela metade na tela.
    ;(map as unknown as { __cancelarSelecaoAtiva: () => void }).__cancelarSelecaoAtiva = () => {
      inicioPixel = null
      elementoRetangulo?.remove()
      elementoRetangulo = null
      cancelarPoligono()
      map.dragPan.enable()
    }

    return () => {
      window.removeEventListener("keydown", aoTeclar)
      for (const marcador of marcadoresRef.current) marcador.remove()
      marcadoresRef.current = []
      marcadorDestaqueRef.current?.remove()
      marcadorDestaqueRef.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Limpa qualquer desenho pela metade quando a página liga/desliga o modo
  // de seleção ou troca a forma; também desliga o zoom no duplo-clique
  // enquanto o polígono está ativo.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronto) return
    const api = map as unknown as { __cancelarSelecaoAtiva?: () => void; __desenharAcoes?: () => void }
    api.__cancelarSelecaoAtiva?.()
    api.__desenharAcoes?.() // atualiza o pointer-events dos retângulos de ação
    if (modoSelecao && formaSelecao === "poligono") map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
  }, [modoSelecao, formaSelecao, pronto])

  // Redesenha os retângulos das ações quando a lista muda (ligar/desligar a
  // camada ou trocar filtro na página).
  useEffect(() => {
    acoesRef.current = acoes
    const map = mapRef.current as unknown as { __desenharAcoes?: () => void } | null
    map?.__desenharAcoes?.()
  }, [acoes])

  // Marcador em destaque do poste buscado por barramento.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronto) return

    marcadorDestaqueRef.current?.remove()
    marcadorDestaqueRef.current = null
    if (!posteDestaque) return

    const el = document.createElement("div")
    Object.assign(el.style, {
      width: "22px",
      height: "22px",
      borderRadius: "9999px",
      border: "3px solid #2563EB",
      background: "rgba(37,99,235,0.25)",
      boxShadow: "0 0 0 4px rgba(37,99,235,0.25)",
    })
    marcadorDestaqueRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([posteDestaque.X, posteDestaque.Y])
      .addTo(map)
  }, [posteDestaque, pronto])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronto) return
    map.getCanvas().style.cursor = modoSelecao ? "crosshair" : ""
  }, [modoSelecao, pronto])

  // Entrar/sair do modo tela cheia muda o tamanho do container sem disparar
  // resize da janela; avisa o mapa (com um respiro pra transição de CSS).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronto) return
    map.resize()
    const t = setTimeout(() => map.resize(), 260)
    return () => clearTimeout(t)
  }, [redimensionarSinal, pronto])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronto || !vooPara) return
    map.fitBounds(
      [
        [vooPara.min_x, vooPara.min_y],
        [vooPara.max_x, vooPara.max_y],
      ],
      { padding: 24, duration: 800 },
    )
  }, [vooPara, pronto])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pronto) return

    for (const marcador of marcadoresRef.current) marcador.remove()

    const destacados = new Set(barramentosDestacados)

    marcadoresRef.current = postes.map((poste) => {
      const identificado = poste.TEM_OCUPACAO_IDENTIFICADA === "S"
      // Postes da Base Coelba não têm capacidade/ocupação; nesse caso a
      // coloração por saturação (e a cor da operadora) não se aplica -
      // ficam sempre verde (com provedor) / cinza (sem provedor).
      const temCapacidade = poste.CAPACIDADE != null && poste.PONTOS_OCUPADOS != null
      const cor = destacados.has(poste.BARRAMENTO)
        ? "#DC2626"
        : temCapacidade && colorirPorSaturacao
          ? SATURACAO_INFO[nivelSaturacao(poste.PONTOS_OCUPADOS, poste.CAPACIDADE)].cor
          : (temCapacidade ? corOperadoraSelecionada : null) ?? (identificado ? "#16A34A" : "#94A3B8")
      const el = criarElementoMarcador(cor)
      el.title = poste.BARRAMENTO
      el.addEventListener("click", () => onSelecionarPosteRef.current(poste))
      return new maplibregl.Marker({ element: el }).setLngLat([poste.X, poste.Y]).addTo(map)
    })
  }, [postes, corOperadoraSelecionada, barramentosDestacados, colorirPorSaturacao, pronto])

  useEffect(() => {
    celulasDensidadeRef.current = celulasDensidade
    mostrarDensidadeRef.current = mostrarDensidade
    const map = mapRef.current as unknown as { __desenharDensidade?: () => void } | null
    map?.__desenharDensidade?.()
  }, [celulasDensidade, mostrarDensidade])

  useEffect(() => {
    segmentosRef.current = segmentos
    const map = mapRef.current as unknown as { __desenharSegmentos?: () => void } | null
    map?.__desenharSegmentos?.()
  }, [segmentos])

  return (
    <div ref={containerRef} style={{ height: "100%", width: "100%", position: "relative" }}>
      <canvas
        ref={canvasSegmentosRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4 }}
      />
      <canvas
        ref={canvasDensidadeRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }}
      />
      <div
        ref={overlayAcoesRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}
      />
      <svg
        ref={svgSelecaoRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 7 }}
      />
    </div>
  )
}
