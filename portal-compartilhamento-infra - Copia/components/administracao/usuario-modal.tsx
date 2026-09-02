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

export type PerfilOpcao = {
  ID: number
  NOME: string
}

export type UsuarioFormValues = {
  login: string
  nome: string
  email: string
  perfilId: string
  empresa: string
  telefone: string
  status: string
}

type UsuarioModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  modoEdicao: boolean
  perfis: PerfilOpcao[]
  valoresIniciais: UsuarioFormValues
  onSalvar: (valores: UsuarioFormValues) => Promise<void>
}

export function UsuarioModal({
  open,
  onOpenChange,
  titulo,
  modoEdicao,
  perfis,
  valoresIniciais,
  onSalvar,
}: UsuarioModalProps) {
  const [valores, setValores] = useState<UsuarioFormValues>(valoresIniciais)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValores(valoresIniciais)
      setErro(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function atualizarCampo(chave: keyof UsuarioFormValues, valor: string) {
    setValores((atual) => ({ ...atual, [chave]: valor }))
  }

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(valores)
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar usuário")
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
            {modoEdicao
              ? "Altere os dados do usuário e salve."
              : "O login já cadastrado consegue entrar imediatamente pelo código de acesso enviado por e-mail."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Login</span>
            <Input
              value={valores.login}
              disabled={modoEdicao}
              onChange={(event) => atualizarCampo("login", event.target.value)}
              placeholder="Ex.: CLB000000"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Nome</span>
            <Input
              value={valores.nome}
              onChange={(event) => atualizarCampo("nome", event.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">E-mail</span>
            <Input
              type="email"
              value={valores.email}
              onChange={(event) => atualizarCampo("email", event.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Perfil</span>
            <Select
              value={valores.perfilId}
              onValueChange={(valor) => valor !== null && atualizarCampo("perfilId", valor)}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {perfis.map((perfil) => (
                  <SelectItem key={perfil.ID} value={String(perfil.ID)}>
                    {perfil.NOME}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Empresa</span>
              <Input
                value={valores.empresa}
                onChange={(event) => atualizarCampo("empresa", event.target.value)}
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Telefone</span>
              <Input
                value={valores.telefone}
                onChange={(event) => atualizarCampo("telefone", event.target.value)}
              />
            </label>
          </div>

          {modoEdicao && (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Status</span>
              <Select
                value={valores.status}
                onValueChange={(valor) => valor !== null && atualizarCampo("status", valor)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Ativo</SelectItem>
                  <SelectItem value="I">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
        </div>

        {erro && (
          <p className="text-sm font-medium text-destructive">{erro}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={salvando || !valores.perfilId}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
