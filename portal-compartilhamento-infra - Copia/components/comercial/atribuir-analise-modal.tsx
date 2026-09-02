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

export type AnalistaOpcao = {
  LOGIN: string
  NOME: string
}

export type AtribuirAnaliseValues = {
  responsavel: string
  prazo: string
}

type AtribuirAnaliseModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  analistas: AnalistaOpcao[]
  valoresIniciais: AtribuirAnaliseValues
  onSalvar: (valores: AtribuirAnaliseValues) => Promise<void>
}

const SEM_RESPONSAVEL = "__sem_responsavel__"

export function AtribuirAnaliseModal({
  open,
  onOpenChange,
  titulo,
  analistas,
  valoresIniciais,
  onSalvar,
}: AtribuirAnaliseModalProps) {
  const [valores, setValores] = useState<AtribuirAnaliseValues>(valoresIniciais)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValores(valoresIniciais)
      setErro(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(valores)
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
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Defina quem deve analisar este entrante e até quando. Não altera nenhum outro dado cadastral.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Responsável</span>
            <Select
              value={valores.responsavel || SEM_RESPONSAVEL}
              onValueChange={(valor) =>
                setValores((atual) => ({ ...atual, responsavel: valor === SEM_RESPONSAVEL || valor === null ? "" : valor }))
              }
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um analista" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                {analistas.map((analista) => (
                  <SelectItem key={analista.LOGIN} value={analista.LOGIN}>
                    {analista.NOME || analista.LOGIN}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Prazo</span>
            <Input
              type="date"
              value={valores.prazo}
              onChange={(event) => setValores((atual) => ({ ...atual, prazo: event.target.value }))}
            />
          </label>
        </div>

        {erro && (
          <p className="text-sm font-medium text-destructive">{erro}</p>
        )}

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
