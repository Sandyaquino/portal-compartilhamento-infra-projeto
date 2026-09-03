"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  MESES_FIN,
  fmtMoedaFin,
  type IndicadorFinanceiro,
  type IndicadorFinanceiroSerie,
} from "@/lib/types/resultado-financeiro"

type Visao = "MENSAL" | "YTD"

const COR_REALIZADO: Record<IndicadorFinanceiro, string> = {
  FATURAMENTO: "#005A34",
  CUSTOS: "#B45309",
  RECEITA_LIQUIDA: "#1D4ED8",
}
const COR_META = "#94A3B8"
const COR_REV = "#0EA5E9"

function dadosDaSerie(serie: IndicadorFinanceiroSerie, visao: Visao) {
  return serie.meses.map((m) => ({
    mes: MESES_FIN[m.mes - 1],
    meta: visao === "YTD" ? m.meta_ytd : m.meta,
    realizado: visao === "YTD" ? m.realizado_ytd : m.realizado,
    rev: visao === "YTD" ? m.rev_ytd : m.rev,
  }))
}

export function GraficoFinanceiro({
  series,
  visao,
  mostrarRev,
}: {
  series: IndicadorFinanceiroSerie[]
  visao: Visao
  mostrarRev: boolean
}) {
  return (
    <div className="space-y-5">
      {series.map((serie) => (
        <div key={serie.indicador} className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <span>{serie.label}</span>
            <span className="text-slate-400">{visao === "YTD" ? "Acumulado (YTD)" : "Mensal"}</span>
          </div>
          <div className="h-[280px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosDaSerie(serie, visao)} margin={{ top: 16, right: 20, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis
                  width={72}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={(v: number) => fmtMoedaFin(v, true)}
                />
                <Tooltip
                  formatter={(v) => fmtMoedaFin(typeof v === "number" ? v : null)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="meta"
                  name="Meta"
                  stroke={COR_META}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="realizado"
                  name="Realizado"
                  stroke={COR_REALIZADO[serie.indicador]}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
                {mostrarRev && (
                  <Line
                    type="monotone"
                    dataKey="rev"
                    name="REV"
                    stroke={COR_REV}
                    strokeWidth={2}
                    strokeDasharray="2 3"
                    dot={{ r: 3 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  )
}
