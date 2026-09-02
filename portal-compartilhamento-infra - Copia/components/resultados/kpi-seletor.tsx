"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BLOCOS_SUGERIDOS } from "@/lib/types/plano-medidas"
import { TIPOS_OPCOES, type KpiCadastro } from "@/lib/types/kpis-mensal"

export type NovoKpiValues = {
  bloco: string
  kpi: string
  unidade: string
  tipo: string
}

const VALORES_VAZIOS: NovoKpiValues = { bloco: "", kpi: "", unidade: "", tipo: TIPOS_OPCOES[0] }

type KpiSeletorProps = {
  kpis: KpiCadastro[]
  kpiSelecionadoId: number | null
  onSelecionar: (id: number) => void
  onCriar: (dados: NovoKpiValues) => Promise<void>
}

export function KpiSeletor({ kpis, kpiSelecionadoId, onSelecionar, onCriar }: KpiSeletorProps) {
  const [modalAberto, setModalAberto] = useState(false)
  const [valores, setValores] = useState<NovoKpiValues>(VALORES_VAZIOS)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function abrirModal() {
    setValores(VALORES_VAZIOS)
    setErro(null)
    setModalAberto(true)
  }

  function atualizar(campo: keyof NovoKpiValues, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }))
  }

  async function handleSalvar() {
    if (!valores.bloco.trim() || !valores.kpi.trim() || !valores.unidade.trim() || !valores.tipo.trim()) {
      setErro("Preencha todos os campos.")
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      await onCriar(valores)
      setModalAberto(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar o KPI")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Select value={kpiSelecionadoId ? String(kpiSelecionadoId) : undefined} onValueChange={(v) => onSelecionar(Number(v))}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um KPI" /></SelectTrigger>
          <SelectContent>
            {kpis.map((kpi) => (
              <SelectItem key={kpi.ID} value={String(kpi.ID)}>
                {kpi.BLOCO} — {kpi.KPI}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={abrirModal} className="h-9 w-fit shrink-0">
        <Plus className="h-4 w-4" />
        Novo KPI
      </Button>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo KPI</DialogTitle>
            <DialogDescription>Cadastra o indicador e já cria os 12 lançamentos mensais em branco.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Bloco *</span>
              <Input
                list="kpi-blocos-sugeridos"
                placeholder="Ex.: Operação de Campo"
                value={valores.bloco}
                onChange={(e) => atualizar("bloco", e.target.value)}
              />
              <datalist id="kpi-blocos-sugeridos">
                {BLOCOS_SUGERIDOS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
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
              <span className="font-medium text-slate-700">Unidade *</span>
              <Input
                placeholder="Ex.: %, un, dias"
                value={valores.unidade}
                onChange={(e) => atualizar("unidade", e.target.value)}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Tipo *</span>
              <Select value={valores.tipo} onValueChange={(v) => v !== null && atualizar("tipo", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_OPCOES.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-slate-500">
                &quot;Maior melhor&quot;: realizado acima da meta é bom. &quot;Menor melhor&quot;: realizado abaixo da meta é bom.
              </span>
            </label>
          </div>

          {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
