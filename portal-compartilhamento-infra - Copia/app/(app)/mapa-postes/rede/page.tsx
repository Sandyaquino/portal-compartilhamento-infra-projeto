"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Cable, Info, MapPin, Radar, Route as RouteIcon, Zap } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
import { Button } from "@/components/ui/button"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { CriarAcaoModal, type CriarAcaoValues, type UsuarioOpcao } from "@/components/mapa-postes/criar-acao-modal"
import { useCurrentUser } from "@/hooks/use-current-user"
import { apiFetch } from "@/lib/config"
import type { Operadora, PosteMapa } from "@/lib/types/postes"
import type { ViewportBounds } from "@/components/mapa-postes/mapa-maplibre"
import type {
  AlimentadorRede,
  AnaliseRedeResposta,
  EntidadeTrecho,
  MapaRedeResposta,
  ModoAnaliseRede,
  MunicipioRede,
  PosteNaoFaturado,
  SegmentoRedeApi,
} from "@/lib/types/trecho-rede"

const DEBOUNCE_MS = 400

const MapaMapLibre = dynamic(() => import("@/components/mapa-postes/mapa-maplibre"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Carregando mapa...</div>,
})

const MODOS: { valor: ModoAnaliseRede; rotulo: string; dica: string }[] = [
  {
    valor: "MESMO_PROVEDOR",
    rotulo: "Mesmo provedor nos dois extremos",
    dica: "Sinaliza o poste do meio só quando os dois postes que o cercam pela rede têm um provedor em comum — a fibra desse provedor teoricamente passa por ele.",
  },
  {
    valor: "CORREDOR",
    rotulo: "Corredor ocupado (qualquer provedor)",
    dica: "Sinaliza o poste sem ocupação que está entre dois postes ocupados por qualquer provedor. Sinal mais fraco, pega mais casos.",
  },
]

function posteParaMapa(p: PosteNaoFaturado): PosteMapa {
  return { BARRAMENTO: p.BARRAMENTO, X: p.X, Y: p.Y, TEM_OCUPACAO_IDENTIFICADA: "N" }
}

function corScore(score: number) {
  if (score >= 12) return "bg-red-100 text-red-700 border-red-200"
  if (score >= 7) return "bg-amber-100 text-amber-700 border-amber-200"
  return "bg-slate-100 text-slate-600 border-slate-200"
}

