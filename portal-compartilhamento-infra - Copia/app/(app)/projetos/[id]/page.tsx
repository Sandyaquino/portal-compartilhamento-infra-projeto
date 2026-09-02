"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  RefreshCcw,
  XCircle,
} from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { API_BASE_URL } from "@/lib/config"
import { useCurrentUser } from "@/hooks/use-current-user"
import { AbasEnterprise, Def, DefGrid, Medidor, SecaoCard, StatusPill } from "@/components/projetos/projeto-ui"
import {
  LABEL_STATUS_PROJETO,
  type ProjetoDetalhe,
  type StatusProjeto,
} from "@/lib/types/projetos"

function fData(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR")
}
function fDataHora(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR")
}

const CLASSE_DOC: Record<string, string> = {
  VALIDADO: "bg-green-100 text-green-700",
  RECEBIDO: "bg-blue-100 text-blue-700",
  PENDENTE: "bg-slate-100 text-slate-500",
  REJEITADO: "bg-red-100 text-red-700",
}
const CLASSE_POSTE: Record<string, string> = {
  APROVADO: "bg-green-100 text-green-700",
  PENDENTE: "bg-slate-100 text-slate-500",
  REPROVADO: "bg-red-100 text-red-700",
  REVISAR: "bg-amber-100 text-amber-700",
}
const ITENS_CHECKLIST = [
  ["DOC_CONFERIDA", "Documentação conferida"],
  ["CNPJ_REGULAR", "CNPJ regular"],
  ["LICENCA_ANATEL_OK", "Licença ANATEL"],
  ["POSTES_LOCALIZADOS", "Postes localizados"],
  ["GEO_DENTRO_CONCESSAO", "Geo dentro da concessão"],
  ["CAPACIDADE_SUFICIENTE", "Capacidade suficiente"],
] as const

