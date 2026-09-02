import type { KpiStatus } from "@/lib/types/kpis-mensal"

const STATUS_CLASS: Record<KpiStatus, string> = {
  verde: "border-green-200 bg-green-100 text-green-700",
  amarelo: "border-amber-200 bg-amber-100 text-amber-700",
  vermelho: "border-red-200 bg-red-100 text-red-700",
}

const STATUS_LABEL: Record<KpiStatus, string> = {
  verde: "Dentro da meta",
  amarelo: "Atenção",
  vermelho: "Fora da meta",
}

export function KpiStatusBadge({ status, compact = false }: { status?: KpiStatus | null; compact?: boolean }) {
  if (!status) {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
        {compact ? "-" : "Sem lançamento"}
      </span>
    )
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {compact ? "" : STATUS_LABEL[status]}
      {compact && (
        <span className={`h-2.5 w-2.5 rounded-full ${status === "verde" ? "bg-green-600" : status === "amarelo" ? "bg-amber-600" : "bg-red-600"}`} />
      )}
    </span>
  )
}

export function KpiStatusDot({ status }: { status?: KpiStatus | null }) {
  const cor =
    status === "verde" ? "bg-green-500" : status === "amarelo" ? "bg-amber-500" : status === "vermelho" ? "bg-red-500" : "bg-slate-300"

  return <span className={`inline-block h-3 w-3 rounded-full ${cor}`} title={status ?? "Sem lançamento"} />
}
