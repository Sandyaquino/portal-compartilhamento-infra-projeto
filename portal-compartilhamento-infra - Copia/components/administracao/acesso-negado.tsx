import { ShieldAlert } from "lucide-react"

export function AcessoNegado() {
  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="font-semibold text-slate-900">Acesso restrito</h2>
        <p className="max-w-sm text-sm text-slate-500">
          Seu perfil não tem permissão para acessar a área de Administração. Fale com um administrador do portal se precisar de acesso.
        </p>
      </div>
    </div>
  )
}
