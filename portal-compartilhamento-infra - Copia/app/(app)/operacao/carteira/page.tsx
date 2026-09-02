"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Gauge, ListChecks, MapPin } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
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
import { API_BASE_URL } from "@/lib/config"
import type { Operadora, ResumoPostes } from "@/lib/types/postes"

export default function CarteiraPage() {
  const [resumo, setResumo] = useState<ResumoPostes | null>(null)
  const [operadoras, setOperadoras] = useState<Operadora[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/postes/resumo`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE_URL}/api/postes/operadoras`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([resumoData, operadorasData]) => {
        setResumo(resumoData)
        setOperadoras(Array.isArray(operadorasData) ? operadorasData : [])
      })
      .catch(() => {
        setResumo(null)
        setOperadoras([])
      })
      .finally(() => setLoading(false))
  }, [])

  const totalOcupacoes = operadoras.reduce((total, op) => total + Number(op.TOTAL_OCUPACOES ?? 0), 0)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Carteira"
        description="Visão consolidada do parque de postes e das ocupações compartilhadas."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Operação", href: "/operacao" },
          { label: "Carteira" },
        ]}
        actions={
          <Link href="/mapa-postes">
            <Button type="button" variant="outline">
              <MapPin className="h-4 w-4" />
              Abrir Mapa de Postes
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando carteira...</p>
      ) : !resumo ? (
        <EmptyState
          message="Não foi possível carregar o resumo da carteira."
          className="rounded-xl border border-slate-200 bg-slate-50 p-8"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Postes"
              value={(resumo.total_postes ?? 0).toLocaleString("pt-BR")}
              subtitle="Total cadastrado"
              icon={MapPin}
              color="text-primary"
            />
            <KpiCard
              title="Ocupações"
              value={(resumo.total_ocupacoes ?? 0).toLocaleString("pt-BR")}
              subtitle="Registros de terceiros"
              icon={ListChecks}
              color="text-slate-600"
            />
            <KpiCard
              title="Identificados"
              value={`${resumo.percentual_identificado ?? 0}%`}
              subtitle={`${(resumo.postes_identificados ?? 0).toLocaleString("pt-BR")} postes com ocupação identificada`}
              icon={CheckCircle2}
              color="text-green-600"
            />
            <KpiCard
              title="Esgotados"
              value={resumo.postes_esgotados != null ? resumo.postes_esgotados.toLocaleString("pt-BR") : "n/d"}
              subtitle={
                resumo.postes_sobrecarga != null
                  ? `${resumo.postes_sobrecarga.toLocaleString("pt-BR")} em sobrecarga`
                  : "Sem dado de capacidade do poste"
              }
              icon={AlertTriangle}
              color="text-red-600"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Ocupação por operadora</h2>
                <p className="text-sm text-slate-500">
                  {operadoras.length} operadoras · {totalOcupacoes.toLocaleString("pt-BR")} ocupações no total
                </p>
              </div>
              <Gauge className="h-5 w-5 text-slate-400" />
            </div>

            {operadoras.length === 0 ? (
              <EmptyState message="Nenhuma operadora cadastrada." />
            ) : (
              <Table className="text-sm">
                <TableHeader className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <TableRow>
                    <TableHead className="px-4 py-3">Operadora</TableHead>
                    <TableHead className="px-4 py-3">CNPJ</TableHead>
                    <TableHead className="px-4 py-3 text-right">Ocupações</TableHead>
                    <TableHead className="px-4 py-3 text-right">Participação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...operadoras]
                    .sort((a, b) => Number(b.TOTAL_OCUPACOES ?? 0) - Number(a.TOTAL_OCUPACOES ?? 0))
                    .map((operadora) => {
                      const ocup = Number(operadora.TOTAL_OCUPACOES ?? 0)
                      const participacao = totalOcupacoes ? (ocup / totalOcupacoes) * 100 : 0
                      return (
                        <TableRow key={operadora.ID}>
                          <TableCell className="px-4 py-3 font-medium text-slate-800">{operadora.RAZAO_SOCIAL}</TableCell>
                          <TableCell className="px-4 py-3 text-slate-600">{operadora.CNPJ}</TableCell>
                          <TableCell className="px-4 py-3 text-right font-semibold text-slate-800">
                            {ocup.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right text-slate-600">
                            {participacao.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
