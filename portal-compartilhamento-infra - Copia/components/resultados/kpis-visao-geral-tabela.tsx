"use client"

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { KpiStatusDot } from "@/components/resultados/kpi-status-badge"
import { MESES, type KpiVisaoGeral } from "@/lib/types/kpis-mensal"

export function KpisVisaoGeralTabela({ itens }: { itens: KpiVisaoGeral[] }) {
  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <EmptyState message="Nenhum KPI cadastrado." />
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table className="min-w-[1000px] text-sm">
        <TableHeader>
          <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <TableHead className="p-2 text-left">Bloco</TableHead>
            <TableHead className="p-2 text-left">KPI</TableHead>
            {MESES.map((mes) => (
              <TableHead key={mes} className="p-2 text-center">{mes}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => (
            <TableRow key={item.ID}>
              <TableCell className="p-2 text-slate-600">{item.BLOCO}</TableCell>
              <TableCell className="max-w-[240px] truncate p-2 font-medium text-slate-800" title={item.KPI}>
                {item.KPI}
              </TableCell>
              {MESES.map((mes) => {
                const dadoMes = item.MESES.find((m) => m.MES === mes)
                return (
                  <TableCell key={mes} className="p-2 text-center">
                    <span className="inline-flex justify-center" title={dadoMes?.STATUS ?? "Sem lançamento"}>
                      <KpiStatusDot status={dadoMes?.STATUS ?? null} />
                    </span>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
