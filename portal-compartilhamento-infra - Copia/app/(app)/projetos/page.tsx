"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Inbox, Plus, Search } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { API_BASE_URL } from "@/lib/config"
import { EstatItem, Medidor, StatusPill } from "@/components/projetos/projeto-ui"
import { NovoProjetoModal } from "@/components/projetos/novo-projeto-modal"
import {
  LABEL_STATUS_PROJETO,
  type ProjetoListaItem,
  type ResumoProjetos,
  type StatusProjeto,
} from "@/lib/types/projetos"

const FILTROS_STATUS: Array<{ valor: StatusProjeto | null; rotulo: string }> = [
  { valor: null, rotulo: "Todos" },
  { valor: "EM_ANALISE", rotulo: "Em análise" },
  { valor: "PENDENTE_DOC", rotulo: "Pendente doc." },
  { valor: "ANALISE_TECNICA", rotulo: "Análise técnica" },
  { valor: "PARECER_EMITIDO", rotulo: "Parecer emitido" },
  { valor: "VINCULADO", rotulo: "Vinculado" },
  { valor: "CONCLUIDO", rotulo: "Concluído" },
]

function formatarData(valor?: string | null) {
  if (!valor) return "—"
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("pt-BR")
}

export default function ProjetosPage() {
  const router = useRouter()
  const [projetos, setProjetos] = useState<ProjetoListaItem[]>([])
  const [resumo, setResumo] = useState<ResumoProjetos | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState<StatusProjeto | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [modalNovo, setModalNovo] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroStatus) params.set("status", filtroStatus)
      const [projetosRes, resumoRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/projetos?${params.toString()}`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/projetos/resumo`, { cache: "no-store" }),
      ])
      if (!projetosRes.ok) throw new Error(`Erro ${projetosRes.status} ao carregar os projetos`)
      setProjetos(await projetosRes.json())
      setResumo(resumoRes.ok ? await resumoRes.json() : null)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar a carteira de projetos",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return projetos
    return projetos.filter((p) =>
      [p.NUMERO_PROJETO, p.RAZAO_SOCIAL, p.NOME_FANTASIA, p.CNPJ, p.NUMERO_PROTOCOLO]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(termo)),
    )
  }, [projetos, busca])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Carteira de Projetos"
        description="Análise de projetos de compartilhamento de infraestrutura — da chegada por e-mail ao vínculo com a jornada do provedor."
        breadcrumbs={[{ label: "Início", href: "/" }, { label: "Projetos" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/projetos/entrada")}>
              <Inbox className="h-4 w-4" />
              Caixa de Entrada{resumo && resumo.submissoes_novas > 0 ? ` · ${resumo.submissoes_novas}` : ""}
            </Button>
            <Button type="button" onClick={() => setModalNovo(true)}>
              <Plus className="h-4 w-4" />
              Novo projeto
            </Button>
          </div>
        }
      />

      <NotificationBanner notification={notification} />

      {/* Faixa de indicadores */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        <EstatItem label="Projetos" valor={resumo ? resumo.total : "—"} tom="primary" sub="ativos na carteira" />
        <EstatItem label="Em análise" valor={resumo ? resumo.em_analise : "—"} sub="aguardando parecer" />
        <EstatItem label="Pendente doc." valor={resumo ? resumo.pendente_doc : "—"} tom="amber" sub="documentação incompleta" />
        <EstatItem label="Vinculados" valor={resumo ? resumo.vinculados : "—"} tom="green" sub="ligados à jornada" />
        <EstatItem label="Atrasados" valor={resumo ? resumo.atrasados : "—"} tom={resumo && resumo.atrasados > 0 ? "red" : "slate"} sub="prazo de análise vencido" />
        <EstatItem
          label="Postes"
          valor={resumo ? resumo.postes_aprovados.toLocaleString("pt-BR") : "—"}
          sub={resumo ? `de ${resumo.postes_recebidos.toLocaleString("pt-BR")} recebidos` : "aprovados"}
        />
      </div>

      {resumo && resumo.atrasados > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {resumo.atrasados} projeto(s) com prazo de análise vencido.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {FILTROS_STATUS.map((f) => (
            <button
              key={f.rotulo}
              type="button"
              onClick={() => setFiltroStatus(f.valor)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filtroStatus === f.valor ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 lg:w-[360px]">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Nº do projeto, razão social, CNPJ, protocolo..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[1080px] text-sm">
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <TableHead className="px-5 py-3 font-semibold">Projeto</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Provedor</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Local</TableHead>
                <TableHead className="w-[180px] px-5 py-3 font-semibold">Documentação</TableHead>
                <TableHead className="w-[180px] px-5 py-3 font-semibold">Postes validados</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Vínculo</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Recebido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">Carregando...</TableCell></TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={8}><EmptyState message="Nenhum projeto encontrado." /></TableCell></TableRow>
              ) : (
                filtrados.map((p) => (
                  <TableRow
                    key={p.ID_PROJETO}
                    className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    onClick={() => router.push(`/projetos/${p.ID_PROJETO}`)}
                  >
                    <TableCell className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{p.NUMERO_PROJETO}</p>
                      <p className="max-w-[240px] truncate text-xs text-slate-500" title={p.TITULO ?? undefined}>{p.TITULO}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <p className="max-w-[220px] truncate text-slate-700" title={p.RAZAO_SOCIAL}>{p.NOME_FANTASIA || p.RAZAO_SOCIAL}</p>
                      <p className="font-mono text-xs text-slate-400">{p.CNPJ}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-slate-600">
                      {p.MUNICIPIO}<span className="text-slate-400">/{p.UF}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Medidor label="obrigatórios" atual={p.DOCS_VALIDADOS} total={p.DOCS_OBRIGATORIOS} tom={p.DOCUMENTACAO_OK === "S" ? "green" : "amber"} />
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Medidor label="de recebidos" atual={p.QTD_POSTES_VALIDADA} total={p.QTD_POSTES_RECEBIDA || p.QTD_POSTES_INFORMADA} tom="primary" />
                    </TableCell>
                    <TableCell className="px-5 py-3 text-xs">
                      {p.NUMERO_PROTOCOLO ? (
                        <span className="font-medium text-teal-700">{p.NUMERO_PROTOCOLO}</span>
                      ) : p.ID_PROVEDOR ? (
                        <span className="text-slate-500">Provedor #{p.ID_PROVEDOR}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {p.CHAVE_CONEXAO}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3"><StatusPill status={p.STATUS_PROJETO} /></TableCell>
                    <TableCell className="px-5 py-3 text-slate-600">{formatarData(p.DATA_RECEBIMENTO)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && filtrados.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
            {filtrados.length} projeto{filtrados.length === 1 ? "" : "s"}
            {filtroStatus ? ` · ${LABEL_STATUS_PROJETO[filtroStatus]}` : ""}
          </div>
        )}
      </div>

      <NovoProjetoModal
        open={modalNovo}
        onOpenChange={setModalNovo}
        onCriado={(idProjeto) => router.push(`/projetos/${idProjeto}`)}
      />
    </div>
  )
}
