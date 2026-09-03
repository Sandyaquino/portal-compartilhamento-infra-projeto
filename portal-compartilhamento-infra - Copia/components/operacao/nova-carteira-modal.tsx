"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPinned } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const SelecaoMapaCarteira = dynamic(() => import("@/components/operacao/selecao-mapa-carteira"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-slate-500">Carregando mapa...</p>,
})
import { API_BASE_URL } from "@/lib/config"
import { useCurrentUser } from "@/hooks/use-current-user"
import {
  LABEL_FREQUENCIA,
  type AreaMunicipio,
  type CriteriosCarteira,
  type EpsCarteira,
  type EquipeCampo,
  type EstrategiaCarteira,
  type FrequenciaCarteira,
  type GerarCarteiraPayload,
  type ResumoCarteira,
  type DiaCarteira,
  type EquipeCarteira,
} from "@/lib/types/carteira"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCriada: (idCarteira: number) => void
  // Quando informado, o gerador abre com esses critérios e o botão passa a
  // "Regerar" a carteira RASCUNHO de id `inicial.id_carteira`.
  inicial?: CriteriosCarteira | null
}

type PreviewResp = {
  resumo: ResumoCarteira
  por_dia: DiaCarteira[]
  por_equipe: EquipeCarteira[]
}

const HOJE = new Date().toISOString().slice(0, 10)

