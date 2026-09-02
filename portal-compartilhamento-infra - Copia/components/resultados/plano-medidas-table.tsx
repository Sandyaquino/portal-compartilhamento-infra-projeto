"use client"

import { AlertTriangle, ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/resultados/status-badge"
import { RiscoBadge } from "@/components/resultados/risco-badge"
import { estaVencido, formatarDesvio, formatarPrazoCurto, type PlanoMedidaItem } from "@/lib/types/plano-medidas"

export type SortField = "PRAZO" | "STATUS"
export type SortDirection = "asc" | "desc"

type PlanoMedidasTableProps = {
  itens: PlanoMedidaItem[]
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
  onEditar: (item: PlanoMedidaItem) => void
  onExcluir: (item: PlanoMedidaItem) => void
}

function SortButton({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
}: {
  label: string
  field: SortField
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}) {
  const ativo = sortField === field

  return (
    <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-slate-800">
      {label}
      {ativo && (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  )
}

function corDesvio(valor: number | null) {
  if (valor === null || valor === undefined) return "text-slate-500"
  return valor < 0 ? "text-red-600" : "text-green-600"
}

export function PlanoMedidasTable({ itens, sortField, sortDirection, onSort, onEditar, onExcluir }: PlanoMedidasTableProps) {
  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <EmptyState message="Nenhuma medida encontrada." />
      </div>
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <Table className="min-w-[1200px] text-sm">
          <TableHeader>
            <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <TableHead className="p-2 text-left">KPI</TableHead>
              <TableHead className="p-2 text-left">Bloco</TableHead>
              <TableHead className="p-2 text-left">Mês</TableHead>
              <TableHead className="p-2 text-center">Desvio</TableHead>
              <TableHead className="p-2 text-left">Causa Raiz</TableHead>
              <TableHead className="p-2 text-left">Ação</TableHead>
              <TableHead className="p-2 text-left">Responsável</TableHead>
              <TableHead className="p-2 text-left">
                <SortButton label="Prazo" field="PRAZO" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              </TableHead>
              <TableHead className="p-2 text-left">
                <SortButton label="Status" field="STATUS" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
              </TableHead>
              <TableHead className="p-2 text-left">Risco</TableHead>
              <TableHead className="p-2 text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => {
              const vencido = estaVencido(item)
              return (
                <TableRow key={item.ID} className={vencido ? "bg-red-50" : undefined}>
                  <TableCell className="max-w-[220px] truncate p-2 font-medium text-slate-800" title={item.KPI}>
                    {item.KPI}
                  </TableCell>
                  <TableCell className="p-2 text-slate-600">{item.BLOCO}</TableCell>
                  <TableCell className="p-2 text-slate-600">{item.MES}</TableCell>
                  <TableCell className={`p-2 text-center font-semibold ${corDesvio(item.DESVIO_IDENTIFICADO)}`}>
                    {formatarDesvio(item.DESVIO_IDENTIFICADO)}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate p-2 text-slate-600" title={item.CAUSA_RAIZ ?? ""}>
                    {item.CAUSA_RAIZ || "-"}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate p-2 text-slate-600" title={item.MEDIDA_ACAO}>
                    {item.MEDIDA_ACAO}
                  </TableCell>
                  <TableCell className="p-2 text-slate-600">{item.RESPONSAVEL}</TableCell>
                  <TableCell className={`p-2 ${vencido ? "font-semibold text-red-700" : "text-slate-600"}`}>
                    <span className="inline-flex items-center gap-1">
                      {formatarPrazoCurto(item.PRAZO)}
                      {vencido && <AlertTriangle className="h-3.5 w-3.5" />}
                    </span>
                  </TableCell>
                  <TableCell className="p-2"><StatusBadge status={item.STATUS} /></TableCell>
                  <TableCell className="p-2"><RiscoBadge risco={item.RISCO} /></TableCell>
                  <TableCell className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => onEditar(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => onExcluir(item)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {itens.map((item) => {
          const vencido = estaVencido(item)
          return (
            <div
              key={item.ID}
              className={`rounded-xl border p-3 shadow-sm ${vencido ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900" title={item.KPI}>{item.KPI}</p>
                  <p className="text-xs text-slate-500">{item.BLOCO} · {item.MES}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => onEditar(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onExcluir(item)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <p className="mt-2 text-sm text-slate-600">{item.MEDIDA_ACAO}</p>
              {item.CAUSA_RAIZ && <p className="mt-1 text-xs text-slate-500">Causa: {item.CAUSA_RAIZ}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={item.STATUS} />
                <RiscoBadge risco={item.RISCO} />
                <span className={`text-xs font-semibold ${corDesvio(item.DESVIO_IDENTIFICADO)}`}>
                  {formatarDesvio(item.DESVIO_IDENTIFICADO)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{item.RESPONSAVEL}</span>
                <span className={vencido ? "font-semibold text-red-700" : ""}>
                  {formatarPrazoCurto(item.PRAZO)}
                  {vencido ? " · vencido" : ""}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
