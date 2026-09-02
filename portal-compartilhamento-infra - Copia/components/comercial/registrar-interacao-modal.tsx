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
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CANAIS_INTERACAO,
  LABEL_CANAL_INTERACAO,
  LABEL_SENTIDO_INTERACAO,
  type CanalInteracao,
  type SentidoInteracao,
} from "@/lib/types/interacoes-entrante"

export type RegistrarInteracaoValues = {
  canal: CanalInteracao
  sentido: SentidoInteracao
  contato: string
  assunto: string
  observacao: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  emailContato?: string | null
  telefoneContato?: string | null
  onSalvar: (valores: RegistrarInteracaoValues) => Promise<void>
}

const SENTIDOS: SentidoInteracao[] = ["ENVIADO", "RECEBIDO"]

function contatoSugerido(
  canal: CanalInteracao,
  email?: string | null,
  telefone?: string | null,
): string {
  if (canal === "EMAIL") return email ?? ""
  if (canal === "LIGACAO" || canal === "WHATSAPP") return telefone ?? ""
  return ""
}

export function RegistrarInteracaoModal({
  open,
  onOpenChange,
  emailContato,
  telefoneContato,
  onSalvar,
}: Props) {
  const [canal, setCanal] = useState<CanalInteracao>("EMAIL")
  const [sentido, setSentido] = useState<SentidoInteracao>("ENVIADO")
  const [contato, setContato] = useState("")
  const [contatoEditado, setContatoEditado] = useState(false)
  const [assunto, setAssunto] = useState("")
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanal("EMAIL")
    setSentido("ENVIADO")
    setContato(emailContato ?? "")
    setContatoEditado(false)
    setAssunto("")
    setObservacao("")
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function selecionarCanal(valor: string | null) {
    if (!valor) return
    const proximo = valor as CanalInteracao
    setCanal(proximo)
    if (!contatoEditado) {
      setContato(contatoSugerido(proximo, emailContato, telefoneContato))
    }
  }

  async function handleSalvar() {
    if (!assunto.trim() && !observacao.trim()) {
      setErro("Preencha ao menos o assunto ou uma observação sobre o contato.")
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar({
        canal,
        sentido,
        contato: contato.trim(),
        assunto: assunto.trim(),
        observacao: observacao.trim(),
      })
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao registrar o contato")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
          <DialogDescription>
            Registra uma interação com o entrante (e-mail, ligação, WhatsApp...). O contato
            aparece na timeline do entrante.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Canal</span>
              <Select value={canal} onValueChange={selecionarCanal}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(valor: string) => LABEL_CANAL_INTERACAO[valor as CanalInteracao] ?? valor}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CANAIS_INTERACAO.map((codigo) => (
                    <SelectItem key={codigo} value={codigo}>
                      {LABEL_CANAL_INTERACAO[codigo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Sentido</span>
              <Select value={sentido} onValueChange={(valor) => valor && setSentido(valor as SentidoInteracao)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(valor: string) => LABEL_SENTIDO_INTERACAO[valor as SentidoInteracao] ?? valor}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SENTIDOS.map((codigo) => (
                    <SelectItem key={codigo} value={codigo}>
                      {LABEL_SENTIDO_INTERACAO[codigo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Contato (e-mail, telefone ou pessoa)</span>
            <input
              value={contato}
              onChange={(event) => {
                setContato(event.target.value)
                setContatoEditado(true)
              }}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="Com quem foi o contato"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Assunto</span>
            <input
              value={assunto}
              onChange={(event) => setAssunto(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="Resumo em uma linha"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Observação</span>
            <textarea
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              rows={3}
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="O que foi tratado, próximos passos, pendências..."
            />
          </label>
        </div>

        {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Registrando..." : "Registrar contato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
