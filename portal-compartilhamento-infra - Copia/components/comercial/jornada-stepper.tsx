import { Check, XCircle } from "lucide-react"

const ETAPAS = [
  { key: "NOVO", label: "Novo" },
  { key: "ANALISADO", label: "Analisado" },
  { key: "PROVEDOR_CRIADO", label: "Provedor Criado" },
  { key: "PROCESSO_CRIADO", label: "Processo Criado" },
]

function normalizarStatus(status?: string | null) {
  return String(status ?? "").trim().toUpperCase() || "NOVO"
}

type JornadaStepperProps = {
  status?: string | null
  motivoDescarte?: string | null
}

export function JornadaStepper({ status, motivoDescarte }: JornadaStepperProps) {
  const statusNormalizado = normalizarStatus(status)

  if (statusNormalizado === "DESCARTADO") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-semibold text-red-800">
            Entrante descartado
          </p>
          <p className="mt-0.5 text-sm text-red-700">
            {motivoDescarte
              ? `Motivo: ${motivoDescarte}`
              : "Este registro saiu da jornada e não pode avançar."}
          </p>
        </div>
      </div>
    )
  }

  const indiceAtual = Math.max(
    0,
    ETAPAS.findIndex((etapa) => etapa.key === statusNormalizado)
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center">
        {ETAPAS.map((etapa, index) => {
          const concluida = index < indiceAtual
          const atual = index === indiceAtual

          return (
            <div key={etapa.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                    concluida
                      ? "border-primary bg-primary text-primary-foreground"
                      : atual
                      ? "border-primary bg-white text-primary"
                      : "border-slate-300 bg-white text-slate-400"
                  }`}
                >
                  {concluida ? <Check className="h-4 w-4" /> : index + 1}
                </div>

                <span
                  className={`whitespace-nowrap text-xs font-medium ${
                    concluida || atual ? "text-primary" : "text-slate-400"
                  }`}
                >
                  {etapa.label}
                </span>
              </div>

              {index < ETAPAS.length - 1 && (
                <div
                  className={`mx-2 mb-5 h-0.5 flex-1 rounded-full transition ${
                    concluida ? "bg-primary" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