export default function ProjetoDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useCurrentUser()
  const id = params.id as string

  const [dados, setDados] = useState<ProjetoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState("cadastro")
  const [notification, setNotification] = useState<Notification | null>(null)
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/projetos/${id}`, { cache: "no-store" })
      if (!res.ok) throw new Error((await res.text()) || "Erro ao carregar o projeto")
      setDados(await res.json())
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao carregar o projeto" })
      setDados(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function mudarStatus(novo: StatusProjeto) {
    setSalvandoStatus(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/projetos/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo, usuario: user?.login ?? "dev.local" }),
      })
      if (!res.ok) throw new Error((await res.text()) || "Erro ao mudar o status")
      setNotification({ type: "success", message: "Status atualizado." })
      await carregar()
    } catch (error) {
      setNotification({ type: "error", message: error instanceof Error ? error.message : "Erro ao mudar o status" })
    } finally {
      setSalvandoStatus(false)
    }
  }

  async function mudarDoc(idDoc: number, status: string, motivo?: string) {
    const res = await fetch(`${API_BASE_URL}/api/projetos/${id}/documentos/${idDoc}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, motivo, usuario: user?.login ?? "dev.local" }),
    })
    if (!res.ok) return setNotification({ type: "error", message: `Erro ${res.status} ao atualizar o documento` })
    await carregar()
  }

  async function mudarPoste(idPoste: number, status_analise: string) {
    const res = await fetch(`${API_BASE_URL}/api/projetos/${id}/postes/${idPoste}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status_analise }),
    })
    if (!res.ok) return setNotification({ type: "error", message: `Erro ${res.status} ao atualizar o poste` })
    await carregar()
  }

  async function registrarParecer(resultado: string) {
    const res = await fetch(`${API_BASE_URL}/api/projetos/${id}/analise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resultado,
        doc_conferida: true,
        cnpj_regular: true,
        licenca_anatel_ok: true,
        postes_localizados: true,
        geo_dentro_concessao: true,
        capacidade_suficiente: resultado !== "REPROVADO",
        parecer: `Parecer ${resultado} registrado pela análise.`,
        usuario: user?.login ?? "dev.local",
      }),
    })
    if (!res.ok) return setNotification({ type: "error", message: `Erro ${res.status} ao registrar o parecer` })
    setNotification({ type: "success", message: "Parecer registrado." })
    await carregar()
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Carregando projeto...</div>
  if (!dados) return <div className="p-6"><EmptyState message="Projeto não encontrado." /></div>

  const { projeto, postes, documentos, analises, historico, vinculo } = dados
  const obrigatorios = documentos.filter((d) => d.OBRIGATORIO === "S")
  const docsValidados = obrigatorios.filter((d) => d.STATUS_DOCUMENTO === "VALIDADO").length
  const postesAprovados = postes.filter((p) => p.STATUS_ANALISE === "APROVADO").length
  const postesReprovados = postes.filter((p) => p.STATUS_ANALISE === "REPROVADO").length
  const postesPendentes = postes.filter((p) => p.STATUS_ANALISE === "PENDENTE").length

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader
        title={projeto.NUMERO_PROJETO}
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Projetos", href: "/projetos" },
          { label: projeto.NUMERO_PROJETO },
        ]}
        actions={
          <Button type="button" variant="outline" onClick={() => router.push("/projetos")}>
            <ArrowLeft className="h-4 w-4" />
            Carteira
          </Button>
        }
      />

      <NotificationBanner notification={notification} />

      {/* Cabeçalho-resumo */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{projeto.NUMERO_PROJETO}</h1>
              <StatusPill status={projeto.STATUS_PROJETO} />
              {projeto.PRIORIDADE && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  Prioridade {projeto.PRIORIDADE}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{projeto.TITULO}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={projeto.STATUS_PROJETO} onValueChange={(v) => v && mudarStatus(v as StatusProjeto)} disabled={salvandoStatus}>
              <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_STATUS_PROJETO) as StatusProjeto[]).map((s) => (
                  <SelectItem key={s} value={s}>{LABEL_STATUS_PROJETO[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={carregar} title="Atualizar">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 divide-x divide-slate-100 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Provedor", projeto.NOME_FANTASIA || projeto.RAZAO_SOCIAL],
            ["Município", `${projeto.MUNICIPIO ?? "—"}/${projeto.UF ?? ""}`],
            ["Recebido em", fData(projeto.DATA_RECEBIMENTO)],
            ["Responsável", projeto.RESPONSAVEL_ANALISE ?? "Não atribuído"],
            ["Prazo de análise", fData(projeto.PRAZO_ANALISE)],
          ].map(([label, valor]) => (
            <div key={label} className="px-5 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-slate-800" title={String(valor)}>{valor}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 gap-5 border-t border-slate-100 p-5 sm:grid-cols-2">
          <Medidor label="Documentação obrigatória validada" atual={docsValidados} total={obrigatorios.length} tom={projeto.DOCUMENTACAO_OK === "S" ? "green" : "amber"} />
          <Medidor label="Postes aprovados (de recebidos)" atual={postesAprovados} total={postes.length} tom="primary" />
        </div>
      </div>

      <div>
        <AbasEnterprise
          ativa={aba}
          onChange={setAba}
          abas={[
            { valor: "cadastro", rotulo: "Cadastro" },
            { valor: "documentos", rotulo: "Documentos", contador: obrigatorios.length },
            { valor: "postes", rotulo: "Postes", contador: postes.length },
            { valor: "analise", rotulo: "Análise", contador: analises.length },
            { valor: "vinculo", rotulo: "Vínculo & Histórico" },
          ]}
        />

        {/* Cadastro */}
        {aba === "cadastro" && (
        <div className="space-y-5 pt-5">
          <SecaoCard titulo="Identificação">
            <DefGrid>
              <Def label="Número do projeto">{projeto.NUMERO_PROJETO}</Def>
              <Def label="Chave de conexão (CNPJ)"><span className="font-mono">{projeto.CHAVE_CONEXAO}</span></Def>
              <Def label="Prioridade">{projeto.PRIORIDADE}</Def>
              <Def label="Razão social">{projeto.RAZAO_SOCIAL}</Def>
              <Def label="Nome fantasia">{projeto.NOME_FANTASIA}</Def>
              <Def label="CNPJ"><span className="font-mono">{projeto.CNPJ}</span></Def>
            </DefGrid>
          </SecaoCard>

          <SecaoCard titulo="Localização & volumetria">
            <DefGrid>
              <Def label="Município / UF">{projeto.MUNICIPIO}/{projeto.UF}</Def>
              <Def label="Regional">{projeto.REGIONAL}</Def>
              <Def label="Postes informados">{projeto.QTD_POSTES_INFORMADA}</Def>
              <Def label="Postes recebidos">{projeto.QTD_POSTES_RECEBIDA}</Def>
              <Def label="Postes validados"><span className="text-green-700">{projeto.QTD_POSTES_VALIDADA}</span></Def>
              <Def label="Documentação">{projeto.DOCS_VALIDADOS}/{projeto.DOCS_OBRIGATORIOS} validados</Def>
            </DefGrid>
          </SecaoCard>

          <SecaoCard titulo="Origem da submissão">
            <DefGrid>
              <Def label="Canal">{projeto.CANAL_ORIGEM}</Def>
              <Def label="E-mail remetente">{projeto.EMAIL_REMETENTE}</Def>
              <Def label="Submetido por">{projeto.SUBMETIDO_POR}</Def>
              <Def label="Recebido em">{fDataHora(projeto.DATA_RECEBIMENTO)}</Def>
              <Def label="Criado por">{projeto.CREATED_BY}</Def>
              <Def label="Concluído em">{fDataHora(projeto.DATA_CONCLUSAO)}</Def>
            </DefGrid>
          </SecaoCard>
        </div>
        )}

        {/* Documentos */}
        {aba === "documentos" && (
        <div className="pt-5">
          <SecaoCard
            titulo="Documentos do projeto"
            descricao="Arquivos recebidos por e-mail e sua validação."
            acao={<div className="w-44"><Medidor label="obrigatórios validados" atual={docsValidados} total={obrigatorios.length} tom={projeto.DOCUMENTACAO_OK === "S" ? "green" : "amber"} /></div>}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table className="text-sm">
                <TableHeader className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <TableRow>
                    <TableHead className="px-4 py-2.5">Documento</TableHead>
                    <TableHead className="px-4 py-2.5">Arquivo</TableHead>
                    <TableHead className="px-4 py-2.5">Recebido</TableHead>
                    <TableHead className="px-4 py-2.5">Status</TableHead>
                    <TableHead className="px-4 py-2.5 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentos.map((d) => (
                    <TableRow key={d.ID_PROJETO_DOCUMENTO} className="border-b border-slate-100 last:border-b-0">
                      <TableCell className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{d.TIPO_DOCUMENTO}</p>
                        <p className="text-[11px] font-semibold text-slate-400">
                          {d.OBRIGATORIO === "S" ? "OBRIGATÓRIO" : "OPCIONAL"}
                        </p>
                        {d.MOTIVO_REJEICAO && <p className="mt-0.5 text-xs text-red-600">{d.MOTIVO_REJEICAO}</p>}
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        {d.CAMINHO_ARQUIVO ? (
                          <a href={d.CAMINHO_ARQUIVO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <FileText className="h-3.5 w-3.5" />{d.NOME_ARQUIVO}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">não recebido</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-xs text-slate-500">{fData(d.DATA_RECEBIMENTO)}</TableCell>
                      <TableCell className="px-4 py-2.5">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${CLASSE_DOC[d.STATUS_DOCUMENTO]}`}>
                          {d.STATUS_DOCUMENTO}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right">
                        {d.STATUS_DOCUMENTO !== "PENDENTE" && (
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="icon-sm" title="Validar" onClick={() => mudarDoc(d.ID_PROJETO_DOCUMENTO, "VALIDADO")}>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-sm" title="Rejeitar" onClick={() => mudarDoc(d.ID_PROJETO_DOCUMENTO, "REJEITADO", "Documento fora do padrão.")}>
                              <XCircle className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SecaoCard>
        </div>
        )}

        {/* Postes */}
        {aba === "postes" && (
        <div className="pt-5">
          <SecaoCard titulo="Postes do projeto" descricao="Relação recebida na planilha, com latitude/longitude e resultado da análise técnica.">
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-green-50 px-2 py-1 font-semibold text-green-700">{postesAprovados} aprovados</span>
              <span className="rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700">{postesReprovados} reprovados</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{postesPendentes} pendentes</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{postes.filter((p) => p.GEO_VALIDADA === "S").length} com geo validada</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table className="min-w-[900px] text-xs">
                <TableHeader className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <TableRow>
                    <TableHead className="px-3 py-2.5">Identificador</TableHead>
                    <TableHead className="px-3 py-2.5">Barramento</TableHead>
                    <TableHead className="px-3 py-2.5">Latitude</TableHead>
                    <TableHead className="px-3 py-2.5">Longitude</TableHead>
                    <TableHead className="px-3 py-2.5">Município</TableHead>
                    <TableHead className="px-3 py-2.5 text-center">Geo</TableHead>
                    <TableHead className="px-3 py-2.5">Status</TableHead>
                    <TableHead className="px-3 py-2.5 text-right">Análise</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postes.map((p) => (
                    <TableRow key={p.ID_PROJETO_POSTE} className="border-b border-slate-100 last:border-b-0">
                      <TableCell className="px-3 py-2.5 font-medium text-slate-700">{p.IDENTIFICADOR_POSTE}</TableCell>
                      <TableCell className="px-3 py-2.5 text-slate-600">
                        {p.BARRAMENTO ? (
                          <Link href="/mapa-postes" className="text-primary hover:underline">{p.BARRAMENTO}</Link>
                        ) : (
                          <span className="text-slate-400">não casado</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-slate-600">{p.LATITUDE?.toFixed(6)}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-slate-600">{p.LONGITUDE?.toFixed(6)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-slate-600">{p.MUNICIPIO}</TableCell>
                      <TableCell className="px-3 py-2.5 text-center">
                        {p.GEO_VALIDADA === "S" ? <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" /> : <XCircle className="mx-auto h-4 w-4 text-slate-300" />}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${CLASSE_POSTE[p.STATUS_ANALISE]}`}>
                          {p.STATUS_ANALISE}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" title="Aprovar" onClick={() => mudarPoste(p.ID_PROJETO_POSTE, "APROVADO")}>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon-sm" title="Reprovar" onClick={() => mudarPoste(p.ID_PROJETO_POSTE, "REPROVADO")}>
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SecaoCard>
        </div>
        )}

        {/* Análise */}
        {aba === "analise" && (
        <div className="space-y-5 pt-5">
          <SecaoCard titulo="Registrar parecer" descricao="Encerra a análise técnica e move o projeto para a próxima etapa.">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => registrarParecer("APROVADO")}>
                <CheckCircle2 className="h-4 w-4" /> Aprovado
              </Button>
              <Button type="button" variant="outline" onClick={() => registrarParecer("APROVADO_PARCIAL")}>Aprovado parcial</Button>
              <Button type="button" variant="destructive" onClick={() => registrarParecer("REPROVADO")}>
                <XCircle className="h-4 w-4" /> Reprovado
              </Button>
            </div>
          </SecaoCard>

          <SecaoCard titulo="Pareceres emitidos">
            {analises.length === 0 ? (
              <EmptyState message="Nenhum parecer registrado ainda." />
            ) : (
              <ol className="space-y-3">
                {analises.map((a) => (
                  <li key={a.ID_ANALISE} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{a.RESULTADO}</span>
                      <span className="text-xs text-slate-500">{a.USUARIO_ANALISE} · {fDataHora(a.DATA_ANALISE)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">{a.PARECER}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ITENS_CHECKLIST.map(([chave, rotulo]) => {
                        const ok = (a as Record<string, unknown>)[chave] === "S"
                        return (
                          <span
                            key={chave}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                              ok ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {rotulo}
                          </span>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {a.QTD_POSTES_APROVADOS} postes aprovados · {a.QTD_POSTES_REPROVADOS} reprovados
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SecaoCard>
        </div>
        )}

        {/* Vínculo & Histórico */}
        {aba === "vinculo" && (
        <div className="space-y-5 pt-5">
          <SecaoCard
            titulo="Vínculo com a jornada do provedor"
            descricao="Resolução da chave de conexão (CNPJ) contra o cadastro de provedores e processos."
          >
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                <Link2 className="h-4 w-4 text-slate-500" />
              </span>
              <div>
                <p className="font-mono text-sm font-semibold text-slate-800">{vinculo.CHAVE_CONEXAO}</p>
                <p className="text-xs">
                  {vinculo.RESOLVIDO ? (
                    <span className="text-green-700">Vínculo resolvido e gravado</span>
                  ) : vinculo.provedor ? (
                    <span className="text-amber-700">Casa por CNPJ — falta gravar o vínculo</span>
                  ) : (
                    <span className="text-red-700">Provedor ainda não cadastrado no portal</span>
                  )}
                </p>
              </div>
            </div>
            <DefGrid>
              <Def label="Provedor">
                {vinculo.provedor ? (
                  <Link href={`/comercial/provedores/${vinculo.provedor.ID_PROVEDOR}`} className="text-primary hover:underline">
                    {vinculo.provedor.NOME_FANTASIA || vinculo.provedor.RAZAO_SOCIAL}
                  </Link>
                ) : null}
              </Def>
              <Def label="Processo / protocolo">
                {vinculo.processo ? (
                  <Link href={`/comercial/processos/${vinculo.processo.ID_PROCESSO}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    {vinculo.processo.NUMERO_PROTOCOLO} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  "Sem processo vinculado"
                )}
              </Def>
              <Def label="Status do processo">{vinculo.processo?.STATUS_ATUAL}</Def>
            </DefGrid>
          </SecaoCard>

          <SecaoCard titulo="Histórico" descricao="Trilha de auditoria do projeto.">
            {historico.length === 0 ? (
              <EmptyState message="Sem eventos registrados." />
            ) : (
              <ol className="space-y-4">
                {historico.map((h, i) => (
                  <li key={h.ID_HISTORICO} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary bg-white" />
                      {i < historico.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm text-slate-800">
                        <strong>{h.TIPO_EVENTO}</strong>
                        {h.STATUS_ANTERIOR && h.STATUS_NOVO ? (
                          <span className="text-slate-500"> · {h.STATUS_ANTERIOR} → {h.STATUS_NOVO}</span>
                        ) : null}
                      </p>
                      {h.DESCRICAO && <p className="mt-0.5 text-xs text-slate-600">{h.DESCRICAO}</p>}
                      <p className="mt-0.5 text-[11px] text-slate-400">{h.USUARIO} · {fDataHora(h.DATA_EVENTO)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SecaoCard>
        </div>
        )}
      </div>
    </div>
  )
}
