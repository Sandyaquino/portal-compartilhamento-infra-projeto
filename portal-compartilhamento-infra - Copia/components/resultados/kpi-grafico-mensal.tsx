"use client"

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { KpiLancamento } from "@/lib/types/kpis-mensal"

export function KpiGraficoMensal({ lancamentos }: { lancamentos: KpiLancamento[] }) {
  const dados = lancamentos.map((l) => ({
    mes: l.MES,
    meta: l.META,
    realizado: l.REALIZADO,
  }))

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 20, right: 18, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #E2E8F0",
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="meta" name="Meta" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
          <Line type="monotone" dataKey="realizado" name="Realizado" stroke="#005A34" strokeWidth={3} dot={{ r: 4 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
