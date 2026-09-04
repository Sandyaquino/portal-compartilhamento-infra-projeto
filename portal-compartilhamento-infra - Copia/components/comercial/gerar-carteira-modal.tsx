"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, PencilLine, Users } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { apiFetch } from "@/lib/config"
import { FASES, urlAtribuirDaFase, urlCarteiraDaFase, responsavelBruto } from "@/lib/comercial/fases-carteira"
import type { AtividadeTempoPadrao, PlanoGeracaoCarteira } from "@/lib/types/carteira-analise"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Fase selecionada na tela por trás; o gerador abre já nela, mas o
  // usuário pode trocar dentro do modal.
  faseInicialId: string
  onGerado: () => void
}

type AnalistaOpcao = { LOGIN: string; NOME: string }
type ItemBruto = { id: number; titulo: string; responsavel: string | null }

// Minutos produtivos considerados por dia útil (não é a jornada cheia —
// desconta reuniões, interrupções etc.). Ajustável aqui se a operação
// tiver outro parâmetro.
const MINUTOS_UTEIS_DIA = 360

function proximoDiaUtil(d: Date) {
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return d
}
function somarDiasUteis(base: Date, dias: number) {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < dias; i++) proximoDiaUtil(d)
  return d
}
function fmtData(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR")
}

