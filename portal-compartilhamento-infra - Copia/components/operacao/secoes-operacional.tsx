"use client"

import { useMemo, type ReactNode } from "react"
import { Activity, AlertTriangle, Bed, Boxes, Cable, ClipboardList, MapPin, Percent, Warehouse, Wrench } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
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
import { KpiCard } from "@/components/comercial/kpi-card"
import type { DadosDashboard } from "@/components/operacao/dashboard-campo"

const LIMITE_PERCENTUAL_PLAUSIVEL = 150

function formatarNumero(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0" : numero.toLocaleString("pt-BR")
}

function formatarPercentual(valor: number | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "0%"
  return `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function formatarCabosKm(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "0 km"
  const km = numero >= 1000 ? numero / 1000 : numero
  return `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

function formatarToneladas(valor: number | undefined | null) {
  return `${Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`
}

type RankingItem = { posicao?: number; equipe: string; eps: string; postes: number; cabos: number | string; caixas: number; os?: number }
type ProducaoEpsItem = { eps: string; equipes: number; postes: number; cabos: number; caixas: number }

export function SecoesOperacional({ dados }: { dados: DadosDashboard }) {
  const resumo = dados.resumo
  const evolucao = dados.evolucao
  const evolucaoApresentacao = useMemo(() => dados.extra["evolucao-apresentacao"] ?? [], [dados.extra])
  const rankingEquipes = useMemo(() => (dados.extra.ranking ?? []) as RankingItem[], [dados.extra.ranking])

  const producaoPorEps = useMemo<ProducaoEpsItem[]>(() => {
    const agrupado = new Map<string, ProducaoEpsItem>()
    rankingEquipes.forEach((item) => {
      const eps = item.eps || "SEM EPS"
      if (!agrupado.has(eps)) agrupado.set(eps, { eps, equipes: 0, postes: 0, cabos: 0, caixas: 0 })
      const atual = agrupado.get(eps)!
      atual.equipes += 1
      atual.postes += Number(item.postes ?? 0)
      atual.cabos += Number(item.cabos ?? 0)
      atual.caixas += Number(item.caixas ?? 0)
    })
    return Array.from(agrupado.values()).sort((a, b) => b.postes - a.postes)
  }, [rankingEquipes])

  const situacaoTurmas = useMemo(() => {
    const turmasOficiais = resumo.turmas_oficiais || 0
    const calc = (valor: number) => (turmasOficiais ? formatarPercentual((valor / turmasOficiais) * 100) : "0%")
    return [
      { nome: "Apresentadas", quantidade: resumo.turmas_apresentadas ?? 0, percentual: calc(resumo.turmas_apresentadas ?? 0), cor: "bg-green-600", texto: "text-green-700" },
      { nome: "Pendentes", quantidade: resumo.turmas_pendentes ?? 0, percentual: calc(resumo.turmas_pendentes ?? 0), cor: "bg-orange-500", texto: "text-orange-700" },
      { nome: "Manutenção", quantidade: resumo.manutencao ?? 0, percentual: calc(resumo.manutencao ?? 0), cor: "bg-red-500", texto: "text-red-700" },
      { nome: "Folga", quantidade: resumo.folga ?? 0, percentual: calc(resumo.folga ?? 0), cor: "bg-purple-500", texto: "text-purple-700" },
    ]
  }, [resumo])

  const pendencias = useMemo<{ titulo: string; descricao: string; valor: number; cor: string; icon: ReactNode }[]>(() => {
    const manutencao = resumo.manutencao ?? 0
    const folga = resumo.folga ?? 0
    const semAtividade = resumo.sem_atividade ?? 0
    const semOs = resumo.sem_os ?? 0
    return [
      { titulo: "Caminhão em manutenção", descricao: `${manutencao} equipe(s)`, valor: manutencao, cor: "bg-red-50 text-red-700", icon: <Wrench className="h-4 w-4" /> },
      { titulo: "Equipe de folga", descricao: `${folga} equipe(s)`, valor: folga, cor: "bg-yellow-50 text-yellow-700", icon: <Bed className="h-4 w-4" /> },
      { titulo: "Sem atividade registrada", descricao: `${semAtividade} equipe(s)`, valor: semAtividade, cor: "bg-slate-50 text-slate-700", icon: <Activity className="h-4 w-4" /> },
      { titulo: "OS sem número", descricao: `${semOs} ocorrência(s)`, valor: semOs, cor: "bg-orange-50 text-orange-700", icon: <ClipboardList className="h-4 w-4" /> },
    ]
  }, [resumo])

  return (
    <>
      {/* Segunda linha de KPIs (com o card custom de cabos) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="Postes Executados" value={formatarNumero(resumo.postes)} subtitle="Postes" icon={Warehouse} color="text-primary" />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-blue-600"><Cable className="h-6 w-6" /></div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">CABOS REMOVIDOS</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-3xl font-bold text-blue-600">{formatarCabosKm(resumo.cabos)}</p>
              <p className="text-xs text-slate-500">Quilometragem</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">{formatarToneladas(Number(resumo.cabos) * 0.0001062)}</p>
              <p className="text-xs text-slate-500">Toneladas</p>
            </div>
          </div>
        </div>
        <KpiCard title="Caixas Removidas" value={formatarNumero(resumo.caixas)} subtitle="Caixas" icon={Boxes} color="text-orange-600" />
        <KpiCard title="Municípios" value={formatarNumero(resumo.municipios)} subtitle="Municípios atendidos" icon={MapPin} color="text-green-600" />
        {(resumo.percentual_execucao_os ?? 0) > LIMITE_PERCENTUAL_PLAUSIVEL ? (
          <KpiCard title="% Execução das OS" value="Dado inconsistente" subtitle="Verifique NUMERO_OS na origem" icon={AlertTriangle} color="text-red-600" />
        ) : (
          <KpiCard title="% Execução das OS" value={formatarPercentual(resumo.percentual_execucao_os)} subtitle="Postes sinalizados vs. planejado (GEOS)" icon={Percent} color="text-primary" />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Evolução da Produção Diária</h2>
            <p className="text-sm text-slate-500">Postes executados, toneladas de cabos removidos e caixas removidas.</p>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucao} margin={{ top: 20, right: 18, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPostes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#005A34" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#005A34" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "Toneladas") return [`${(Number(value) * 0.0001062).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`, "Toneladas"]
                    if (name === "Caixas") return [value, "Caixas"]
                    return [value, "Postes"]
                  }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }}
                />
                <Legend />
                <Area type="monotone" dataKey="postes" name="Postes" stroke="#005A34" strokeWidth={3} fill="url(#colorPostes)" />
                <Line type="monotone" dataKey="cabos" name="Toneladas" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="caixas" name="Caixas" stroke="#F97316" strokeWidth={3} dot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Situação das Turmas</h2>
            <p className="text-sm text-slate-500">Distribuição operacional no período filtrado.</p>
          </div>
          <div className="mb-6 flex justify-center">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-green-100">
              <div className="absolute h-32 w-32 rounded-full bg-white" />
              <div className="z-10 text-center">
                <p className="text-3xl font-bold text-primary">{formatarNumero(resumo.turmas_oficiais)}</p>
                <p className="text-xs text-slate-500">Turmas</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {situacaoTurmas.map((item) => (
              <div key={item.nome} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${item.cor}`} />
                  <span className="text-sm text-slate-600">{item.nome}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{item.quantidade}</p>
                  <p className={`text-xs ${item.texto}`}>{item.percentual}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Evolução da Apresentação das Turmas</h2>
          <p className="text-sm text-slate-500">Comparativo diário entre turmas oficiais, apresentadas e percentual de apresentação.</p>
        </div>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolucaoApresentacao} margin={{ top: 20, right: 18, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="colorApresentadas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#005A34" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#005A34" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis yAxisId="turmas" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis yAxisId="percentual" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748B" }} tickFormatter={(value) => `${value}%`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "%Apresentação") return [`${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`, "Apresentação"]
                  return [Number(value).toLocaleString("pt-BR"), name]
                }}
                contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }}
                labelStyle={{ color: "#0F172A", fontWeight: 600 }}
              />
              <Legend />
              <Line yAxisId="turmas" type="monotone" dataKey="turmas_oficiais" name="Turmas oficiais" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Area yAxisId="turmas" type="monotone" dataKey="turmas_apresentadas" name="Turmas apresentadas" stroke="#005A34" strokeWidth={3} fill="url(#colorApresentadas)" dot={{ r: 4, fill: "#005A34", strokeWidth: 2, stroke: "#FFFFFF" }} activeDot={{ r: 6, fill: "#005A34", strokeWidth: 2, stroke: "#FFFFFF" }} />
              <Line yAxisId="percentual" type="monotone" dataKey="percentual_apresentacao" name="%Apresentação" stroke="#F97316" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Ranking de Equipes por Produção</h2>
          <div className="overflow-x-auto">
            <Table className="min-w-[720px] text-sm">
              <TableHeader>
                <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <TableHead className="p-2 text-left">#</TableHead>
                  <TableHead className="p-2 text-left">Equipe</TableHead>
                  <TableHead className="p-2 text-left">EPS</TableHead>
                  <TableHead className="p-2 text-center">Postes</TableHead>
                  <TableHead className="p-2 text-center">Cabos (m)</TableHead>
                  <TableHead className="p-2 text-center">Caixas</TableHead>
                  <TableHead className="p-2 text-center">OS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankingEquipes.length === 0 ? (
                  <TableRow><TableCell colSpan={7}><EmptyState message="Nenhum registro encontrado." /></TableCell></TableRow>
                ) : (
                  rankingEquipes.map((item) => (
                    <TableRow key={`${item.posicao}-${item.equipe}`}>
                      <TableCell className="p-2 font-semibold text-slate-500">{item.posicao}</TableCell>
                      <TableCell className="p-2 font-medium text-slate-800">{item.equipe}</TableCell>
                      <TableCell className="p-2 text-slate-500">{item.eps}</TableCell>
                      <TableCell className="p-2 text-center font-semibold text-primary">{formatarNumero(item.postes)}</TableCell>
                      <TableCell className="p-2 text-center font-semibold text-blue-600">{formatarNumero(item.cabos)}</TableCell>
                      <TableCell className="p-2 text-center font-semibold text-orange-600">{formatarNumero(item.caixas)}</TableCell>
                      <TableCell className="p-2 text-center font-semibold text-slate-700">{formatarNumero(item.os)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Produção por EPS</h2>
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableHead className="p-2 text-left">EPS</TableHead>
                <TableHead className="p-2 text-center">Equipes</TableHead>
                <TableHead className="p-2 text-center">Postes</TableHead>
                <TableHead className="p-2 text-center">Caixas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producaoPorEps.length === 0 ? (
                <TableRow><TableCell colSpan={4}><EmptyState message="Nenhum registro encontrado." /></TableCell></TableRow>
              ) : (
                producaoPorEps.map((item) => (
                  <TableRow key={item.eps}>
                    <TableCell className="p-2 font-medium text-slate-800">{item.eps}</TableCell>
                    <TableCell className="p-2 text-center text-slate-600">{formatarNumero(item.equipes)}</TableCell>
                    <TableCell className="p-2 text-center font-semibold text-primary">{formatarNumero(item.postes)}</TableCell>
                    <TableCell className="p-2 text-center font-semibold text-orange-600">{formatarNumero(item.caixas)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">Pendências Operacionais</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pendencias.map((item) => (
            <div key={item.titulo} className={`flex items-center justify-between rounded-lg p-3 ${item.cor}`}>
              <div className="flex items-center gap-3">
                {item.icon}
                <div>
                  <p className="text-sm font-semibold">{item.titulo}</p>
                  <p className="text-xs opacity-75">{item.descricao}</p>
                </div>
              </div>
              <strong>{item.valor}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