export default function AnaliseRedePage() {
  const { user } = useCurrentUser()

  const [municipios, setMunicipios] = useState<MunicipioRede[]>([])
  const [alimentadores, setAlimentadores] = useState<AlimentadorRede[]>([])
  const [operadoras, setOperadoras] = useState<Operadora[]>([])

  const [municipio, setMunicipio] = useState("")
  const [alimentador, setAlimentador] = useState("")
  const [entidade, setEntidade] = useState<EntidadeTrecho | "">("")
  const [modo, setModo] = useState<ModoAnaliseRede>("MESMO_PROVEDOR")
  const [maxTrechos, setMaxTrechos] = useState(4)
  const [mesmoAlimentador, setMesmoAlimentador] = useState(true)
  const [idOperadora, setIdOperadora] = useState("")
  const [minScore, setMinScore] = useState(1)

  const [resultado, setResultado] = useState<AnaliseRedeResposta | null>(null)
  const [rodando, setRodando] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)

  const [selecionado, setSelecionado] = useState<PosteNaoFaturado | null>(null)
  const [vooPara, setVooPara] = useState<ViewportBounds | null>(null)
  const [modalAcao, setModalAcao] = useState(false)
  const [contextoAcao, setContextoAcao] = useState<{ barramentos: string[]; titulo: string } | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([])

  // Rede desenhada aos poucos: só os trechos que cabem no viewport atual
  // (mesma lógica do carregamento dos pontos em /mapa-postes).
  const [segmentosViewport, setSegmentosViewport] = useState<SegmentoRedeApi[]>([])
  const [redeTruncada, setRedeTruncada] = useState(false)
  const [carregandoRede, setCarregandoRede] = useState(false)
  const viewportRef = useRef<ViewportBounds | null>(null)
  const municipioAnteriorRef = useRef("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    apiFetch(`/api/trecho-rede/municipios`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: MunicipioRede[]) => setMunicipios(Array.isArray(d) ? d : []))
      .catch(() => setMunicipios([]))
    apiFetch(`/api/postes/operadoras`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Operadora[]) => setOperadoras(Array.isArray(d) ? d : []))
      .catch(() => setOperadoras([]))
    apiFetch(`/api/novos-entrantes/analistas`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsuarios)
      .catch(() => setUsuarios([]))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlimentador("")
    if (!municipio) {
      setAlimentadores([])
      return
    }
    apiFetch(`/api/trecho-rede/alimentadores?municipio=${encodeURIComponent(municipio)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: AlimentadorRede[]) => setAlimentadores(Array.isArray(d) ? d : []))
      .catch(() => setAlimentadores([]))
  }, [municipio])

  // Carrega os trechos que cabem numa caixa (viewport), com teto e flag
  // `truncado` — igual ao /api/postes/mapa dos pontos.
  const carregarRede = useCallback(
    async (bounds: ViewportBounds, escopo: { municipio: string; alimentador: string; entidade: string }) => {
      if (!escopo.municipio) {
        setSegmentosViewport([])
        setRedeTruncada(false)
        return
      }
      setCarregandoRede(true)
      try {
        const p = new URLSearchParams({
          municipio: escopo.municipio,
          min_x: String(bounds.min_x),
          max_x: String(bounds.max_x),
          min_y: String(bounds.min_y),
          max_y: String(bounds.max_y),
        })
        if (escopo.alimentador) p.set("alimentador", escopo.alimentador)
        if (escopo.entidade) p.set("entidade", escopo.entidade)
        const res = await apiFetch(`/api/trecho-rede/mapa?${p.toString()}`, { cache: "no-store" })
        if (!res.ok) throw new Error(String(res.status))
        const dados = (await res.json()) as MapaRedeResposta
        setSegmentosViewport(dados.segmentos ?? [])
        setRedeTruncada(Boolean(dados.truncado))
      } catch {
        // desenho da rede é auxiliar — falha aqui não trava a análise
      } finally {
        setCarregandoRede(false)
      }
    },
    [],
  )

  // Função simples (recriada a cada render, com os filtros atuais no closure).
  // O MapaMapLibre guarda o callback num ref atualizado por efeito, então o
  // handler nunca fica com filtro velho.
  function agendarCargaRede(bounds: ViewportBounds) {
    viewportRef.current = bounds
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const escopo = { municipio, alimentador, entidade }
    debounceRef.current = setTimeout(() => carregarRede(bounds, escopo), DEBOUNCE_MS)
  }

  // Refaz o desenho quando muda o recorte (município/alimentador/tipo),
  // reaproveitando o viewport atual. Some com a análise antiga (fica stale).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResultado(null)
    setSelecionado(null)
    if (!municipio) {
      setSegmentosViewport([])
      setRedeTruncada(false)
      municipioAnteriorRef.current = ""
      return
    }
    // trocou de município: voa até a extensão dele (o carregamento por
    // viewport parte da nova área, disparado pelo moveend do mapa).
    if (municipio !== municipioAnteriorRef.current) {
      municipioAnteriorRef.current = municipio
      const m = municipios.find((x) => x.MUNICIPIO === municipio)
      if (m) {
        setVooPara({ min_x: m.min_x, max_x: m.max_x, min_y: m.min_y, max_y: m.max_y })
        return
      }
    }
    // só mudou alimentador/tipo: recarrega o viewport atual
    if (viewportRef.current) carregarRede(viewportRef.current, { municipio, alimentador, entidade })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipio, alimentador, entidade])

  const analisar = useCallback(async () => {
    if (!municipio) {
      setNotification({ type: "error", message: "Escolha um município para analisar." })
      return
    }
    setRodando(true)
    setNotification(null)
    setSelecionado(null)
    try {
      const res = await apiFetch(`/api/trecho-rede/analise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipio,
          alimentador: alimentador || null,
          entidade: entidade || null,
          modo,
          max_trechos: maxTrechos,
          exigir_mesmo_alimentador: mesmoAlimentador,
          min_score: minScore,
          id_operadora: idOperadora ? Number(idOperadora) : null,
        }),
      })
      if (!res.ok) throw new Error(`Erro ${res.status} ao rodar a análise`)
      const dados = (await res.json()) as AnaliseRedeResposta
      setResultado(dados)
      if (dados.postes.length) {
        const xs = dados.postes.map((p) => p.X)
        const ys = dados.postes.map((p) => p.Y)
        setVooPara({ min_x: Math.min(...xs), max_x: Math.max(...xs), min_y: Math.min(...ys), max_y: Math.max(...ys) })
      }
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao rodar a análise" })
    } finally {
      setRodando(false)
    }
  }, [municipio, alimentador, entidade, modo, maxTrechos, mesmoAlimentador, minScore, idOperadora])

  const postesMapa = useMemo(() => (resultado?.postes ?? []).map(posteParaMapa), [resultado])

  // Desenho da rede = trechos do viewport + o corredor implicado da análise
  // (poucos, sempre visíveis por cima).
  const segmentosDesenho = useMemo<SegmentoRedeApi[]>(() => {
    const implicados = (resultado?.segmentos ?? []).filter((s) => s.implicado)
    return [...segmentosViewport, ...implicados]
  }, [segmentosViewport, resultado])

  function abrirAcao(barramentos: string[], titulo: string) {
    setContextoAcao({ barramentos, titulo })
    setModalAcao(true)
  }

  async function salvarAcao(valores: CriarAcaoValues) {
    if (!contextoAcao) return
    const res = await apiFetch(`/api/postes/acoes`, {
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
        bounds: null,
      }),
    })
    if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`)
    setNotification({ type: "success", message: "Ação de campo criada." })
  }

  const resumo = resultado?.resumo

  return (
    <div className="mx-auto flex max-w-[1700px] flex-col gap-5 p-4 md:p-6">
      <PageHeader
        title="Análise de Rede — postes na rota não faturados"
        description="Usa os trechos de média e baixa tensão (o caminho físico da rede) para achar postes que estão no corredor da fibra de um provedor mas não têm ocupação registrada."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Mapa de Postes", href: "/mapa-postes" },
          { label: "Análise de Rede" },
        ]}
        actions={
          <Link href="/mapa-postes">
            <Button type="button" variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao mapa
            </Button>
          </Link>
        }
      />

      <NotificationBanner notification={notification} />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Painel de parâmetros */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Parâmetros</h2>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Município
            <select
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal"
            >
              <option value="">Selecione…</option>
              {municipios.map((m) => (
                <option key={m.MUNICIPIO} value={m.MUNICIPIO}>
                  {m.MUNICIPIO} ({m.TRECHOS.toLocaleString("pt-BR")} trechos)
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Alimentador <span className="text-slate-400">— opcional</span>
            <select
              value={alimentador}
              onChange={(e) => setAlimentador(e.target.value)}
              disabled={!municipio}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal disabled:opacity-50"
            >
              <option value="">Todos do município</option>
              {alimentadores.map((a) => (
                <option key={a.ALIMENTADOR} value={a.ALIMENTADOR}>
                  {a.ALIMENTADOR} ({a.TRECHOS})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Tipo de trecho
            <select
              value={entidade}
              onChange={(e) => setEntidade(e.target.value as EntidadeTrecho | "")}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal"
            >
              <option value="">MT + BT</option>
              <option value="TRECHO DE BT">Só baixa tensão (BT)</option>
              <option value="TRECHO DE MT">Só média tensão (MT)</option>
            </select>
          </label>

          <fieldset className="grid gap-1.5 text-xs font-medium text-slate-600">
            <span>Critério</span>
            {MODOS.map((m) => (
              <label key={m.valor} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 text-xs font-normal hover:bg-slate-50">
                <input
                  type="radio"
                  name="modo"
                  checked={modo === m.valor}
                  onChange={() => setModo(m.valor)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span>
                  <span className="font-medium text-slate-700">{m.rotulo}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{m.dica}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Provedor <span className="text-slate-400">— opcional</span>
            <select
              value={idOperadora}
              onChange={(e) => setIdOperadora(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal"
            >
              <option value="">Todos os provedores</option>
              {operadoras.map((o) => (
                <option key={o.ID} value={o.ID}>
                  {o.RAZAO_SOCIAL}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Máx. trechos no vão
              <input
                type="number"
                min={2}
                max={10}
                value={maxTrechos}
                onChange={(e) => setMaxTrechos(Math.min(10, Math.max(2, Number(e.target.value) || 4)))}
                className="h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Score mínimo
              <input
                type="number"
                min={0}
                max={30}
                value={minScore}
                onChange={(e) => setMinScore(Math.max(0, Number(e.target.value) || 0))}
                className="h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal"
              />
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-normal text-slate-600">
            <input
              type="checkbox"
              checked={mesmoAlimentador}
              onChange={(e) => setMesmoAlimentador(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Exigir o mesmo alimentador ao longo do vão
          </label>

          <Button type="button" onClick={analisar} disabled={rodando || !municipio} className="mt-1">
            <Radar className="h-4 w-4" />
            {rodando ? "Analisando…" : "Analisar rede"}
          </Button>
        </div>

        {/* Resultado */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              title="Postes sinalizados"
              value={resumo ? resumo.postes_sinalizados.toLocaleString("pt-BR") : "—"}
              subtitle="deveriam estar faturados"
              icon={AlertTriangle}
              color="text-red-600"
            />
            <KpiCard
              title="Provedores implicados"
              value={resumo ? resumo.provedores_implicados.toLocaleString("pt-BR") : "—"}
              subtitle="com fibra no corredor"
              icon={Cable}
              color="text-primary"
            />
            <KpiCard
              title="Trechos no escopo"
              value={resumo ? resumo.trechos_no_escopo.toLocaleString("pt-BR") : "—"}
              subtitle={`${resumo?.nos.toLocaleString("pt-BR") ?? "—"} nós`}
              icon={RouteIcon}
              color="text-slate-600"
            />
            <KpiCard
              title="Nós sem ocupação"
              value={resumo ? resumo.nos_sem_ocupacao.toLocaleString("pt-BR") : "—"}
              subtitle="candidatos avaliados"
              icon={Zap}
              color="text-amber-600"
            />
          </div>

          {municipio && (redeTruncada || carregandoRede) && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <Info className="h-4 w-4 shrink-0" />
              {redeTruncada
                ? "Muitos trechos nesta área — mostrando só uma parte da rede. Dê zoom para ver o restante."
                : "Carregando a rede da área visível…"}
            </div>
          )}

          <div className="relative h-[460px] w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <MapaMapLibre
              postes={postesMapa}
              segmentos={segmentosDesenho}
              onMudarViewport={agendarCargaRede}
              onSelecionarPoste={(p) => {
                const achado = resultado?.postes.find((x) => x.BARRAMENTO === p.BARRAMENTO)
                if (achado) setSelecionado(achado)
              }}
              corOperadoraSelecionada="#f59e0b"
              vooPara={vooPara}
              posteDestaque={selecionado ? posteParaMapa(selecionado) : null}
            />
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow">
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-red-600" /> corredor implicado</span>
              <span className="flex items-center gap-1"><span className="h-[3px] w-4 rounded" style={{ background: "rgba(147,51,234,0.75)" }} /> MT (média tensão)</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded" style={{ background: "rgba(37,99,235,0.5)" }} /> BT (baixa tensão)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> poste sinalizado</span>
            </div>
          </div>

          {selecionado && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-800">{selecionado.BARRAMENTO}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {selecionado.ALIMENTADOR} · {selecionado.ENTIDADE} · score {selecionado.SCORE}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => abrirAcao([selecionado.BARRAMENTO], `Fiscalizar poste ${selecionado.BARRAMENTO} (rota não faturada)`)}
                >
                  Criar ação de fiscalização
                </Button>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {selecionado.evidencias.map((ev, i) => (
                  <li key={i} className="rounded-md bg-white px-2 py-1.5">
                    Entre <strong>{ev.poste_a}</strong> e <strong>{ev.poste_c}</strong> — {ev.trechos} trecho(s),{" "}
                    {ev.metros.toLocaleString("pt-BR")} m{ev.mesmo_alimentador ? ", mesmo alimentador" : ""}.
                    {ev.provedores.length > 0 && (
                      <> Provedor(es): {ev.provedores.map((p) => p.razao).join(", ")}.</>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">
                Postes sinalizados{resultado ? ` (${resultado.postes.length})` : ""}
              </h2>
              {resultado && resultado.postes.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    abrirAcao(
                      resultado.postes.map((p) => p.BARRAMENTO),
                      `Fiscalização — rota não faturada (${resultado.parametros.municipio})`,
                    )
                  }
                >
                  Criar ação com todos
                </Button>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto">
              <Table className="min-w-[720px] text-sm">
                <TableHeader>
                  <TableRow className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <TableHead className="px-4 py-2 font-semibold">Barramento</TableHead>
                    <TableHead className="px-4 py-2 font-semibold">Alimentador</TableHead>
                    <TableHead className="px-4 py-2 font-semibold">Tipo</TableHead>
                    <TableHead className="px-4 py-2 text-right font-semibold">Score</TableHead>
                    <TableHead className="px-4 py-2 font-semibold">Provedor(es)</TableHead>
                    <TableHead className="px-4 py-2 text-right font-semibold">Evid.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!resultado ? (
                    <TableRow>
                      <TableCell colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                        Escolha o município e clique em <strong>Analisar rede</strong>.
                      </TableCell>
                    </TableRow>
                  ) : resultado.postes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <EmptyState message="Nenhum poste sinalizado com esses parâmetros. Tente aumentar 'máx. trechos', trocar o critério para 'Corredor ocupado' ou baixar o score mínimo." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    resultado.postes.map((p) => (
                      <TableRow
                        key={p.BARRAMENTO}
                        className={`cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${
                          selecionado?.BARRAMENTO === p.BARRAMENTO ? "bg-amber-50" : ""
                        }`}
                        onClick={() => {
                          setSelecionado(p)
                          const m = 0.0015
                          setVooPara({ min_x: p.X - m, max_x: p.X + m, min_y: p.Y - m, max_y: p.Y + m })
                        }}
                      >
                        <TableCell className="px-4 py-2 font-medium text-slate-800">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-amber-500" />
                            {p.BARRAMENTO}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2 text-slate-600">{p.ALIMENTADOR}</TableCell>
                        <TableCell className="px-4 py-2 text-slate-600">
                          {p.ENTIDADE === "TRECHO DE MT" ? "MT" : "BT"}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right">
                          <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${corScore(p.SCORE)}`}>
                            {p.SCORE}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2 text-slate-600">
                          {p.provedores.map((x) => x.razao).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right text-slate-500">{p.evidencias.length}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      <CriarAcaoModal
        open={modalAcao}
        onOpenChange={setModalAcao}
        qtdPostes={contextoAcao?.barramentos.length ?? 0}
        usuarios={usuarios}
        tituloSugerido={contextoAcao?.titulo}
        tipoInicial="FISCALIZACAO"
        onSalvar={salvarAcao}
      />
    </div>
  )
}
