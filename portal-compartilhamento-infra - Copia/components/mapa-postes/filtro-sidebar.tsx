"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Crosshair, MapPin, Search } from "lucide-react"

import { FilterField } from "@/components/ui/filter-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/config"
import {
  corPadraoOperadora,
  SATURACAO_INFO,
  type MunicipioOperadora,
  type Operadora,
  type SaturacaoFiltro,
  type StatusFiltro,
} from "@/lib/types/postes"

export type BoundsMapa = { min_x: number; max_x: number; min_y: number; max_y: number }

const FILTRO_TODOS = "__todos__"

const ORDEM_SATURACAO: SaturacaoFiltro[] = ["disponivel", "quase", "esgotado", "sobrecarga"]

type FiltroSidebarProps = {
  operadoras: Operadora[]
  idsOperadoras: number[]
  onMudarIdsOperadoras: (ids: number[]) => void
  status: StatusFiltro | null
  onMudarStatus: (status: StatusFiltro | null) => void
  saturacao: SaturacaoFiltro | null
  onMudarSaturacao: (saturacao: SaturacaoFiltro | null) => void
  coresOperadoras: Record<number, string>
  onMudarCorOperadora: (id: number, cor: string) => void
  onVerNoMapa?: (id: number) => void
  onZoomOperadoraMunicipio?: (idOperadora: number, bounds: BoundsMapa) => void
}

