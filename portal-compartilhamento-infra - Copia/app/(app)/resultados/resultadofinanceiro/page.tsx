"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, PencilLine, Upload } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { EstatItem, SecaoCard } from "@/components/projetos/projeto-ui"
import { API_BASE_URL } from "@/lib/config"
import { useCurrentUser } from "@/hooks/use-current-user"
import { baixarModeloFinanceiro, lerPlanilhaFinanceiro } from "@/lib/exports/resultado-financeiro-excel"
import {
  MENOR_MELHOR_FIN,
  MESES_FIN,
  fmtMoedaFin,
  fmtPctFin,
  type IndicadorFinanceiro,
  type IndicadorFinanceiroSerie,
  type MesFinanceiro,
  type ResultadoFinanceiroResposta,
  type ResumoFinanceiro,
} from "@/lib/types/resultado-financeiro"

type Visao = "MENSAL" | "YTD"

const ANO_ATUAL = new Date().getFullYear()

// Cor do desvio conforme o indicador (Custos: menor é melhor).
function corDesvio(ind: IndicadorFinanceiro, meta: number, realizado: number | null) {
  if (realizado === null || !meta) return "text-slate-400"
  const razao = realizado / meta
  const menorMelhor = MENOR_MELHOR_FIN[ind]
  const bom = menorMelhor ? razao <= 1 : razao >= 1
  const atencao = menorMelhor ? razao <= 1.05 : razao >= 0.95
  return bom ? "text-green-600" : atencao ? "text-amber-600" : "text-red-600"
}

function resumoNaVisao(serie: IndicadorFinanceiroSerie, visao: Visao): ResumoFinanceiro {
  return visao === "YTD" ? serie.ytd : serie.mensal
}