export function NovaCarteiraModal({ open, onOpenChange, onCriada, inicial = null }: Props) {
  const { user } = useCurrentUser()
  const regerando = inicial !== null

  const [estrategias, setEstrategias] = useState<EstrategiaCarteira[]>([])
  const [epsLista, setEpsLista] = useState<EpsCarteira[]>([])
  const [equipes, setEquipes] = useState<EquipeCampo[]>([])
  const [areas, setAreas] = useState<AreaMunicipio[]>([])

  const [titulo, setTitulo] = useState("")
  const [frequencia, setFrequencia] = useState<FrequenciaCarteira>("SEMANAL")
  const [dataInicio, setDataInicio] = useState(HOJE)
  const [idEps, setIdEps] = useState<number | null>(null)
  const [idsEquipes, setIdsEquipes] = useState<number[]>([])
  const [modo, setModo] = useState<"AUTOMATICA" | "MANUAL">("AUTOMATICA")
  const [estrategia, setEstrategia] = useState("VAO_ENTRE_PROVEDORES")
  const [municipios, setMunicipios] = useState<string[]>([])
  const [localidades, setLocalidades] = useState<number[]>([])
  const [qtdDia, setQtdDia] = useState(12)
  const [barramentosTexto, setBarramentosTexto] = useState("")
  const [passoMapa, setPassoMapa] = useState(false)

  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [carregandoPreview, setCarregandoPreview] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitulo(inicial?.titulo ?? "")
    setFrequencia(inicial?.frequencia ?? "SEMANAL")
    setDataInicio(inicial?.data_inicio ?? HOJE)
    setIdEps(inicial?.id_eps ?? null)
    setIdsEquipes(inicial?.ids_equipes ?? [])
    setModo(inicial?.modo ?? "AUTOMATICA")
    setEstrategia(inicial?.estrategia ?? "VAO_ENTRE_PROVEDORES")
    setMunicipios(inicial?.municipios ?? [])
    setLocalidades(inicial?.localidades ?? [])
    setQtdDia(inicial?.qtd_postes_dia ?? 12)
    setBarramentosTexto((inicial?.barramentos ?? []).join("\n"))
    setPassoMapa(false)
    setPreview(null)
    setErro(null)

    const get = (url: string) => fetch(`${API_BASE_URL}${url}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : []))
    Promise.all([
      get("/api/carteira/estrategias"),
      get("/api/carteira/eps"),
      get("/api/carteira/areas"),
    ]).then(([e, eps, a]) => {
      setEstrategias(Array.isArray(e) ? e : [])
      setEpsLista(Array.isArray(eps) ? eps : [])
      setAreas(Array.isArray(a) ? a : [])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!idEps) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEquipes([])
      return
    }
    let cancelado = false
    fetch(`${API_BASE_URL}/api/carteira/equipes?eps=${idEps}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelado) setEquipes(Array.isArray(d) ? d : [])
      })
    return () => {
      cancelado = true
    }
  }, [idEps])

  const estrategiaSel = useMemo(
    () => estrategias.find((e) => e.CODIGO === estrategia) ?? null,
    [estrategias, estrategia],
  )
  const barramentosLista = useMemo(
    () => barramentosTexto.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
    [barramentosTexto],
  )
  const localidadesDisponiveis = useMemo(
    () => areas.filter((a) => municipios.includes(a.MUNICIPIO)).flatMap((a) => a.localidades),
    [areas, municipios],
  )

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
  }

  function montarPayload(): GerarCarteiraPayload {
    return {
      titulo: titulo.trim() || undefined,
      frequencia,
      data_inicio: dataInicio,
      modo,
      estrategia: modo === "AUTOMATICA" ? estrategia : undefined,
      id_eps: idEps,
      ids_equipes: idsEquipes,
      qtd_postes_dia: qtdDia,
      municipios,
      localidades,
      barramentos: modo === "MANUAL" ? barramentosLista : undefined,
      usuario: user?.login ?? null,
    }
  }

  async function chamar(rota: "preview" | "gerar") {
    const setLoading = rota === "preview" ? setCarregandoPreview : setGerando
    setLoading(true)
    setErro(null)
    try {
      const url =
        rota === "preview"
          ? `${API_BASE_URL}/api/carteira/preview`
          : regerando
            ? `${API_BASE_URL}/api/carteira/${inicial!.id_carteira}/regerar`
            : `${API_BASE_URL}/api/carteira/gerar`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarPayload()),
      })
      const dados = await res.json().catch(() => null)
      if (!res.ok) throw new Error(dados?.detail || "Erro ao processar a carteira")
      if (rota === "preview") {
        setPreview({ resumo: dados.resumo, por_dia: dados.por_dia, por_equipe: dados.por_equipe })
      } else {
        onOpenChange(false)
        onCriada(dados.id_carteira)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao processar a carteira")
    } finally {
      setLoading(false)
    }
  }

  const podeGerar = idsEquipes.length > 0 && (modo === "MANUAL" ? barramentosLista.length > 0 : municipios.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[95vh] overflow-y-auto ${passoMapa ? "sm:max-w-[94vw]" : "sm:max-w-3xl"}`}>
        <DialogHeader>
          <DialogTitle>
            {passoMapa
              ? "Selecionar postes no mapa"
              : regerando
                ? "Redefinir critérios e regerar"
                : "Nova carteira de serviço"}
          </DialogTitle>
          <DialogDescription>
            {passoMapa
              ? "Desenhe áreas ou clique nos postes. Ao concluir, os barramentos voltam para o formulário."
              : "Monta o roteiro das equipes de campo. A rota é otimizada para a equipe não trocar de município a cada dia."}
          </DialogDescription>
        </DialogHeader>

        {passoMapa ? (
          <SelecaoMapaCarteira
            areas={areas}
            selecionados={barramentosLista}
            onChange={(bs) => setBarramentosTexto(bs.join("\n"))}
            onConcluir={() => setPassoMapa(false)}
          />
        ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm sm:col-span-1">
              <span className="font-medium text-slate-700">Frequência</span>
              <select value={frequencia} onChange={(e) => setFrequencia(e.target.value as FrequenciaCarteira)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm">
                {(Object.keys(LABEL_FREQUENCIA) as FrequenciaCarteira[]).map((f) => (
                  <option key={f} value={f}>{LABEL_FREQUENCIA[f]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Início</span>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Postes por dia (por equipe)</span>
              <input type="number" min={1} value={qtdDia} onChange={(e) => setQtdDia(Math.max(1, Number(e.target.value) || 1))} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">EPS</span>
            <select
              value={idEps ?? ""}
              onChange={(e) => {
                setIdEps(e.target.value ? Number(e.target.value) : null)
                setIdsEquipes([])
              }}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            >
              <option value="">Selecione a EPS</option>
              {epsLista.map((ep) => (
                <option key={ep.ID_EPS} value={ep.ID_EPS}>{ep.NOME}</option>
              ))}
            </select>
          </label>

          {equipes.length > 0 && (
            <div className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Equipes ({idsEquipes.length})</span>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
                {equipes.map((eq) => (
                  <button
                    key={eq.ID_EQUIPE}
                    type="button"
                    onClick={() => setIdsEquipes((a) => toggle(a, eq.ID_EQUIPE))}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                      idsEquipes.includes(eq.ID_EQUIPE)
                        ? "border-primary bg-primary text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {eq.NOME} <span className="opacity-70">· {eq.MUNICIPIO_BASE}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-1 rounded-lg border border-slate-200 p-1 text-sm">
            {(["AUTOMATICA", "MANUAL"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); setPreview(null) }}
                className={`flex-1 rounded-md px-2 py-1 font-medium transition ${
                  modo === m ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {m === "AUTOMATICA" ? "Geração automática" : "Seleção manual"}
              </button>
            ))}
          </div>

          {modo === "AUTOMATICA" ? (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Lógica de priorização</span>
                <select value={estrategia} onChange={(e) => { setEstrategia(e.target.value); setPreview(null) }} className="h-9 rounded-lg border border-slate-300 px-2 text-sm">
                  {estrategias.map((es) => (
                    <option key={es.CODIGO} value={es.CODIGO}>{es.NOME}</option>
                  ))}
                </select>
                {estrategiaSel && (
                  <p className="mt-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs text-blue-800">
                    {estrategiaSel.DESCRICAO}
                    <span className="mt-1 block text-blue-500">Parâmetros: {estrategiaSel.PARAMETROS}</span>
                  </p>
                )}
              </label>

              <div className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Municípios de atuação ({municipios.length})</span>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
                  {areas.map((a) => (
                    <button
                      key={a.MUNICIPIO}
                      type="button"
                      onClick={() => { setMunicipios((x) => toggle(x, a.MUNICIPIO)); setLocalidades([]); setPreview(null) }}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                        municipios.includes(a.MUNICIPIO)
                          ? "border-primary bg-primary text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {a.MUNICIPIO} <span className="opacity-70">· {a.SEM_PROVEDOR.toLocaleString("pt-BR")} s/ prov.</span>
                    </button>
                  ))}
                </div>
              </div>

              {localidadesDisponiveis.length > 0 && (
                <div className="grid gap-1 text-sm">
                  <span className="font-medium text-slate-700">
                    Localidades <span className="text-slate-400">(opcional — vazio = município inteiro)</span>
                  </span>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {localidadesDisponiveis.map((l) => (
                      <button
                        key={l.NU_LOCALIDADE_ID}
                        type="button"
                        onClick={() => { setLocalidades((x) => toggle(x, l.NU_LOCALIDADE_ID)); setPreview(null) }}
                        className={`rounded-md border px-2 py-0.5 text-xs transition ${
                          localidades.includes(l.NU_LOCALIDADE_ID)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-slate-300 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {l.LOCALIDADE} · {l.SEM_PROVEDOR}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">
                  Postes selecionados <span className="text-slate-400">({barramentosLista.length})</span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setPassoMapa(true)}>
                  <MapPinned className="h-3.5 w-3.5" />
                  Selecionar no mapa
                </Button>
              </div>
              <textarea
                value={barramentosTexto}
                onChange={(e) => { setBarramentosTexto(e.target.value); setPreview(null) }}
                rows={4}
                placeholder="Escolha no mapa, ou cole os barramentos aqui (T123456, L654321, ...)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Título <span className="text-slate-400">(opcional)</span></span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" placeholder="Gerado automaticamente" />
          </label>

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-700">
                Prévia: {preview.resumo.qtd_os} OS · {preview.resumo.qtd_dias} dias · {preview.resumo.qtd_equipes} equipes ·{" "}
                {preview.resumo.qtd_municipios} municípios · {preview.resumo.sem_provedor} sem provedor
                {preview.resumo.candidatos_estrategia != null && (
                  <span className="text-slate-400"> (a lógica encontrou {preview.resumo.candidatos_estrategia} candidatos; capacidade {preview.resumo.capacidade})</span>
                )}
              </p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>
                  <p className="font-medium text-slate-500">Por equipe</p>
                  {preview.por_equipe.map((e) => (
                    <p key={e.nome} className="text-slate-600">{e.nome}: {e.qtd} OS · {e.municipios.join(", ")}</p>
                  ))}
                </div>
                <div>
                  <p className="font-medium text-slate-500">Por dia</p>
                  {preview.por_dia.map((d) => (
                    <p key={d.data} className="text-slate-600">Dia {d.dia_indice} ({d.data}): {d.qtd} OS · {d.municipios.join(", ")}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}
        </div>
        )}

        {!passoMapa && (
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" variant="outline" onClick={() => chamar("preview")} disabled={!podeGerar || carregandoPreview}>
              {carregandoPreview ? "Calculando..." : "Pré-visualizar"}
            </Button>
            <Button type="button" onClick={() => chamar("gerar")} disabled={!podeGerar || gerando}>
              {gerando ? "Gerando..." : regerando ? "Regerar carteira" : "Gerar carteira"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