export function FiltroSidebar({
  operadoras,
  idsOperadoras,
  onMudarIdsOperadoras,
  status,
  onMudarStatus,
  saturacao,
  onMudarSaturacao,
  coresOperadoras,
  onMudarCorOperadora,
  onVerNoMapa,
  onZoomOperadoraMunicipio,
}: FiltroSidebarProps) {
  const [busca, setBusca] = useState("")
  // Operadoras não marcadas cuja lista de municípios está aberta pra espiar.
  // As marcadas mostram a lista sempre (é o comportamento pedido: selecionou,
  // aparecem os municípios).
  const [espiando, setEspiando] = useState<Set<number>>(() => new Set())
  const [municipiosPorOperadora, setMunicipiosPorOperadora] = useState<
    Record<number, MunicipioOperadora[] | "carregando" | "erro">
  >({})
  const carregandoRef = useRef<Set<number>>(new Set())

  function garantirMunicipios(id: number) {
    if (municipiosPorOperadora[id] || carregandoRef.current.has(id)) return
    carregandoRef.current.add(id)
    setMunicipiosPorOperadora((atual) => ({ ...atual, [id]: "carregando" }))
    apiFetch(`/api/postes/operadora-municipios?id_operadora=${id}`, { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : Promise.reject(new Error("falhou"))))
      .then((dados: MunicipioOperadora[]) =>
        setMunicipiosPorOperadora((atual) => ({ ...atual, [id]: dados })),
      )
      .catch(() => setMunicipiosPorOperadora((atual) => ({ ...atual, [id]: "erro" })))
      .finally(() => carregandoRef.current.delete(id))
  }

  function alternarEspiar(id: number) {
    setEspiando((atual) => {
      const prox = new Set(atual)
      if (prox.has(id)) prox.delete(id)
      else {
        prox.add(id)
        garantirMunicipios(id)
      }
      return prox
    })
  }

  // Assim que uma operadora entra na seleção, já carrega os municípios dela.
  useEffect(() => {
    for (const id of idsOperadoras) garantirMunicipios(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsOperadoras])

  const operadorasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return operadoras
    return operadoras.filter((operadora) => operadora.RAZAO_SOCIAL.toLowerCase().includes(termo))
  }, [operadoras, busca])

  function alternarOperadora(id: number, marcado: boolean) {
    if (marcado) {
      onMudarIdsOperadoras([...idsOperadoras, id])
    } else {
      onMudarIdsOperadoras(idsOperadoras.filter((idAtual) => idAtual !== id))
    }
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:w-[300px]">
      <h2 className="font-semibold text-slate-900">Filtros</h2>

      <FilterField label="Status">
        <Select
          value={status ?? FILTRO_TODOS}
          onValueChange={(v) => onMudarStatus(v === FILTRO_TODOS || v === null ? null : (v as StatusFiltro))}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todos</SelectItem>
            <SelectItem value="identificado">Identificado</SelectItem>
            <SelectItem value="nao_identificado">Não identificado</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Saturação">
        <Select
          value={saturacao ?? FILTRO_TODOS}
          onValueChange={(v) =>
            onMudarSaturacao(v === FILTRO_TODOS || v === null ? null : (v as SaturacaoFiltro))
          }
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTRO_TODOS}>Todas</SelectItem>
            {ORDEM_SATURACAO.map((nivel) => (
              <SelectItem key={nivel} value={nivel}>
                {SATURACAO_INFO[nivel].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label={`Operadoras${idsOperadoras.length > 0 ? ` (${idsOperadoras.length} selecionada${idsOperadoras.length > 1 ? "s" : ""})` : ""}`}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              placeholder="Buscar operadora..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          {idsOperadoras.length > 0 && (
            <button
              type="button"
              onClick={() => onMudarIdsOperadoras([])}
              className="self-start text-xs font-medium text-primary hover:underline"
            >
              Limpar seleção
            </button>
          )}

          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-100">
            {operadorasFiltradas.length === 0 && (
              <p className="p-3 text-sm text-slate-400">Nenhuma operadora encontrada.</p>
            )}
            {operadorasFiltradas.map((operadora) => {
              const marcado = idsOperadoras.includes(operadora.ID)
              const cor = coresOperadoras[operadora.ID] ?? corPadraoOperadora(operadora.ID)
              // Marcada => lista de municípios sempre visível; não marcada =>
              // só quando o usuário clica no chevron pra espiar.
              const listaAberta = marcado || espiando.has(operadora.ID)
              const municipios = municipiosPorOperadora[operadora.ID]
              return (
                <div key={operadora.ID} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center gap-2 px-2.5 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(event) => alternarOperadora(operadora.ID, event.target.checked)}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span
                      className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full border border-black/10"
                      style={{ backgroundColor: cor }}
                      title="Clique pra escolher a cor desta operadora"
                    >
                      <input
                        type="color"
                        value={cor}
                        onChange={(event) => onMudarCorOperadora(operadora.ID, event.target.value)}
                        className="absolute -inset-1 cursor-pointer opacity-0"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => alternarOperadora(operadora.ID, !marcado)}
                      className="min-w-0 flex-1 truncate text-left text-slate-700"
                      title={operadora.RAZAO_SOCIAL}
                    >
                      {operadora.RAZAO_SOCIAL}
                    </button>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                      {operadora.TOTAL_OCUPACOES}
                    </span>
                    {onVerNoMapa && (
                      <button
                        type="button"
                        onClick={() => onVerNoMapa(operadora.ID)}
                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary"
                        title="Ver no mapa (dá zoom no parque desta operadora)"
                      >
                        <Crosshair className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!marcado && (
                      <button
                        type="button"
                        onClick={() => alternarEspiar(operadora.ID)}
                        aria-expanded={listaAberta}
                        className={`shrink-0 rounded p-1 hover:bg-slate-100 hover:text-primary ${
                          listaAberta ? "text-primary" : "text-slate-400"
                        }`}
                        title="Municípios em que esta operadora atua"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${listaAberta ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>

                  {listaAberta && (
                    <div className="bg-slate-50 px-2.5 pb-2">
                      <p className="px-1 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Municípios da operadora — clique pra dar zoom
                      </p>
                      {(municipios === undefined || municipios === "carregando") && (
                        <p className="px-1 py-1.5 text-xs text-slate-400">Carregando municípios…</p>
                      )}
                      {municipios === "erro" && (
                        <p className="px-1 py-1.5 text-xs text-red-500">Não foi possível carregar os municípios.</p>
                      )}
                      {Array.isArray(municipios) && municipios.length === 0 && (
                        <p className="px-1 py-1.5 text-xs text-slate-400">
                          Sem municípios com postes desta operadora na base.
                        </p>
                      )}
                      {Array.isArray(municipios) && municipios.length > 0 && (
                        <ul className="flex flex-col gap-0.5">
                          {municipios.map((m) => (
                            <li key={m.MUNICIPIO}>
                              <button
                                type="button"
                                onClick={() =>
                                  onZoomOperadoraMunicipio?.(operadora.ID, {
                                    min_x: m.min_x,
                                    max_x: m.max_x,
                                    min_y: m.min_y,
                                    max_y: m.max_y,
                                  })
                                }
                                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-600 hover:bg-white hover:text-primary"
                                title={`Dar zoom nos postes de ${operadora.RAZAO_SOCIAL} em ${m.MUNICIPIO}`}
                              >
                                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="min-w-0 flex-1 truncate">{m.MUNICIPIO}</span>
                                <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 font-medium text-slate-600">
                                  {m.TOTAL.toLocaleString("pt-BR")}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </FilterField>

      <div className="mt-1 flex flex-col gap-1.5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" /> Ocupação identificada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" /> Sem identificação
        </span>
      </div>
    </div>
  )
}
