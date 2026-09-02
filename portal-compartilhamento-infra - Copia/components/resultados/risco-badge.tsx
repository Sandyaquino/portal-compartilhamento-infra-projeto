const RISCO_CLASS: Record<string, string> = {
  Baixo: "border-green-200 bg-green-100 text-green-700",
  Médio: "border-amber-200 bg-amber-100 text-amber-700",
  Alto: "border-red-200 bg-red-100 text-red-700",
}

export function RiscoBadge({ risco }: { risco?: string | null }) {
  const texto = risco || "Médio"
  const className = RISCO_CLASS[texto] || RISCO_CLASS["Médio"]

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {texto}
    </span>
  )
}
