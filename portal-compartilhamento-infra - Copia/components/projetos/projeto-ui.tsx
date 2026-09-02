import type { ReactNode } from "react"

import { CLASSE_STATUS_PROJETO, LABEL_STATUS_PROJETO, type StatusProjeto } from "@/lib/types/projetos"

export type AbaDef = { valor: string; rotulo: string; contador?: number }

export function AbasEnterprise({
  abas,
  ativa,
  onChange,
}: {
  abas: AbaDef[]
  ativa: string
  onChange: (valor: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <nav className="flex min-w-max gap-1 border-b border-slate-200">
        {abas.map((aba) => {
          const selecionada = ativa === aba.valor
          return (
            <button
              key={aba.valor}
              type="button"
              onClick={() => onChange(aba.valor)}
              aria-current={selecionada ? "page" : undefined}
              className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                selecionada
                  ? "border-primary text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {aba.rotulo}
              {aba.contador != null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                    selecionada ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {aba.contador}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// Blocos visuais reutilizados nas telas de Projetos, com um padrão único
// (rótulo xs em caixa alta, cartões com borda discreta, medidores finos).

export function StatusPill({ status, className = "" }: { status: StatusProjeto; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_STATUS_PROJETO[status]} ${className}`}
    >
      {LABEL_STATUS_PROJETO[status]}
    </span>
  )
}

export function Medidor({
  label,
  atual,
  total,
  tom = "primary",
}: {
  label: string
  atual: number
  total: number
  tom?: "primary" | "green" | "amber"
}) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0
  const cor =
    tom === "green" ? "bg-green-600" : tom === "amber" ? "bg-amber-500" : "bg-primary"
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700">
          {atual}
          <span className="text-slate-400">/{total}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

export function SecaoCard({
  titulo,
  descricao,
  acao,
  children,
  className = "",
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
        </div>
        {acao}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function DefGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid =
    cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
  return <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${grid}`}>{children}</dl>
}

export function Def({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children ?? "—"}</dd>
    </div>
  )
}

export function EstatItem({
  label,
  valor,
  sub,
  tom = "slate",
}: {
  label: string
  valor: ReactNode
  sub?: string
  tom?: "slate" | "primary" | "green" | "amber" | "red"
}) {
  const cor =
    tom === "primary"
      ? "text-primary"
      : tom === "green"
        ? "text-green-700"
        : tom === "amber"
          ? "text-amber-700"
          : tom === "red"
            ? "text-red-700"
            : "text-slate-900"
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${cor}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
