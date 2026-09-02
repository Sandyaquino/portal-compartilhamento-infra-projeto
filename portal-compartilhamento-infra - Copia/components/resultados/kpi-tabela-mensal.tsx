"use client"

import { useEffect, useState } from "react"

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { KpiStatusBadge } from "@/components/resultados/kpi-status-badge"
import { formatarNumeroKpi, formatarPercentual, type KpiLancamento } from "@/lib/types/kpis-mensal"

const INPUT_CLASS = "h-8 w-24 text-right"

type RowState = { meta: string; realizado: string; observacao: string }

function estadoInicial(lancamentos: KpiLancamento[]): Record<string, RowState> {
  const estado: Record<string, RowState> = {}
  for (const l of lancamentos) {
    estado[l.MES] = {
      meta: String(l.META ?? 0),
      realizado: l.REALIZADO === null || l.REALIZADO === undefined ? "" : String(l.REALIZADO),
      observacao: l.OBSERVACAO ?? "",
    }
  }
  return estado
}

type KpiTabelaMensalProps = {
  kpiId: number
  lancamentos: KpiLancamento[]
  onSalvar: (mes: string, meta: number, realizado: number | null, observacao: string | null) => Promise<void>
}

export function KpiTabelaMensal({ kpiId, lancamentos, onSalvar }: KpiTabelaMensalProps) {
  const [linhas, setLinhas] = useState<Record<string, RowState>>(() => estadoInicial(lancamentos))
  const [salvandoMes, setSalvandoMes] = useState<string | null>(null)
  const [erroMes, setErroMes] = useState<string | null>(null)

  useEffect(() => {
    setLinhas(estadoInicial(lancamentos))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiId, lancamentos])

  function atualizarCampo(mes: string, campo: keyof RowState, valor: string) {
    setLinhas((atual) => ({ ...atual, [mes]: { ...atual[mes], [campo]: valor } }))
  }

  async function salvarLinha(mes: string) {
    const linha = linhas[mes]
    if (!linha) return

    const meta = linha.meta.trim() === "" ? 0 : Number(linha.meta)
    const realizado = linha.realizado.trim() === "" ? null : Number(linha.realizado)

    if (Number.isNaN(meta) || (realizado !== null && Number.isNaN(realizado))) {
      setErroMes(mes)
      return
    }

    setSalvandoMes(mes)
    setErroMes(null)
    try {
      await onSalvar(mes, meta, realizado, linha.observacao.trim() || null)
    } catch {
      setErroMes(mes)
    } finally {
      setSalvandoMes(null)
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table className="min-w-[900px] text-sm">
        <TableHeader>
          <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <TableHead className="p-2 text-left">Mês</TableHead>
            <TableHead className="p-2 text-right">Meta</TableHead>
            <TableHead className="p-2 text-right">Realizado</TableHead>
            <TableHead className="p-2 text-right">Desvio</TableHead>
            <TableHead className="p-2 text-right">% Desvio</TableHead>
            <TableHead className="p-2 text-center">Status</TableHead>
            <TableHead className="p-2 text-left">Observação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancamentos.map((lancamento) => {
            const linha = linhas[lancamento.MES] ?? { meta: "", realizado: "", observacao: "" }
            return (
              <TableRow key={lancamento.MES} className={erroMes === lancamento.MES ? "bg-red-50" : undefined}>
                <TableCell className="p-2 font-medium text-slate-800">{lancamento.MES}</TableCell>
                <TableCell className="p-2 text-right">
                  <Input
                    type="number"
                    step="0.01"
                    className={INPUT_CLASS}
                    value={linha.meta}
                    onChange={(e) => atualizarCampo(lancamento.MES, "meta", e.target.value)}
                    onBlur={() => salvarLinha(lancamento.MES)}
                  />
                </TableCell>
                <TableCell className="p-2 text-right">
                  <Input
                    type="number"
                    step="0.01"
                    className={INPUT_CLASS}
                    placeholder="-"
                    value={linha.realizado}
                    onChange={(e) => atualizarCampo(lancamento.MES, "realizado", e.target.value)}
                    onBlur={() => salvarLinha(lancamento.MES)}
                  />
                </TableCell>
                <TableCell className={`p-2 text-right font-semibold ${lancamento.DESVIO !== null && lancamento.DESVIO < 0 ? "text-red-600" : "text-slate-600"}`}>
                  {formatarNumeroKpi(lancamento.DESVIO)}
                </TableCell>
                <TableCell className="p-2 text-right text-slate-600">{formatarPercentual(lancamento.PERCENTUAL_DESVIO)}</TableCell>
                <TableCell className="p-2 text-center">
                  <KpiStatusBadge status={lancamento.STATUS} />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    className="h-8 w-full min-w-[180px]"
                    value={linha.observacao}
                    onChange={(e) => atualizarCampo(lancamento.MES, "observacao", e.target.value)}
                    onBlur={() => salvarLinha(lancamento.MES)}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {salvandoMes && <p className="px-3 py-1.5 text-xs text-slate-500">Salvando {salvandoMes}...</p>}
      {erroMes && <p className="px-3 py-1.5 text-xs font-medium text-destructive">Erro ao salvar {erroMes}. Tente novamente.</p>}
    </div>
  )
}
