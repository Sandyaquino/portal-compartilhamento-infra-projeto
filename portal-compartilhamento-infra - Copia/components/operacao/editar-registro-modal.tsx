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

export type CampoEditavel = {
  key: string
  label: string
  type?: "text" | "number"
}

type Valores = Record<string, string | number | null>

type EditarRegistroModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  campos: CampoEditavel[]
  valoresIniciais: Valores
  onSalvar: (valores: Valores) => Promise<void>
}

export function EditarRegistroModal({
  open,
  onOpenChange,
  titulo,
  campos,
  valoresIniciais,
  onSalvar,
}: EditarRegistroModalProps) {
  const [valores, setValores] = useState<Valores>(valoresIniciais)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValores(valoresIniciais)
      setErro(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function atualizarCampo(chave: string, valor: string) {
    setValores((atual) => ({ ...atual, [chave]: valor }))
  }

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(valores)
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar registro")
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
            Corrija os campos abaixo e salve. Isso não altera os dados de identificação
            do registro (OS, data, equipe/técnico).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {campos.map((campo) => (
            <label key={campo.key} className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{campo.label}</span>
              <Input
                type={campo.type === "number" ? "number" : "text"}
                value={valores[campo.key] ?? ""}
                onChange={(event) => atualizarCampo(campo.key, event.target.value)}
              />
            </label>
          ))}
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
