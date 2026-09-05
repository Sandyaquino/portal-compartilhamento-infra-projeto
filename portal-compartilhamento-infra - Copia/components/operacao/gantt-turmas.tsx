"use client"

import { useMemo } from "react"

import type { GanttBarra, GanttPeriodo, GanttTurma } from "@/lib/types/carteira"

// Cores das barras por status da carteira. Azul/verde não colidem com o
// vermelho reservado para "hoje"; cinza é o fallback para status inesperado.
const COR_STATUS: Record<string, string> = {
  PUBLICADA: "bg-blue-500",
  CONCLUIDA: "bg-green-600",
}

const LABEL_PX = 240

function diaDoMes(iso: string) {
  return Number(iso.slice(8, 10))
}

export function GanttTurmas({
  periodo,
  turmas,
  onAbrir,
}: {
  periodo: GanttPeriodo
  turmas: GanttTurma[]
  onAbrir?: (idCarteira: number) => void
}) {
  const dias = periodo.dias
  const cols = useMemo(() => Array.from({ length: dias }, (_, i) => i + 1), [dias])

  const fimDeSemana = useMemo(() => {
    const s = new Set<number>()
    for (const d of cols) {
      const wd = new Date(periodo.ano, periodo.mes - 1, d).getDay()
      if (wd === 0 || wd === 6) s.add(d)
    }
    return s
  }, [cols, periodo.ano, periodo.mes])

  const hoje = new Date()
  const diaHoje =
    hoje.getFullYear() === periodo.ano && hoje.getMonth() + 1 === periodo.mes ? hoje.getDate() : null

  if (!turmas.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        Nenhuma turma com carteira confirmada em {String(periodo.mes).padStart(2, "0")}/{periodo.ano}.
        <br />
        Gere uma carteira de serviço e publique-a para ela aparecer aqui.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[920px]">
        {/* cabeçalho: números dos dias */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <div
            style={{ width: LABEL_PX }}
            className="shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Turma
          </div>
          <div className="flex flex-1">
            {cols.map((d) => (
              <div
                key={d}
                className={`flex-1 border-l border-slate-100 py-2 text-center text-[10px] ${
                  fimDeSemana.has(d) ? "bg-slate-100 text-slate-400" : "text-slate-500"
                }`}
              >
                {d}
              </div>
            ))}
          </div>
        </div>

        {/* uma linha por turma */}
        {turmas.map((t) => (
          <div key={t.id_equipe ?? t.nome} className="flex border-b border-slate-100 last:border-b-0">
            <div style={{ width: LABEL_PX }} className="shrink-0 px-3 py-3">
              <p className="text-sm font-semibold text-slate-800">{t.nome}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                {t.eps && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{t.eps}</span>
                )}
                <span>{t.total_os.toLocaleString("pt-BR")} OS</span>
                <span aria-hidden>·</span>
                <span>{t.dias_ocupados} dia(s)</span>
                <span aria-hidden>·</span>
                <span>{t.municipios.length} município(s)</span>
              </p>
            </div>

            <div className="relative flex-1 py-2">
              {/* faixas de fim de semana ao fundo */}
              <div className="pointer-events-none absolute inset-0 flex">
                {cols.map((d) => (
                  <div
                    key={d}
                    className={`flex-1 border-l border-slate-50 ${fimDeSemana.has(d) ? "bg-slate-50" : ""}`}
                  />
                ))}
              </div>
              {/* marcador do dia de hoje */}
              {diaHoje != null && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-400"
                  style={{ left: `${((diaHoje - 0.5) / dias) * 100}%` }}
                />
              )}
              {/* barras (uma por carteira) */}
              <div className="relative space-y-1">
                {t.barras.map((b) => (
                  <BarraGantt key={b.id_carteira} b={b} dias={dias} onAbrir={onAbrir} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarraGantt({
  b,
  dias,
  onAbrir,
}: {
  b: GanttBarra
  dias: number
  onAbrir?: (idCarteira: number) => void
}) {
  const ini = diaDoMes(b.inicio)
  const fim = diaDoMes(b.fim)
  const left = ((ini - 1) / dias) * 100
  const largura = ((fim - ini + 1) / dias) * 100
  const cor = COR_STATUS[b.status ?? ""] ?? "bg-slate-400"
  const dica = `${b.titulo}\n${b.inicio} a ${b.fim} · ${b.os} OS${
    b.os_executadas ? ` (${b.os_executadas} executadas)` : ""
  }${b.municipios.length ? `\n${b.municipios.join(", ")}` : ""}`

  return (
    <div className="relative h-7">
      <button
        type="button"
        onClick={() => onAbrir?.(b.id_carteira)}
        title={dica}
        className={`absolute top-0 flex h-7 items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[11px] font-medium text-white transition hover:brightness-110 ${cor}`}
        style={{ left: `${left}%`, width: `max(${largura}%, 46px)` }}
      >
        <span className="truncate">{b.titulo}</span>
        <span className="ml-auto shrink-0 rounded bg-white/25 px-1 text-[10px] tabular-nums">{b.os}</span>
      </button>
    </div>
  )
}
