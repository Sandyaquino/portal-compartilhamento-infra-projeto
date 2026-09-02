import { AlertTriangle, CheckCircle2, Ruler, Target, XCircle } from "lucide-react"

import { KpiCard } from "@/components/comercial/kpi-card"
import type { KpiCadastro, KpiLancamento } from "@/lib/types/kpis-mensal"

export function KpiResumoCards({ kpi, lancamentos }: { kpi: KpiCadastro; lancamentos: KpiLancamento[] }) {
  const verdes = lancamentos.filter((l) => l.STATUS === "verde").length
  const amarelos = lancamentos.filter((l) => l.STATUS === "amarelo").length
  const vermelhos = lancamentos.filter((l) => l.STATUS === "vermelho").length

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard title="Unidade" value={kpi.UNIDADE} subtitle={kpi.TIPO} icon={Ruler} color="text-primary" />
      <KpiCard title="Bloco" value={kpi.BLOCO} subtitle={kpi.KPI} icon={Target} color="text-slate-600" />
      <KpiCard title="Dentro da Meta" value={String(verdes)} subtitle="Meses no ano" icon={CheckCircle2} color="text-green-600" />
      <KpiCard title="Atenção" value={String(amarelos)} subtitle="Meses no ano" icon={AlertTriangle} color="text-amber-600" />
      <KpiCard title="Fora da Meta" value={String(vermelhos)} subtitle="Meses no ano" icon={XCircle} color="text-red-600" />
    </div>
  )
}
