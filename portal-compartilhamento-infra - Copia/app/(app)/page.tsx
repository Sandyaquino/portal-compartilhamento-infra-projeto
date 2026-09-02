import {
  FileText,
  Landmark,
  ClipboardCheck,
  TrendingUp,
} from "lucide-react"
import { KpiCard } from "@/components/comercial/kpi-card"

export default function Home() {
  return (
    <div className="space-y-6 p-6">
      {/* Cabeçalho */}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-primary">
          Portal de Compartilhamento de Infraestrutura
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Gestão de contratos, faturamento e fiscalização.
        </p>
      </div>

      {/* Cards */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileText}
          title="Contratos Ativos"
          value={0}
          subtitle=""
          color="text-primary"
        />

        <KpiCard
          icon={TrendingUp}
          title="Potencial Incremento"
          value="R$ 0,00"
          subtitle=""
          color="text-orange-500"
        />

        <KpiCard
          icon={Landmark}
          title="Postes Faturados"
          value={0}
          subtitle=""
          color="text-primary"
        />

        <KpiCard
          icon={ClipboardCheck}
          title="Fiscalizações"
          value={0}
          subtitle=""
          color="text-primary"
        />
      </div>
    </div>
  )
}
