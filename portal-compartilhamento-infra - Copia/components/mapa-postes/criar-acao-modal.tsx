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
import { LABEL_TIPO_ACAO, type TipoAcao } from "@/lib/types/postes"

export type UsuarioOpcao = {
  LOGIN: string
  NOME: string
}

export type CriarAcaoValues = {
  tipo: TipoAcao
  titulo: string
  responsavel: string
  prazo: string
  observacao: string
}

type CriarAcaoModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  qtdPostes: number
  usuarios: UsuarioOpcao[]
  tituloSugerido?: string
  tipoInicial?: TipoAcao
  onSalvar: (valores: CriarAcaoValues) => Promise<void>
}

const SEM_RESPONSAVEL = "__sem_responsavel__"

const VALORES_INICIAIS: CriarAcaoValues = {
  tipo: "FISCALIZACAO",
  titulo: "",
  responsavel: "",
  prazo: "",
  observacao: "",
}

export function CriarAcaoModal({
  open,
  onOpenChange,
  qtdPostes,
  usuarios,
  tituloSugerido,
  tipoInicial,
  onSalvar,
}: CriarAcaoModalProps) {
  const [valores, setValores] = useState<CriarAcaoValues>(VALORES_INICIAIS)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValores({ ...VALORES_INICIAIS, titulo: tituloSugerido ?? "", tipo: tipoInicial ?? "FISCALIZACAO" })
      setErro(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tituloSugerido, tipoInicial])

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(valores)
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar ação")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova ação</DialogTitle>
          <DialogDescription>
            {qtdPostes === 1
              ? "Cria uma ação de campo para este poste."
              : `Cria uma ação de campo para os ${qtdPostes.toLocaleString("pt-BR")} postes selecionados.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Tipo</span>
            <Select
              value={valores.tipo}
              onValueChange={(valor) => valor && setValores((atual) => ({ ...atual, tipo: valor as TipoAcao }))}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_TIPO_ACAO) as TipoAcao[]).map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>{LABEL_TIPO_ACAO[tipo]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Título</span>
            <Input
              value={valores.titulo}
              onChange={(event) => setValores((atual) => ({ ...atual, titulo: event.target.value }))}
              placeholder="Ex.: Fiscalização - região central"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Responsável</span>
            <Select
              value={valores.responsavel || SEM_RESPONSAVEL}
              onValueChange={(valor) =>
                setValores((atual) => ({ ...atual, responsavel: valor === SEM_RESPONSAVEL || valor === null ? "" : valor }))
              }
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                {usuarios.map((usuario) => (
                  <SelectItem key={usuario.LOGIN} value={usuario.LOGIN}>
                    {usuario.NOME || usuario.LOGIN}
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

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Observação</span>
            <textarea
              value={valores.observacao}
              onChange={(event) => setValores((atual) => ({ ...atual, observacao: event.target.value }))}
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Detalhes da ação (opcional)"
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
            {salvando ? "Criando..." : "Criar ação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
