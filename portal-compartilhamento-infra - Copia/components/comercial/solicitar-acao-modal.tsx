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
import { API_BASE_URL } from "@/lib/config"
import { CATALOGO_TIPOS_ACAO, LABEL_TIME, LABEL_PRIORIDADE, type TimeResponsavel, type PosteDoProvedor } from "@/lib/types/contratos"

export type SolicitarAcaoValues = {
  tipo_acao: string
  time_responsavel: TimeResponsavel
  prioridade: string
  descricao: string
  barramentos: string[]
}

type SolicitarAcaoModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  idProvedor: string
  onSalvar: (valores: SolicitarAcaoValues) => Promise<void>
}

const VALOR_INICIAL: SolicitarAcaoValues = {
  tipo_acao: "",
  time_responsavel: "TECNICO",
  prioridade: "MEDIA",
  descricao: "",
  barramentos: [],
}

// O Select do Base UI decide se é controlado ou não no primeiro render, a
// partir de `value === undefined` — por isso `tipo_acao` (que começa "")
// precisa de um sentinel sempre definido em vez de `|| undefined`, senão o
// componente nasce "não controlado" e vira "controlado" depois (Base UI
// acusa isso como erro). Esse mesmo Select também não resolve sozinho o
// rótulo a partir dos `SelectItem` renderizados (mostraria o código bruto,
// tipo "COBRANCA", em vez de "Solicitar cobrança") — por isso todo
// `SelectValue` abaixo recebe uma função de label explícita.
const TIPO_NAO_SELECIONADO = "__nenhum_tipo__"

export function SolicitarAcaoModal({ open, onOpenChange, idProvedor, onSalvar }: SolicitarAcaoModalProps) {
  const [valores, setValores] = useState<SolicitarAcaoValues>(VALOR_INICIAL)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [postes, setPostes] = useState<PosteDoProvedor[]>([])
  const [carregandoPostes, setCarregandoPostes] = useState(false)

  useEffect(() => {
    if (open) {
      setValores(VALOR_INICIAL)
      setErro(null)
      setPostes([])
    }
  }, [open])

  // Remoção pode ser vinculada a postes reais do provedor no Mapa de Postes
  // (a mesma ação passa a existir nos dois lugares) - a lista só é buscada
  // quando o usuário de fato escolhe esse tipo, pra não gastar requisição à
  // toa nos outros tipos de solicitação.
  useEffect(() => {
    if (!open || valores.tipo_acao !== "REMOCAO" || !idProvedor) return

    let cancelado = false
    setCarregandoPostes(true)
    fetch(`${API_BASE_URL}/api/provedores/${idProvedor}/postes`, { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : []))
      .then((dados) => {
        if (!cancelado) setPostes(Array.isArray(dados) ? dados : [])
      })
      .catch(() => {
        if (!cancelado) setPostes([])
      })
      .finally(() => {
        if (!cancelado) setCarregandoPostes(false)
      })

    return () => {
      cancelado = true
    }
  }, [open, valores.tipo_acao, idProvedor])

  function selecionarTipo(tipo: string | null) {
    if (!tipo || tipo === TIPO_NAO_SELECIONADO) return
    const catalogo = CATALOGO_TIPOS_ACAO[tipo]
    setValores((atual) => ({
      ...atual,
      tipo_acao: tipo,
      time_responsavel: catalogo?.time ?? atual.time_responsavel,
      barramentos: tipo === "REMOCAO" ? atual.barramentos : [],
    }))
  }

  function alternarBarramento(barramento: string) {
    setValores((atual) => ({
      ...atual,
      barramentos: atual.barramentos.includes(barramento)
        ? atual.barramentos.filter((item) => item !== barramento)
        : [...atual.barramentos, barramento],
    }))
  }

  async function handleSalvar() {
    if (!valores.tipo_acao) {
      setErro("Selecione o tipo de ação.")
      return
    }
    if (!valores.descricao.trim()) {
      setErro("Descreva o que precisa ser feito.")
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(valores)
      onOpenChange(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao registrar a solicitação")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar ação</DialogTitle>
          <DialogDescription>
            Registra um pedido de ação sobre este contrato para o time responsável executar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Tipo de ação</span>
            <Select value={valores.tipo_acao || TIPO_NAO_SELECIONADO} onValueChange={selecionarTipo}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(valor: string) => (valor === TIPO_NAO_SELECIONADO ? "Selecione o tipo de ação" : CATALOGO_TIPOS_ACAO[valor]?.label ?? valor)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TIPO_NAO_SELECIONADO} className="text-muted-foreground">
                  Selecione o tipo de ação
                </SelectItem>
                {Object.entries(CATALOGO_TIPOS_ACAO).map(([codigo, info]) => (
                  <SelectItem key={codigo} value={codigo}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Time responsável</span>
            <Select
              value={valores.time_responsavel}
              onValueChange={(valor) => setValores((atual) => ({ ...atual, time_responsavel: valor as TimeResponsavel }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(valor: string) => LABEL_TIME[valor] ?? valor}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABEL_TIME).map(([codigo, label]) => (
                  <SelectItem key={codigo} value={codigo}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {valores.tipo_acao === "REMOCAO" && (
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Postes envolvidos</span>
              <p className="text-xs text-slate-500">
                Selecionados aqui, os postes viram uma ação de verdade no Mapa de Postes, visível pro time técnico.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-300">
                {carregandoPostes ? (
                  <p className="p-3 text-xs text-slate-500">Carregando postes do provedor...</p>
                ) : postes.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">Nenhum poste identificado como ocupado por este provedor.</p>
                ) : (
                  postes.map((poste) => (
                    <label
                      key={poste.BARRAMENTO}
                      className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={valores.barramentos.includes(poste.BARRAMENTO)}
                        onChange={() => alternarBarramento(poste.BARRAMENTO)}
                      />
                      <span className="font-medium text-slate-700">{poste.BARRAMENTO}</span>
                      {poste.BOARD_NAME && <span className="text-xs text-slate-500">{poste.BOARD_NAME}</span>}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Prioridade</span>
            <Select
              value={valores.prioridade}
              onValueChange={(valor) => valor && setValores((atual) => ({ ...atual, prioridade: valor }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(valor: string) => LABEL_PRIORIDADE[valor] ?? valor}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BAIXA">Baixa</SelectItem>
                <SelectItem value="MEDIA">Média</SelectItem>
                <SelectItem value="ALTA">Alta</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Descrição</span>
            <textarea
              value={valores.descricao}
              onChange={(event) => setValores((atual) => ({ ...atual, descricao: event.target.value }))}
              rows={3}
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="O que precisa ser feito e por quê"
            />
          </label>
        </div>

        {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Enviando..." : "Solicitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
