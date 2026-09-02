"use client"

import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { EmptyState } from "@/components/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DadosDashboard } from "@/components/operacao/dashboard-campo"

const CORES_EMPRESA = ["#005A34", "#2563EB", "#F97316", "#7C3AED", "#0F766E", "#DC2626"]
const CORES_STATUS = ["#16A34A", "#F97316", "#2563EB", "#94A3B8", "#7C3AED", "#DC2626"]

function formatarNumero(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0" : numero.toLocaleString("pt-BR")
}

function formatarPercentual(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "0,0%"
  return `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function SecoesFiscalizacao({ dados }: { dados: DadosDashboard }) {
  const evolucao = dados.evolucao
  const empresas = useMemo(() => dados.extra.empresas ?? [], [dados.extra.empresas])
  const municipios = useMemo(() => dados.extra.municipios ?? [], [dados.extra.municipios])
  const tiposOs = useMemo(() => dados.extra["tipos-os"] ?? [], [dados.extra])
  const status = useMemo(() => dados.extra.status ?? [], [dados.extra.status])

  const topMunicipios = useMemo(() => municipios.slice(0, 10), [municipios])
  const topTiposOs = useMemo(() => tiposOs.slice(0, 8), [tiposOs])
  const municipiosTabela = useMemo(() => municipios.slice(0, 12), [municipios])
  const resumoStatus = useMemo(() => {
    const total = status.reduce((acc, item) => acc + Number(item.registros ?? 0), 0)
    return status.map((item) => ({
      ...item,
      percentual: total > 0 ? (Number(item.registros ?? 0) / total) * 100 : 0,
    }))
  }, [status])

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Evolução das Fiscalizações</h2>
            <p className="text-sm text-slate-500">Evolução diária de postes fiscalizados, OS e técnicos apresentados.</p>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucao} margin={{ top: 20, right: 18, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPostesTecnico" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#005A34" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#005A34" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "Postes") return [formatarNumero(value as number), "Postes"]
                    if (name === "OS") return [formatarNumero(value as number), "OS"]
                    if (name === "Técnicos") return [formatarNumero(value as number), "Técnicos"]
                    return [value, name]
                  }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }}
                />
                <Legend />
                <Area type="monotone" dataKey="postes" name="Postes" stroke="#005A34" strokeWidth={3} fill="url(#colorPostesTecnico)" />
                <Line type="monotone" dataKey="os" name="OS" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="tecnicos" name="Técnicos" stroke="#F97316" strokeWidth={3} dot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Distribuição por Empresa</h2>
            <p className="text-sm text-slate-500">Participação por volume de postes fiscalizados.</p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={empresas} nameKey="empresa" dataKey="postes" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {empresas.map((item, index) => (
                    <Cell key={item.empresa} fill={CORES_EMPRESA[index % CORES_EMPRESA.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatarNumero(value as number), "Postes"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {empresas.slice(0, 5).map((item, index) => (
              <div key={item.empresa} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CORES_EMPRESA[index % CORES_EMPRESA.length] }} />
                  <span className="text-slate-600">{item.empresa}</span>
                </div>
                <strong className="text-slate-800">{formatarNumero(item.postes)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Status das Fiscalizações</h2>
            <p className="text-sm text-slate-500">Classificação pela observação registrada.</p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={resumoStatus} nameKey="status" dataKey="registros" innerRadius={54} outerRadius={88} paddingAngle={3}>
                  {resumoStatus.map((item, index) => (
                    <Cell key={item.status} fill={CORES_STATUS[index % CORES_STATUS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatarNumero(value as number), "Registros"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {resumoStatus.map((item, index) => (
              <div key={item.status} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CORES_STATUS[index % CORES_STATUS.length] }} />
                  <span className="text-slate-600">{item.status}</span>
                </div>
                <span className="font-semibold text-slate-800">
                  {formatarNumero(item.registros)} · {formatarPercentual(item.percentual)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Municípios com Fiscalização</h2>
              <p className="text-sm text-slate-500">Municípios por volume de postes fiscalizados.</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">Top 10 municípios</div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMunicipios} margin={{ top: 12, right: 18, left: -18, bottom: 45 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="municipio" interval={0} angle={-25} textAnchor="end" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748B" }} />
                <Tooltip formatter={(value) => [formatarNumero(value as number), "Postes"]} />
                <Bar dataKey="postes" name="Postes" fill="#005A34" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Resumo por Município</h2>
          <div className="overflow-x-auto">
            <Table className="min-w-[720px] text-sm">
              <TableHeader>
                <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <TableHead className="p-2 text-left">Município</TableHead>
                  <TableHead className="p-2 text-center">Postes</TableHead>
                  <TableHead className="p-2 text-center">OS</TableHead>
                  <TableHead className="p-2 text-center">Técnicos</TableHead>
                  <TableHead className="p-2 text-center">Registros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipiosTabela.length === 0 ? (
                  <TableRow><TableCell colSpan={5}><EmptyState message="Nenhum município encontrado." /></TableCell></TableRow>
                ) : (
                  municipiosTabela.map((item) => (
                    <TableRow key={item.municipio}>
                      <TableCell className="p-2 font-medium text-slate-800">{item.municipio}</TableCell>
                      <TableCell className="p-2 text-center font-semibold text-primary">{formatarNumero(item.postes)}</TableCell>
                      <TableCell className="p-2 text-center text-slate-700">{formatarNumero(item.os)}</TableCell>
                      <TableCell className="p-2 text-center text-slate-700">{formatarNumero(item.tecnicos)}</TableCell>
                      <TableCell className="p-2 text-center text-slate-700">{formatarNumero(item.registros)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Tipos de OS</h2>
          <div className="space-y-3">
            {topTiposOs.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum tipo de OS encontrado.</p>
            ) : (
              topTiposOs.map((item) => (
                <div key={item.tipo_os} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-800" title={item.tipo_os}>{item.tipo_os}</p>
                    <span className="text-sm font-bold text-primary">{formatarNumero(item.postes)}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatarNumero(item.os)} OS · {formatarNumero(item.registros)} registros
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
