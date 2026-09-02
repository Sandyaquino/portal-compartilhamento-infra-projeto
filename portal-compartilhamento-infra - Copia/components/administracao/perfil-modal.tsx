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

export type PerfilFormValues = {
  nome: string
  descricao: string
}

type PerfilModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  valoresIniciais: PerfilFormValues
  onSalvar: (valores: PerfilFormValues) => Promise<void>
}

export function PerfilModal({
  open,
  onOpenChange,
  titulo,
  valoresIniciais,
  onSalvar,
}: PerfilModalProps) {
  const [valores, setValores] = useState<PerfilFormValues>(valoresIniciais)
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
      setErro(err instanceof Error ? err.message : "Erro ao salvar perfil")
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
            O nome do perfil precisa ser único. As permissões desse perfil são configuradas depois, na tela de Permissões.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Nome</span>
            <Input
              value={valores.nome}
              onChange={(event) => setValores((atual) => ({ ...atual, nome: event.target.value }))}
              placeholder="Ex.: FISCAL"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Descrição</span>
            <Input
              value={valores.descricao}
              onChange={(event) => setValores((atual) => ({ ...atual, descricao: event.target.value }))}
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
          <Button type="button" onClick={handleSalvar} disabled={salvando || !valores.nome.trim()}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
