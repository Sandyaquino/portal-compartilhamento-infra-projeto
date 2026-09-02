const STATUS_CLASS: Record<string, string> = {
  "Não iniciado": "border-slate-200 bg-slate-100 text-slate-700",
  "Em andamento": "border-blue-200 bg-blue-100 text-blue-700",
  "Concluído": "border-green-200 bg-green-100 text-green-700",
}

export function StatusBadge({ status }: { status?: string | null }) {
  const texto = status || "Não iniciado"
  const className = STATUS_CLASS[texto] || STATUS_CLASS["Não iniciado"]

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {texto}
    </span>
  )
}