function CartaoIndicador({
  serie,
  visao,
  mostrarRev,
  derivado,
}: {
  serie: IndicadorFinanceiroSerie
  visao: Visao
  mostrarRev: boolean
  derivado?: { valor: number | null; gap: number | null }
}) {
  const r = resumoNaVisao(serie, visao)
  const cor = corDesvio(serie.indicador, r.meta, r.realizado)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{serie.label}</p>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          {visao === "YTD" ? "YTD" : "MÊS"}
        </span>
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${cor}`}>{fmtMoedaFin(r.realizado)}</p>
      <p className="text-xs text-slate-500">
        Meta {fmtMoedaFin(r.meta)} · Desvio{" "}
        <span className={cor}>
          {fmtMoedaFin(r.desvio)} ({fmtPctFin(r.desvio_pct)})
        </span>
      </p>
      {mostrarRev && (
        <p className="mt-1 text-xs text-slate-500">
          REV {fmtMoedaFin(r.rev)}
          {r.rev != null && r.meta ? (
            <span className="text-slate-400"> ({fmtPctFin((r.rev - r.meta) / r.meta)} vs meta)</span>
          ) : null}
        </p>
      )}
      {derivado && (
        <p className="mt-1 border-t border-slate-100 pt-1 text-[11px] text-slate-400">
          Fat − Custos: {fmtMoedaFin(derivado.valor)}
          {derivado.gap != null && Math.abs(derivado.gap) > 0 ? (
            <span> · dif. vs lançado {fmtMoedaFin(derivado.gap)}</span>
          ) : null}
        </p>
      )}
    </div>
  )
}

export default function ResultadoFinanceiroPage() {
  const { user } = useCurrentUser()
  const [anos, setAnos] = useState<number[]>([ANO_ATUAL])
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mesRef, setMesRef] = useState<number | null>(null)
  const [visao, setVisao] = useState<Visao>("MENSAL")
  const [mostrarRev, setMostrarRev] = useState(true)
  const [editando, setEditando] = useState(false)

  const [resp, setResp] = useState<ResultadoFinanceiroResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(ano) })
      if (mesRef) qs.set("mes_ref", String(mesRef))
      const res = await fetch(`${API_BASE_URL}/api/resultado-financeiro?${qs}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar o resultado financeiro`)
      setResp(await res.json())
    } catch (e) {
      setNotification({ type: "error", message: e instanceof Error ? e.message : "Erro ao carregar" })
    } finally {
      setLoading(false)
    }
  }, [ano, mesRef])

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/resultado-financeiro/anos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : [ANO_ATUAL]))
      .then((lista: number[]) => setAnos(Array.isArray(lista) && lista.length ? lista : [ANO_ATUAL]))
      .catch(() => setAnos([ANO_ATUAL]))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function salvarCelula(indicador: IndicadorFinanceiro, mes: number, campo: "meta" | "realizado" | "rev", valor: string) {
    setSalvando(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/resultado-financeiro`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano,
          mes,
          indicador,
          [campo]: valor.trim() === "" ? null : Number(valor),
          usuario: user?.login ?? null,
        }),
      })
      const dados = await res.json().catch(() => null)
      if (!res.ok) throw new Error(dados?.detail || "Erro ao salvar")
      if (dados?.dados) setResp(dados.dados)
    } catch (e) {
      setNotification({ type: "error", message: e instanceof Error ? e.message : "Erro ao salvar" })
    } finally {
      setSalvando(false)
    }
  }

  async function importar(file: File) {
    setImportando(true)
    setNotification(null)
    try {
      const linhas = await lerPlanilhaFinanceiro(file)
      const res = await fetch(`${API_BASE_URL}/api/resultado-financeiro/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, linhas, usuario: user?.login ?? null }),
      })
      const dados = await res.json().catch(() => null)
      if (!res.ok) throw new Error(dados?.detail || "Erro ao importar")
      if (dados?.dados) setResp(dados.dados)
      const ign = dados?.ignorados?.length ?? 0
      setNotification({
        type: ign > 0 ? "warning" : "success",
        message: `Importado: ${dados.criados} novos, ${dados.atualizados} atualizados${ign ? `, ${ign} ignorados` : ""}.`,
      })
    } catch (e) {
      setNotification({ type: "error", message: e instanceof Error ? e.message : "Erro ao importar a planilha" })
    } finally {
      setImportando(false)
      if (inputArquivo.current) inputArquivo.current.value = ""
    }
  }

  const indicadores = useMemo(() => resp?.indicadores ?? [], [resp])
  const porCod = useMemo(
    () => new Map(indicadores.map((i) => [i.indicador, i])),
    [indicadores],
  )

  // Receita Líquida derivada (Faturamento − Custos) para conferência.
  const derivadoRL = useMemo(() => {
    const fat = porCod.get("FATURAMENTO")
    const cus = porCod.get("CUSTOS")
    const rl = porCod.get("RECEITA_LIQUIDA")
    if (!fat || !cus || !rl) return undefined
    const rf = resumoNaVisao(fat, visao)
    const rc = resumoNaVisao(cus, visao)
    const rr = resumoNaVisao(rl, visao)
    const fatV = rf.realizado ?? rf.meta
    const cusV = rc.realizado ?? rc.meta
    const valor = fatV - cusV
    const lancado = rr.realizado ?? rr.meta
    return { valor, gap: lancado - valor }
  }, [porCod, visao])

  const campoNaVisao = (m: MesFinanceiro, campo: "meta" | "realizado" | "rev") => {
    if (visao === "MENSAL") return m[campo]
    if (campo === "meta") return m.meta_ytd
    if (campo === "realizado") return m.realizado_ytd
    return m.rev_ytd
  }
  const desvioNaVisao = (m: MesFinanceiro) => (visao === "MENSAL" ? m.desvio : m.desvio_ytd)
  const desvioPctNaVisao = (m: MesFinanceiro) => (visao === "MENSAL" ? m.desvio_pct : m.desvio_ytd_pct)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Resultados Financeiros"
        description="Acompanhamento mensal e YTD de Faturamento, Custos e Receita Líquida — meta x realizado x REV (revisão)."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Resultados", href: "/resultados" },
          { label: "Resultados Financeiros" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ano}
              onChange={(e) => { setAno(Number(e.target.value)); setMesRef(null) }}
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            >
              {anos.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => resp && baixarModeloFinanceiro(ano, resp.indicadores)}
              disabled={!resp}
            >
              <Download className="h-4 w-4" /> Exportar modelo (.xlsx)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => inputArquivo.current?.click()}
              disabled={importando}
            >
              <Upload className="h-4 w-4" /> {importando ? "Importando..." : "Importar planilha"}
            </Button>
            <input
              ref={inputArquivo}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f) }}
            />
          </div>
        }
      />

      <NotificationBanner notification={notification} />

      {loading || !resp ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Carregando resultado financeiro...
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-slate-600">Mês de referência</span>
              <select
                value={resp.mes_ref}
                onChange={(e) => setMesRef(Number(e.target.value))}
                className="h-8 rounded-lg border border-slate-300 px-2 text-sm"
              >
                {MESES_FIN.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>

            <span className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 text-sm">
              {(["MENSAL", "YTD"] as Visao[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setVisao(v); if (v === "YTD") setEditando(false) }}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    visao === v ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {v === "MENSAL" ? "Mensal" : "Acumulado (YTD)"}
                </button>
              ))}
            </span>

            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={mostrarRev} onChange={(e) => setMostrarRev(e.target.checked)} />
              Mostrar REV
            </label>

            <Button
              type="button"
              size="sm"
              variant={editando ? "default" : "outline"}
              onClick={() => { setEditando((v) => !v); setVisao("MENSAL") }}
              className="ml-auto"
            >
              <PencilLine className="h-3.5 w-3.5" /> {editando ? "Concluir edição" : "Editar valores"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {indicadores.map((s) => (
              <CartaoIndicador
                key={s.indicador}
                serie={s}
                visao={visao}
                mostrarRev={mostrarRev}
                derivado={s.indicador === "RECEITA_LIQUIDA" ? derivadoRL : undefined}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
            <EstatItem label="Ano" valor={resp.ano} tom="primary" />
            <EstatItem label="Meses fechados" valor={`${resp.meses_fechados} / 12`} />
            <EstatItem label="Visão" valor={visao === "YTD" ? "Acumulado" : "Mensal"} />
            <EstatItem label="Referência" valor={MESES_FIN[resp.mes_ref - 1]} />
          </div>

          <SecaoCard
            titulo="Evolução mensal"
            descricao={
              visao === "YTD"
                ? "Valores acumulados de janeiro até o mês. Edição só na visão Mensal."
                : editando
                  ? "Clique nas células de Meta, Realizado ou REV para editar. Salva automaticamente."
                  : "Meta x Realizado x REV mês a mês. Use “Editar valores” ou importe a planilha modelo."
            }
          >
            <div className="space-y-5">
              {indicadores.map((serie) => (
                <div key={serie.indicador} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <span>{serie.label}</span>
                    <span className="text-slate-400">
                      Ano: {fmtMoedaFin(serie.ano_total.realizado)} realiz. · meta {fmtMoedaFin(serie.ano_total.meta)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[720px] w-full text-sm">
                      <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Mês</th>
                          <th className="px-3 py-2 text-right font-semibold">Meta</th>
                          <th className="px-3 py-2 text-right font-semibold">Realizado</th>
                          {mostrarRev && <th className="px-3 py-2 text-right font-semibold">REV</th>}
                          <th className="px-3 py-2 text-right font-semibold">Desvio</th>
                          <th className="px-3 py-2 text-right font-semibold">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serie.meses.map((m) => {
                          const editavel = editando && visao === "MENSAL"
                          const cor = corDesvio(
                            serie.indicador,
                            campoNaVisao(m, "meta") as number,
                            campoNaVisao(m, "realizado") as number | null,
                          )
                          const destaque = m.mes === resp.mes_ref ? "bg-primary/5" : ""
                          return (
                            <tr key={m.mes} className={`border-t border-slate-100 ${destaque}`}>
                              <td className="px-3 py-1.5 font-medium text-slate-600">{MESES_FIN[m.mes - 1]}</td>
                              <CelulaValor
                                editavel={editavel}
                                valor={campoNaVisao(m, "meta")}
                                onSalvar={(v) => salvarCelula(serie.indicador, m.mes, "meta", v)}
                              />
                              <CelulaValor
                                editavel={editavel}
                                valor={campoNaVisao(m, "realizado")}
                                onSalvar={(v) => salvarCelula(serie.indicador, m.mes, "realizado", v)}
                              />
                              {mostrarRev && (
                                <CelulaValor
                                  editavel={editavel}
                                  valor={campoNaVisao(m, "rev")}
                                  onSalvar={(v) => salvarCelula(serie.indicador, m.mes, "rev", v)}
                                />
                              )}
                              <td className={`px-3 py-1.5 text-right ${cor}`}>{fmtMoedaFin(desvioNaVisao(m))}</td>
                              <td className={`px-3 py-1.5 text-right ${cor}`}>{fmtPctFin(desvioPctNaVisao(m))}</td>
                            </tr>
                          )
                        })}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
                          <td className="px-3 py-2">Acumulado ano</td>
                          <td className="px-3 py-2 text-right">{fmtMoedaFin(serie.ano_total.meta)}</td>
                          <td className="px-3 py-2 text-right">{fmtMoedaFin(serie.ano_total.realizado)}</td>
                          {mostrarRev && <td className="px-3 py-2 text-right">{fmtMoedaFin(serie.ano_total.rev)}</td>}
                          <td className="px-3 py-2 text-right">
                            {fmtMoedaFin(
                              serie.ano_total.realizado == null ? null : serie.ano_total.realizado - serie.ano_total.meta,
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtPctFin(
                              serie.ano_total.realizado == null || !serie.ano_total.meta
                                ? null
                                : (serie.ano_total.realizado - serie.ano_total.meta) / serie.ano_total.meta,
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            {salvando && <p className="mt-2 text-xs text-slate-400">Salvando...</p>}
          </SecaoCard>
        </>
      )}
    </div>
  )
}

function CelulaValor({
  editavel,
  valor,
  onSalvar,
}: {
  editavel: boolean
  valor: number | null | undefined
  onSalvar: (valor: string) => void
}) {
  if (!editavel) {
    return <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtMoedaFin(valor ?? null)}</td>
  }
  return (
    <td className="px-1 py-1 text-right">
      <input
        type="number"
        defaultValue={valor ?? ""}
        onBlur={(e) => {
          const novo = e.target.value
          if (String(valor ?? "") !== novo) onSalvar(novo)
        }}
        className="w-28 rounded-md border border-slate-300 px-1.5 py-1 text-right text-sm tabular-nums focus:border-primary focus:outline-none"
      />
    </td>
  )
}
