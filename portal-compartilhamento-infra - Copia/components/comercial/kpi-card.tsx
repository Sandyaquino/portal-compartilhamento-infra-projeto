export function KpiCard({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: React.ElementType
  title: string
  value: string | number
  subtitle: string
  color: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <Icon className={`h-7 w-7 ${color}`} />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>

      <p className={`mt-2 text-3xl font-bold tracking-tight ${color}`}>
        {value}
      </p>

      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}