export function GerarCarteiraModal({ open, onOpenChange, faseInicialId, onGerado }: Props) {
  const [faseId, setFaseId] = useState(faseInicialId)
  const [itens, setItens] = useState<ItemBruto[]>([])
  const [analistas, setAnalistas] = useState<AnalistaOpcao[]>([])
  const [atividades, setAtividades] = useState<AtividadeTempoPadrao[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [plano, setPlano] = useState<PlanoGeracaoCarteira | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [editandoTempo, setEditandoTempo] = useState<string | null>(null)
  const [tempoEditado, setTempoEditado] = useState("")

  const fase = useMemo(() => FASES.find((f) => f.id === faseId) ?? FASES[0], [faseId])
  const atividade = useMemo(
    () => atividades.find((a) => a.CODIGO_ATIVIDADE === fase.codigoAtividade) ?? null,
    [atividades, fase],
  )

  // Reset ao abrir + carrega o que só muda uma vez por sessão do modal
  // (analistas e a tabela de apoio).
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFaseId(faseInicialId)
    setPlano(null)
    setNotification(null)
    setEditandoTempo(null)

    Promise.all([
      apiFetch("/api/novos-entrantes/analistas", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/carteira-analise/atividades", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([an, at]) => {
      setAnalistas(Array.isArray(an) ? an : [])
      setAtividades(Array.isArray(at) ? at : [])
    })
  }, [open, faseInicialId])

  // Carrega a fila da fase escolhida (troca de fase dentro do modal também refaz isso).
  useEffect(() => {
    if (!open) return
    let cancelado = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true)
    setPlano(null)
    apiFetch(urlCarteiraDaFase(fase), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((bruto: Record<string, unknown>[]) => {
        if (cancelado) return
        const idCampo = fase.tipo === "entrante" ? "ID_ENTRADA" : "ID_PROCESSO"
        const lista = (Array.isArray(bruto) ? bruto : []).map((item) => ({
          id: Number(item[idCampo]),
          titulo: String(item.RAZAO_SOCIAL ?? item.NOME_FANTASIA ?? `#${item[idCampo]}`),
          responsavel: responsavelBruto(fase, item),
        }))
        setItens(lista)
        // primeira carga: seleciona todo mundo por padrão
        setSelecionados((prev) => (prev.length ? prev : []))
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, faseId])

  // Quando a lista de analistas chega (ou a fase muda), seleciona todos por padrão.
  useEffect(() => {
    if (!analistas.length) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelecionados(analistas.map((a) => a.LOGIN))
  }, [analistas, faseId])

  const nomePorLogin = useMemo(() => new Map(analistas.map((a) => [a.LOGIN, a.NOME || a.LOGIN])), [analistas])
  const pendentes = useMemo(() => itens.filter((i) => !i.responsavel), [itens])

  function alternarResponsavel(login: string) {
    setSelecionados((prev) => (prev.includes(login) ? prev.filter((x) => x !== login) : [...prev, login]))
    setPlano(null)
  }

  function calcularPlano() {
    if (!selecionados.length || !pendentes.length) return
    const tempoMedio = atividade?.TEMPO_MEDIO_MINUTOS ?? 60

    const carga = new Map<string, number>(selecionados.map((login) => [login, itens.filter((i) => i.responsavel === login).length]))
    const atribuicoesBrutas: { id: number; titulo: string; responsavel: string }[] = []
    for (const item of pendentes) {
      let escolhido = selecionados[0]
      let menor = Infinity
      for (const login of selecionados) {
        const c = carga.get(login) ?? 0
        if (c < menor) {
          menor = c
          escolhido = login
        }
      }
      atribuicoesBrutas.push({ id: item.id, titulo: item.titulo, responsavel: escolhido })
      carga.set(escolhido, (carga.get(escolhido) ?? 0) + 1)
    }

    const hoje = new Date()
    const porResponsavel = selecionados.map((login) => {
      const cargaAtual = itens.filter((i) => i.responsavel === login).length
      const itensNovos = atribuicoesBrutas.filter((a) => a.responsavel === login).length
      const cargaTotal = cargaAtual + itensNovos
      const minutosTotais = cargaTotal * tempoMedio
      const diasUteis = Math.max(1, Math.ceil(minutosTotais / MINUTOS_UTEIS_DIA))
      const prazoEstimado = somarDiasUteis(hoje, diasUteis).toISOString().slice(0, 10)
      return {
        login,
        nome: nomePorLogin.get(login) || login,
        cargaAtual,
        itensNovos,
        cargaTotal,
        minutosTotais,
        prazoEstimado,
      }
    })
    const prazoPorLogin = new Map(porResponsavel.map((r) => [r.login, r.prazoEstimado]))
    const atribuicoes = atribuicoesBrutas.map((a) => ({ ...a, prazo: prazoPorLogin.get(a.responsavel) ?? "" }))
    const prazoFactivel = porResponsavel.reduce<string | null>(
      (max, r) => (max === null || r.prazoEstimado > max ? r.prazoEstimado : max),
      null,
    )

    setPlano({
      totalPendentes: pendentes.length,
      totalDistribuidos: atribuicoes.length,
      naoDistribuidos: pendentes.length - atribuicoes.length,
      porResponsavel: porResponsavel.sort((a, b) => b.cargaTotal - a.cargaTotal),
      atribuicoes,
      prazoFactivel,
    })
  }

  async function salvarTempoMedio() {
    if (!editandoTempo) return
    const minutos = Number(tempoEditado)
    if (!Number.isFinite(minutos) || minutos <= 0) return
    try {
      const res = await apiFetch(`/api/carteira-analise/atividades/${editandoTempo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempo_medio_minutos: minutos }),
      })
      if (!res.ok) throw new Error("Erro ao salvar o tempo médio")
      setAtividades((prev) => prev.map((a) => (a.CODIGO_ATIVIDADE === editandoTempo ? { ...a, TEMPO_MEDIO_MINUTOS: minutos } : a)))
      setPlano(null)
    } catch {
      setNotification({ type: "error", message: "Não foi possível salvar o tempo médio." })
    } finally {
      setEditandoTempo(null)
    }
  }

  async function gerarCarteira() {
    if (!plano || !plano.atribuicoes.length) return
    setGerando(true)
    setNotification(null)
    try {
      let falhas = 0
      for (const a of plano.atribuicoes) {
        const res = await apiFetch(urlAtribuirDaFase(fase, a.id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responsavel: a.responsavel, prazo: a.prazo }),
        })
        if (!res.ok) falhas++
      }
      if (falhas > 0) {
        setNotification({ type: "warning", message: `Carteira gerada com ${falhas} item(ns) que não puderam ser atribuídos.` })
      } else {
        setNotification({ type: "success", message: `Carteira gerada: ${plano.atribuicoes.length} item(ns) distribuído(s).` })
      }
      onGerado()
      setPlano(null)
      setTimeout(() => onOpenChange(false), falhas ? 0 : 900)
    } catch {
      setNotification({ type: "error", message: "Erro ao gerar a carteira." })
    } finally {
      setGerando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gerar carteira automática</DialogTitle>
          <DialogDescription>
            Distribui os itens sem responsável da fase escolhida entre os responsáveis selecionados e estima o prazo
            factível de conclusão, usando o tempo médio de execução da atividade.
          </DialogDescription>
        </DialogHeader>

        <NotificationBanner notification={notification} />

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Tipo de carteira</span>
            <select
              value={faseId}
              onChange={(e) => setFaseId(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            >
              {FASES.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>

          {/* Tabela de apoio: atividade x tempo médio */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tabela de apoio — tempo médio por atividade</span>
            </div>
            <div className="grid gap-1">
              {atividades.map((a) => (
                <div
                  key={a.CODIGO_ATIVIDADE}
                  className={`flex items-center justify-between rounded-md px-2 py-1 ${a.CODIGO_ATIVIDADE === fase.codigoAtividade ? "bg-primary/10" : ""}`}
                >
                  <span className={a.CODIGO_ATIVIDADE === fase.codigoAtividade ? "font-semibold text-slate-800" : "text-slate-600"}>
                    {a.NOME}
                  </span>
                  {editandoTempo === a.CODIGO_ATIVIDADE ? (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        autoFocus
                        value={tempoEditado}
                        onChange={(e) => setTempoEditado(e.target.value)}
                        onBlur={salvarTempoMedio}
                        onKeyDown={(e) => e.key === "Enter" && salvarTempoMedio()}
                        className="h-7 w-16 rounded border border-slate-300 px-1.5 text-right text-xs"
                      />
                      <span className="text-xs text-slate-400">min</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditandoTempo(a.CODIGO_ATIVIDADE); setTempoEditado(String(a.TEMPO_MEDIO_MINUTOS)) }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-white"
                      title="Editar tempo médio"
                    >
                      {a.TEMPO_MEDIO_MINUTOS} min <PencilLine className="h-3 w-3 text-slate-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">
              Responsáveis disponíveis ({analistas.length}) <span className="text-slate-400">· {selecionados.length} selecionado(s)</span>
            </span>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2">
              {analistas.length === 0 && <span className="text-xs text-slate-400">Nenhum responsável cadastrado.</span>}
              {analistas.map((a) => {
                const cargaAtual = itens.filter((i) => i.responsavel === a.LOGIN).length
                return (
                  <button
                    key={a.LOGIN}
                    type="button"
                    onClick={() => alternarResponsavel(a.LOGIN)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                      selecionados.includes(a.LOGIN)
                        ? "border-primary bg-primary text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {a.NOME || a.LOGIN} <span className="opacity-70">· {cargaAtual} na fila</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <span>
              <strong className="text-slate-800">{carregando ? "…" : pendentes.length}</strong> item(ns) sem responsável em
              &quot;{fase.label}&quot;
            </span>
            <span className="text-slate-300">·</span>
            <span>
              tempo médio: <strong className="text-slate-800">{atividade?.TEMPO_MEDIO_MINUTOS ?? "—"} min</strong>/item
            </span>
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              onClick={calcularPlano}
              disabled={carregando || !selecionados.length || !pendentes.length}
            >
              Calcular análise
            </Button>
          </div>

          {!carregando && pendentes.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
              Não há itens sem responsável nessa fase agora.
            </p>
          )}

          {plano && (
            <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Users className="h-4 w-4 text-primary" /> {plano.totalDistribuidos} item(ns) serão distribuídos entre {plano.porResponsavel.length} responsável(is)
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <CalendarClock className="h-4 w-4 text-primary" /> Prazo factível da carteira: {fmtData(plano.prazoFactivel)}
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Responsável</th>
                      <th className="px-3 py-2 text-right font-semibold">Carga atual</th>
                      <th className="px-3 py-2 text-right font-semibold">Itens novos</th>
                      <th className="px-3 py-2 text-right font-semibold">Carga total</th>
                      <th className="px-3 py-2 text-right font-semibold">Conclusão estimada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.porResponsavel.map((r) => (
                      <tr key={r.login} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{r.nome}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{r.cargaAtual}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">+{r.itensNovos}</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 align-middle">
                            <span
                              className="block h-full bg-primary"
                              style={{ width: `${Math.min(100, (r.cargaTotal / Math.max(1, Math.max(...plano.porResponsavel.map((x) => x.cargaTotal)))) * 100)}%` }}
                            />
                          </span>{" "}
                          {r.cargaTotal}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtData(r.prazoEstimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plano.naoDistribuidos > 0 && (
                <p className="text-xs text-amber-700">
                  {plano.naoDistribuidos} item(ns) não coube(ram) nesta rodada — gere novamente depois para os restantes.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Cancelar
          </Button>
          <Button type="button" onClick={gerarCarteira} disabled={!plano || !plano.atribuicoes.length || gerando}>
            {gerando ? "Gerando..." : "Gerar carteira"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
