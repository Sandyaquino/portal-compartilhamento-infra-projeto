"use client"

import { useEffect, useMemo, useState } from "react"

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
import { useCurrentUser } from "@/hooks/use-current-user"
import {
  LABEL_PRIORIDADE_PROJETO,
  type ChecklistResposta,
  type ModalidadeCatalogo,
  type ModalidadeProjeto,
  type OpcaoVinculoProvedor,
  type PrioridadeProjeto,
  type TipoProjeto,
  type TipoProjetoCatalogo,
} from "@/lib/types/projetos"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCriado: (idProjeto: number) => void
}

const SEM_PROVEDOR = "__sem_prov__"
const SEM_PROCESSO = "__sem_proc__"
const PRIORIDADES: PrioridadeProjeto[] = ["BAIXA", "MEDIA", "ALTA", "URGENTE"]

export function NovoProjetoModal({ open, onOpenChange, onCriado }: Props) {
  const { user } = useCurrentUser()

  const [opcoes, setOpcoes] = useState<OpcaoVinculoProvedor[]>([])
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false)

  const [idProvedor, setIdProvedor] = useState("")
  const [idProcesso, setIdProcesso] = useState("")
  const [municipio, setMunicipio] = useState("")
  const [uf, setUf] = useState("")
  const [prioridade, setPrioridade] = useState<PrioridadeProjeto>("MEDIA")
  const [qtdPostes, setQtdPostes] = useState("")
  const [titulo, setTitulo] = useState("")

  // Classificação vinda do e-mail (define o procedimento e o checklist).
  const [tiposCatalogo, setTiposCatalogo] = useState<TipoProjetoCatalogo[]>([])
  const [modalidadesCatalogo, setModalidadesCatalogo] = useState<ModalidadeCatalogo[]>([])
  const [tipoProjeto, setTipoProjeto] = useState<TipoProjeto>("NOVO_COMPARTILHAMENTO")
  const [modalidade, setModalidade] = useState<ModalidadeProjeto>("COMPLETO")
  const [semContrato, setSemContrato] = useState(false)
  const [diasRevelia, setDiasRevelia] = useState("")
  const [protocoloCrm, setProtocoloCrm] = useState("")
  const [notaCcs, setNotaCcs] = useState("")
  const [pastaSp, setPastaSp] = useState("")
  const [checklist, setChecklist] = useState<ChecklistResposta | null>(null)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdProvedor("")
    setIdProcesso("")
    setMunicipio("")
    setUf("")
    setPrioridade("MEDIA")
    setQtdPostes("")
    setTitulo("")
    setTipoProjeto("NOVO_COMPARTILHAMENTO")
    setModalidade("COMPLETO")
    setSemContrato(false)
    setDiasRevelia("")
    setProtocoloCrm("")
    setNotaCcs("")
    setPastaSp("")
    setChecklist(null)
    setErro(null)

    let cancelado = false
    setCarregandoOpcoes(true)
    Promise.all([
      fetch(`${API_BASE_URL}/api/projetos/opcoes-vinculo`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE_URL}/api/projetos/tipos`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([opc, tipos]) => {
        if (cancelado) return
        setOpcoes(Array.isArray(opc) ? opc : [])
        setTiposCatalogo(Array.isArray(tipos?.tipos) ? tipos.tipos : [])
        setModalidadesCatalogo(Array.isArray(tipos?.modalidades) ? tipos.modalidades : [])
      })
      .catch(() => {
        if (!cancelado) setOpcoes([])
      })
      .finally(() => {
        if (!cancelado) setCarregandoOpcoes(false)
      })

    return () => {
      cancelado = true
    }
  }, [open])

  // Recarrega o checklist de documentos a cada mudança na classificação.
  useEffect(() => {
    if (!open) return
    const qs = new URLSearchParams({
      tipo: tipoProjeto,
      modalidade,
      sem_contrato: semContrato ? "S" : "N",
      qtd_postes: qtdPostes || "0",
      dias_revelia: diasRevelia || "0",
    })
    let cancelado = false
    fetch(`${API_BASE_URL}/api/projetos/checklist?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelado) setChecklist(d && Array.isArray(d.documentos) ? d : null)
      })
      .catch(() => {
        if (!cancelado) setChecklist(null)
      })
    return () => {
      cancelado = true
    }
  }, [open, tipoProjeto, modalidade, semContrato, qtdPostes, diasRevelia])

  const provedorSelecionado = useMemo(
    () => opcoes.find((p) => String(p.ID_PROVEDOR) === idProvedor) ?? null,
    [opcoes, idProvedor],
  )

  function selecionarProvedor(valor: string | null) {
    if (!valor || valor === SEM_PROVEDOR) {
      setIdProvedor("")
      setIdProcesso("")
      return
    }
    setIdProvedor(valor)
    setIdProcesso("")
    const prov = opcoes.find((p) => String(p.ID_PROVEDOR) === valor)
    if (prov) {
      setMunicipio(prov.MUNICIPIO ?? "")
      setUf(prov.UF ?? "")
    }
  }

  async function handleSalvar() {
    if (!idProvedor) {
      setErro("Selecione o provedor a que o projeto será associado.")
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const resposta = await fetch(`${API_BASE_URL}/api/projetos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_provedor: Number(idProvedor),
          id_processo: idProcesso ? Number(idProcesso) : null,
          municipio: municipio.trim() || null,
          uf: uf.trim() || null,
          prioridade,
          qtd_postes_informada: qtdPostes ? Number(qtdPostes) : 0,
          titulo: titulo.trim() || null,
          tipo_projeto: tipoProjeto,
          modalidade,
          sem_contrato: semContrato ? "S" : "N",
          dias_operacao_revelia: diasRevelia ? Number(diasRevelia) : null,
          protocolo_sap_crm: protocoloCrm.trim() || null,
          nota_sap_ccs: notaCcs.trim() || null,
          pasta_sharepoint: pastaSp.trim() || null,
          usuario: user?.login ?? null,
        }),
      })
      const dados = await resposta.json().catch(() => null)
      if (!resposta.ok) throw new Error(dados?.detail || "Erro ao criar o projeto.")
      onOpenChange(false)
      onCriado(dados.id_projeto)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar o projeto.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Cria um projeto de compartilhamento e o associa a um provedor (e, opcionalmente,
            a um processo) já existentes na jornada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Provedor</span>
            <Select value={idProvedor || SEM_PROVEDOR} onValueChange={selecionarProvedor}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(valor: string) => {
                    if (valor === SEM_PROVEDOR) {
                      return carregandoOpcoes ? "Carregando provedores..." : "Selecione o provedor"
                    }
                    const prov = opcoes.find((p) => String(p.ID_PROVEDOR) === valor)
                    return prov ? prov.NOME_FANTASIA || prov.RAZAO_SOCIAL : valor
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PROVEDOR} className="text-muted-foreground">
                  Selecione o provedor
                </SelectItem>
                {opcoes.map((prov) => (
                  <SelectItem key={prov.ID_PROVEDOR} value={String(prov.ID_PROVEDOR)}>
                    {prov.NOME_FANTASIA || prov.RAZAO_SOCIAL}
                    <span className="ml-1 font-mono text-xs text-slate-400">{prov.CNPJ}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">
              Processo <span className="text-slate-400">(opcional)</span>
            </span>
            <Select
              value={idProcesso || SEM_PROCESSO}
              onValueChange={(valor) => setIdProcesso(valor === SEM_PROCESSO || valor === null ? "" : valor)}
            >
              <SelectTrigger className="w-full" disabled={!provedorSelecionado}>
                <SelectValue>
                  {(valor: string) => {
                    if (valor === SEM_PROCESSO) return "Sem processo vinculado"
                    const proc = provedorSelecionado?.processos.find(
                      (p) => String(p.ID_PROCESSO) === valor,
                    )
                    return proc?.NUMERO_PROTOCOLO || valor
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PROCESSO}>Sem processo vinculado</SelectItem>
                {(provedorSelecionado?.processos ?? []).map((proc) => (
                  <SelectItem key={proc.ID_PROCESSO} value={String(proc.ID_PROCESSO)}>
                    {proc.NUMERO_PROTOCOLO || `Processo #${proc.ID_PROCESSO}`}
                    {proc.STATUS_ATUAL ? (
                      <span className="ml-1 text-xs text-slate-400">· {proc.STATUS_ATUAL}</span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provedorSelecionado && provedorSelecionado.processos.length === 0 && (
              <span className="text-[11px] text-slate-500">
                Este provedor ainda não tem processos. O projeto fica ligado só ao provedor.
              </span>
            )}
          </label>

          {/* Classificação do projeto (com base no e-mail do provedor) */}
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Tipo de projeto</span>
              <select
                value={tipoProjeto}
                onChange={(e) => setTipoProjeto(e.target.value as TipoProjeto)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                {tiposCatalogo.map((t) => (
                  <option key={t.CODIGO} value={t.CODIGO}>{t.NOME}</option>
                ))}
              </select>
              {tiposCatalogo.find((t) => t.CODIGO === tipoProjeto)?.DESCRICAO && (
                <span className="text-[11px] text-slate-500">
                  {tiposCatalogo.find((t) => t.CODIGO === tipoProjeto)?.DESCRICAO}
                </span>
              )}
            </label>

            <div className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Modalidade de apresentação</span>
              <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
                {(["COMPLETO", "CHECKLIST_SIMPLIFICADO"] as ModalidadeProjeto[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModalidade(m)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                      modalidade === m ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {m === "COMPLETO" ? "Documentação completa" : "Checklist Simplificado"}
                  </button>
                ))}
              </div>
              {modalidade === "CHECKLIST_SIMPLIFICADO" && (
                <>
                  {modalidadesCatalogo.find((m) => m.CODIGO === "CHECKLIST_SIMPLIFICADO")?.REGRA_ELEGIBILIDADE && (
                    <span className="text-[11px] text-slate-500">
                      {modalidadesCatalogo.find((m) => m.CODIGO === "CHECKLIST_SIMPLIFICADO")?.REGRA_ELEGIBILIDADE}
                    </span>
                  )}
                  {checklist && (
                    <span
                      className={`rounded-md border px-2 py-1.5 text-[11px] ${
                        checklist.elegibilidade_simplificado.elegivel
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {checklist.elegibilidade_simplificado.motivo}
                    </span>
                  )}
                </>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={semContrato}
                onChange={(e) => setSemContrato(e.target.checked)}
              />
              Empresa <strong>sem contrato</strong> — exige a documentação societária
            </label>

            {tipoProjeto === "PONTOS_REVELIA" && (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-slate-700">
                  Dias de operação da ocupação à revelia <span className="text-slate-400">(regra dos 180 dias)</span>
                </span>
                <input
                  type="number"
                  min={0}
                  value={diasRevelia}
                  onChange={(e) => setDiasRevelia(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  placeholder="0"
                />
              </label>
            )}

            {checklist && (
              <div className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  Documentos obrigatórios ({checklist.documentos.length})
                </span>
                <ul className="grid gap-0.5 rounded-md border border-slate-200 bg-white p-2 text-[12px] text-slate-600">
                  {checklist.documentos.map((d) => (
                    <li key={d.CODIGO} className="flex items-center gap-1.5">
                      <span className="text-slate-300">•</span>
                      {d.NOME}
                      <span className="text-[10px] text-slate-400">({d.EXTENSOES_ACEITAS})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Integração do recebimento */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">
                Protocolo SAP CRM <span className="text-slate-400">(opcional)</span>
              </span>
              <input
                value={protocoloCrm}
                onChange={(e) => setProtocoloCrm(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="CRM-2026-000123"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">
                Nota SAP CCS <span className="text-slate-400">(opcional)</span>
              </span>
              <input
                value={notaCcs}
                onChange={(e) => setNotaCcs(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="CCS-700123"
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">
              Pasta no SharePoint <span className="text-slate-400">(opcional)</span>
            </span>
            <input
              value={pastaSp}
              onChange={(e) => setPastaSp(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="https://sharepoint.local/sites/compartilhamento/Documentos/..."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Município</span>
              <input
                value={municipio}
                onChange={(event) => setMunicipio(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="Município do projeto"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">UF</span>
              <input
                value={uf}
                onChange={(event) => setUf(event.target.value.toUpperCase().slice(0, 2))}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase"
                placeholder="BA"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Prioridade</span>
              <Select
                value={prioridade}
                onValueChange={(valor) => valor && setPrioridade(valor as PrioridadeProjeto)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(valor: string) =>
                      LABEL_PRIORIDADE_PROJETO[valor as PrioridadeProjeto] ?? valor
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {LABEL_PRIORIDADE_PROJETO[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">
                Postes informados <span className="text-slate-400">(opcional)</span>
              </span>
              <input
                type="number"
                min={0}
                value={qtdPostes}
                onChange={(event) => setQtdPostes(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="0"
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-slate-700">
              Título <span className="text-slate-400">(opcional)</span>
            </span>
            <input
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="Gerado automaticamente a partir do provedor e do município"
            />
          </label>
        </div>

        {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={salvando || carregandoOpcoes}>
            {salvando ? "Criando..." : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
