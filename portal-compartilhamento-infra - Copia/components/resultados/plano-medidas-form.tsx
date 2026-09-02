"use client"

import { useEffect, useState } from "react"

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
import { MESES, STATUS_OPCOES, RISCO_OPCOES, type PlanoMedidaItem } from "@/lib/types/plano-medidas"

const TEXTAREA_CLASS =
  "min-h-[70px] w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export type PlanoMedidaFormValues = {
  bloco: string
  kpi: string
  mes: string
  desvioPercentual: string
  causaRaiz: string
  medidaAcao: string
  responsavel: string
  prazo: string
  status: string
  risco: string
  evidenciaLink: string
  comentarioExecutivo: string
}

export const VALORES_VAZIOS: PlanoMedidaFormValues = {
  bloco: "",
  kpi: "",
  mes: MESES[0],
  desvioPercentual: "",
  causaRaiz: "",
  medidaAcao: "",
  responsavel: "",
  prazo: "",
  status: STATUS_OPCOES[0],
  risco: "Médio",
  evidenciaLink: "",
  comentarioExecutivo: "",
}

export function valoresIniciaisDoItem(item: PlanoMedidaItem): PlanoMedidaFormValues {
  return {
    bloco: item.BLOCO ?? "",
    kpi: item.KPI ?? "",
    mes: item.MES || MESES[0],
    desvioPercentual: item.DESVIO_IDENTIFICADO === null || item.DESVIO_IDENTIFICADO === undefined
      ? ""
      : String(Math.round(item.DESVIO_IDENTIFICADO * 1000) / 10),
    causaRaiz: item.CAUSA_RAIZ ?? "",
    medidaAcao: item.MEDIDA_ACAO ?? "",
    responsavel: item.RESPONSAVEL ?? "",
    prazo: item.PRAZO ?? "",
    status: item.STATUS || STATUS_OPCOES[0],
    risco: item.RISCO || "Médio",
    evidenciaLink: item.EVIDENCIA_LINK ?? "",
    comentarioExecutivo: item.COMENTARIO_EXECUTIVO ?? "",
  }
}

type PlanoMedidasFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  valoresIniciais: PlanoMedidaFormValues
  onSalvar: (valores: PlanoMedidaFormValues) => Promise<void>
}

export function PlanoMedidasForm({ open, onOpenChange, titulo, valoresIniciais, onSalvar }: PlanoMedidasFormProps) {
  const [valores, setValores] = useState<PlanoMedidaFormValues>(valoresIniciais)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValores(valoresIniciais)
      setErro(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function atualizar(campo: keyof PlanoMedidaFormValues, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }))
  }

  function validar(): string | null {
    if (!valores.bloco.trim()) return "Informe o bloco."
    if (!valores.kpi.trim()) return "Informe o KPI."
    if (!valores.mes.trim()) return "Informe o mês."
    if (!valores.medidaAcao.trim()) return "Informe a medida/ação."
    if (!valores.responsavel.trim()) return "Informe o responsável."
    if (!valores.prazo.trim()) return "Informe o prazo."
    if (!valores.status.trim()) return "Informe o status."
    return null
  }

  async function handleSalvar() {
    const mensagemErro = validar()
    if (mensagemErro) {
      setErro(mensagemErro)
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(valores)
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a medida")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Campos com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Bloco *</span>
            <Input
              placeholder="Ex.: Operação de Campo"
              value={valores.bloco}
              onChange={(e) => atualizar("bloco", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">KPI *</span>
            <Input
              placeholder="Ex.: Postes Remoção Executados (Total)"
              value={valores.kpi}
              onChange={(e) => atualizar("kpi", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Mês *</span>
            <Select value={valores.mes} onValueChange={(v) => v !== null && atualizar("mes", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((mes) => (
                  <SelectItem key={mes} value={mes}>{mes}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Desvio identificado (%)</span>
            <Input
              type="number"
              step="0.1"
              placeholder="Ex.: -16"
              value={valores.desvioPercentual}
              onChange={(e) => atualizar("desvioPercentual", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Responsável *</span>
            <Input
              placeholder="Nome do responsável"
              value={valores.responsavel}
              onChange={(e) => atualizar("responsavel", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Prazo *</span>
            <Input
              type="date"
              value={valores.prazo}
              onChange={(e) => atualizar("prazo", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Status *</span>
            <Select value={valores.status} onValueChange={(v) => v !== null && atualizar("status", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPCOES.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Risco</span>
            <Select value={valores.risco} onValueChange={(v) => v !== null && atualizar("risco", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RISCO_OPCOES.map((risco) => (
                  <SelectItem key={risco} value={risco}>{risco}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Causa raiz</span>
            <textarea
              className={TEXTAREA_CLASS}
              value={valores.causaRaiz}
              onChange={(e) => atualizar("causaRaiz", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Medida / Ação corretiva *</span>
            <textarea
              className={TEXTAREA_CLASS}
              value={valores.medidaAcao}
              onChange={(e) => atualizar("medidaAcao", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Evidência (link)</span>
            <Input
              placeholder="https://..."
              value={valores.evidenciaLink}
              onChange={(e) => atualizar("evidenciaLink", e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Comentário executivo</span>
            <textarea
              className={TEXTAREA_CLASS}
              value={valores.comentarioExecutivo}
              onChange={(e) => atualizar("comentarioExecutivo", e.target.value)}
            />
          </label>
        </div>

        {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
