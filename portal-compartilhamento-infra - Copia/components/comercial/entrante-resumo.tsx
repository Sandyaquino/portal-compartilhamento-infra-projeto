import type { EntranteDetail } from "@/hooks/use-entrante-detalhe"

export function valor(value: unknown): string {
  return String(value ?? "")
}

export function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

type ResumoEntranteCardProps = {
  entrante: EntranteDetail
  descricao: string
  badgeLabel: string
}

export function ResumoEntranteCard({ entrante, descricao, badgeLabel }: ResumoEntranteCardProps) {
  return (
    <section className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 via-white to-white p-6 shadow-sm">
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-800">
          ⚠️ Revise os dados abaixo antes de confirmar a ação.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-green-800">
            Resumo do Entrante
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {descricao}
          </p>
        </div>

        <span className="w-fit rounded-full bg-green-100 px-4 py-2 text-xs font-semibold text-green-700">
          {badgeLabel}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Razão Social
          </div>
          <div className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">
            {valor(entrante.RAZAO_SOCIAL) || "-"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            CNPJ
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-900">
            {valor(entrante.CNPJ) || "-"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Município
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-900">
            {valor(entrante.MUNICIPIO) || "-"}
          </div>
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-green-700">
            Status
          </div>
          <div className="mt-3">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              {valor(entrante.STATUS_ENTRADA) || "-"}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
