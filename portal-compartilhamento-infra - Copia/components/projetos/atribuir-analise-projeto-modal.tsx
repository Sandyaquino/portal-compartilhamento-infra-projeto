"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Wand2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AnalistaOpcao } from "@/components/comercial/atribuir-analise-modal"

const SEM_RESPONSAVEL = "__sem__"

export type AtribuirProjetoValues = {
  responsavel: string
  prazo: string
  usar_sla: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projeto: { NUMERO_PROJETO: string; PRIORIDADE: string | null; RESPONSAVEL_ANALISE: string | null; PRAZO_ANALISE: string | null } | null
  analistas: AnalistaOpcao[]
  slaDias: Record<string, number>
  onSalvar: (valores: AtribuirProjetoValues) => Promise<void>
}

function prazoPadrao(prioridade: string | null, dias: Record<string, number>) {
  const n = dias[String(prioridade || "MEDIA").toUpperCase()] ?? dias.MEDIA ?? 7
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function AtribuirAnaliseProjetoModal({ open, onOpenChange, projeto, analistas, slaDias, onSalvar }: Props) {
  const [responsavel, setResponsavel] = useState("")
  const [prazo, setPrazo] = useState("")
  const [prazoManual, setPrazoManual] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const prioridade = projeto?.PRIORIDADE ?? "MEDIA"
  const diasSla = slaDias[String(prioridade).toUpperCase()] ?? slaDias.MEDIA ?? 7
  const prazoSla = useMemo(() => prazoPadrao(prioridade, slaDias), [prioridade, slaDias])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResponsavel(projeto?.RESPONSAVEL_ANALISE ?? "")
    setPrazoManual(Boolean(projeto?.PRAZO_ANALISE))
    setPrazo(projeto?.PRAZO_ANALISE ?? prazoSla)
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar({ responsavel, prazo, usar_sla: !prazoManual })
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar atribuição")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atribuir análise — {projeto?.NUMERO_PROJETO}</DialogTitle>
          <DialogDescription>
            Defina o analista responsável e o prazo. O prazo padrão vem do SLA da prioridade do projeto.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Responsável</span>
            <Select
              value={responsavel || SEM_RESPONSAVEL}
              onValueChange={(v) => setResponsavel(v === SEM_RESPONSAVEL || v === null ? "" : v)}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um analista" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                {analistas.map((a) => (
                  <SelectItem key={a.LOGIN} value={a.LOGIN}>{a.NOME || a.LOGIN}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
              SLA da prioridade <strong className="uppercase">{prioridade}</strong>: {diasSla} dias corridos
              {" → "}
              <strong>{new Date(`${prazoSla}T00:00:00`).toLocaleDateString("pt-BR")}</strong>
            </span>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="flex items-center justify-between font-medium text-slate-700">
              Prazo
              <button
                type="button"
                onClick={() => { setPrazo(prazoSla); setPrazoManual(false) }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Wand2 className="h-3 w-3" />
                Usar prazo do SLA
              </button>
            </span>
            <Input
              type="date"
              value={prazo}
              onChange={(event) => { setPrazo(event.target.value); setPrazoManual(true) }}
            />
            {prazoManual && prazo && prazo !== prazoSla && (
              <span className="text-[11px] text-amber-600">Prazo manual — fora do SLA padrão.</span>
            )}
          </label>
        </div>

        {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar atribuição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
