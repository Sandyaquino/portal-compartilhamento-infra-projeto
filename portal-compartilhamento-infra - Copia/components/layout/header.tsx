"use client"

import { Bell, Search, UserCircle } from "lucide-react"

export function HeaderNeoenergia() {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#005A34]">
          Portal de Compartilhamento de Infraestrutura
        </p>
        <h1 className="text-xl font-bold text-slate-900">
          Gestão Executiva de Contratos, Faturamento e Fiscalização
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-56 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <button className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
          <Bell className="h-5 w-5" />
        </button>

        <button className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-slate-700 transition hover:bg-slate-50">
          <UserCircle className="h-5 w-5 text-[#005A34]" />
          <span className="hidden text-sm font-medium md:block">Sandy</span>
        </button>
      </div>
    </header>
  )
}