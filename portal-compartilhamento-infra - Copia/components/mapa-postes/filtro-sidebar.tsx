"use client"

import { useMemo, useState } from "react"
import { Crosshair, Search } from "lucide-react"

import { FilterField } from "@/components/ui/filter-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  corPadraoOperadora,
  SATURACAO_INFO,
  type Operadora,
  type SaturacaoFiltro,
  type StatusFiltro,
} from "@/lib/types/postes"

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
}: FiltroSidebarProps) {
  const [busca, setBusca] = useState("")

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
              return (
                <div
                  key={operadora.ID}
                  className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2 text-sm last:border-b-0 hover:bg-slate-50"
                >
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
