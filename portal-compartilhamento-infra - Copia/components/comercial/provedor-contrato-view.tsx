"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  RefreshCcw,
  Send,
  Plus,
  Clock,
  MessageSquare,
  History,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Eye,
  ExternalLink,
  FileSignature,
  Wrench,
  HandCoins,
  Briefcase,
  HardHat,
  MapPin,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner";
import { PromptModal } from "@/components/ui/prompt-modal";
import { AbasEnterprise, SecaoCard, DefGrid, Def, EstatItem } from "@/components/projetos/projeto-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  SolicitarAcaoModal,
  type SolicitarAcaoValues,
} from "@/components/comercial/solicitar-acao-modal";
import {
  CATALOGO_TIPOS_ACAO,
  LABEL_TIME,
  LABEL_STATUS_SOLICITACAO,
  type ProvedorContrato,
  type EntradaResumoContrato,
  type ProcessoResumoContrato,
  type EventoTimelineContrato,
  type SolicitacaoAcao,
  type ContratacaoProvedor,
} from "@/lib/types/contratos";

type Aba = "cadastro" | "processos" | "contrato" | "acoes" | "timeline";

type Props = {
  id: string;
  origem: "provedores" | "contratos";
  abaInicial?: Aba;
};

function valor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function formatarData(v?: string | null): string {
  if (!v) return "-";
  const data = new Date(v);
  if (Number.isNaN(data.getTime())) return String(v);
  return data.toLocaleString("pt-BR");
}

function formatarDataCurta(v?: string | null): string {
  if (!v) return "-";
  const data = new Date(v);
  if (Number.isNaN(data.getTime())) return String(v);
  return data.toLocaleDateString("pt-BR");
}

function statusProcessoClass(status?: string | null): string {
  const s = String(status ?? "").trim().toUpperCase();
  if (["CONCLUIDO", "CONCLUÍDO", "FINALIZADO"].includes(s)) {
    return "bg-green-100 text-green-700 border border-green-200";
  }
  if (["CANCELADO"].includes(s)) {
    return "bg-red-100 text-red-700 border border-red-200";
  }
  return "bg-blue-100 text-blue-700 border border-blue-200";
}

function statusSolicitacaoClass(status: string): string {
  if (status === "CONCLUIDA") return "bg-green-100 text-green-700 border border-green-200";
  if (status === "CANCELADA") return "bg-red-100 text-red-700 border border-red-200";
  if (status === "EM_ANDAMENTO") return "bg-blue-100 text-blue-700 border border-blue-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function prioridadeClass(prioridade?: string | null): string {
  const p = String(prioridade ?? "").toUpperCase();
  if (p === "ALTA") return "bg-red-100 text-red-700 border border-red-200";
  if (p === "BAIXA") return "bg-slate-100 text-slate-600 border border-slate-200";
  return "bg-amber-100 text-amber-700 border border-amber-200";
}

function iconePorTipo(tipo: EventoTimelineContrato["tipo"]) {
  if (tipo === "CONTATO") return MessageSquare;
  if (tipo === "ENTRADA") return History;
  return Clock;
}

function iconePorTime(time: string) {
  if (time === "NEGOCIACAO") return HandCoins;
  if (time === "COMERCIAL") return Briefcase;
  return Wrench;
}

export function ProvedorContratoView({ id, origem, abaInicial = "cadastro" }: Props) {
  const router = useRouter();

  const [aba, setAba] = useState<Aba>(abaInicial);
  const [provedor, setProvedor] = useState<ProvedorContrato | null>(null);
  const [entrada, setEntrada] = useState<EntradaResumoContrato | null>(null);
  const [processos, setProcessos] = useState<ProcessoResumoContrato[]>([]);
  const [timeline, setTimeline] = useState<EventoTimelineContrato[]>([]);
  const [acoes, setAcoes] = useState<SolicitacaoAcao[]>([]);
  const [contratos, setContratos] = useState<ContratacaoProvedor[]>([]);
  // Execução de campo por Ação do Mapa (indexada por ID_ACAO) - liga a
  // solicitação de Remoção do contrato ao que já foi feito em campo.
  const [execucaoPorAcao, setExecucaoPorAcao] = useState<
    Record<number, { registros: number; postes_executados: number; ultima_execucao: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [criandoProcesso, setCriandoProcesso] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [modalSolicitarAberto, setModalSolicitarAberto] = useState(false);
  const [acaoEmEdicao, setAcaoEmEdicao] = useState<{ acao: SolicitacaoAcao; status: "CONCLUIDA" | "CANCELADA" } | null>(null);
  const [acaoDetalhe, setAcaoDetalhe] = useState<SolicitacaoAcao | null>(null);

  const carregarDados = useCallback(async () => {
    if (!id) return;

    try {
      setRefreshing(true);
      setNotification(null);

      const [perfilRes, timelineRes, acoesRes, contratosRes, execucaoRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/provedores/${id}`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/provedores/${id}/timeline`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/provedores/${id}/acoes`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/provedores/${id}/contratos`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/execucao/acoes-resumo`, { cache: "no-store" }),
      ]);

      if (!perfilRes.ok) throw new Error((await perfilRes.text()) || "Erro ao carregar o provedor.");

      const perfil = await perfilRes.json();
      setProvedor(perfil.provedor ?? null);
      setEntrada(perfil.entrada ?? null);
      setProcessos(Array.isArray(perfil.processos) ? perfil.processos : []);

      const timelineData = timelineRes.ok ? await timelineRes.json() : [];
      const acoesData = acoesRes.ok ? await acoesRes.json() : [];
      const contratosData = contratosRes.ok ? await contratosRes.json() : [];
      const execucaoData = execucaoRes.ok ? await execucaoRes.json() : [];
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
      setAcoes(Array.isArray(acoesData) ? acoesData : []);
      setContratos(Array.isArray(contratosData) ? contratosData : []);
      const mapaExecucao: Record<number, { registros: number; postes_executados: number; ultima_execucao: string | null }> = {};
      for (const item of Array.isArray(execucaoData) ? execucaoData : []) {
        mapaExecucao[item.ID_ACAO] = {
          registros: item.registros,
          postes_executados: item.postes_executados,
          ultima_execucao: item.ultima_execucao,
        };
      }
      setExecucaoPorAcao(mapaExecucao);
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível carregar os dados.",
      });
      setProvedor(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    // Carga inicial: dispara o fetch assim que o id muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarDados();
  }, [carregarDados]);

  async function criarNovoProcesso() {
    try {
      setCriandoProcesso(true);
      setNotification(null);

      const response = await fetch(`${API_BASE_URL}/api/provedores/${id}/processos`, { method: "POST" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setNotification({ type: "error", message: data?.detail || "Não foi possível criar um novo processo." });
        return;
      }

      setNotification({ type: "success", message: data?.mensagem || "Novo processo criado com sucesso." });
      await carregarDados();
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao criar novo processo.",
      });
    } finally {
      setCriandoProcesso(false);
    }
  }

  async function solicitarAcao(valoresFormulario: SolicitarAcaoValues) {
    const response = await fetch(`${API_BASE_URL}/api/provedores/${id}/acoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_acao: valoresFormulario.tipo_acao,
        time_responsavel: valoresFormulario.time_responsavel,
        prioridade: valoresFormulario.prioridade,
        descricao: valoresFormulario.descricao,
        barramentos: valoresFormulario.barramentos,
      }),
    });

    const dados = await response.json().catch(() => null);
    if (!response.ok) throw new Error(dados?.detail || "Erro ao registrar a solicitação.");

    setNotification({ type: "success", message: dados?.mensagem || "Solicitação registrada com sucesso." });
    await carregarDados();
  }

  async function atualizarStatusAcao(acao: SolicitacaoAcao, status: SolicitacaoAcao["STATUS"], observacao?: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/provedores/${id}/acoes/${acao.ID_SOLICITACAO}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, observacao_conclusao: observacao }),
      });

      const dados = await response.json().catch(() => null);
      if (!response.ok) throw new Error(dados?.detail || "Erro ao atualizar a solicitação.");

      setNotification({ type: "success", message: "Solicitação atualizada." });
      await carregarDados();
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao atualizar a solicitação.",
      });
    }
  }

  const tituloFallback = origem === "contratos" ? "Gestão do Contrato" : "Perfil do Provedor";
  const breadcrumbs =
    origem === "contratos"
      ? [
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Contratos", href: "/comercial/contratos" },
          { label: provedor?.RAZAO_SOCIAL || tituloFallback },
        ]
      : [
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: provedor?.RAZAO_SOCIAL || tituloFallback },
        ];

  const temCompartilhamentoAtivo = processos.some(
    (p) => String(p.STATUS_ATUAL ?? "").toUpperCase() === "CONCLUIDO",
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader
        title={provedor?.RAZAO_SOCIAL || tituloFallback}
        description={provedor?.CNPJ ? `CNPJ ${provedor.CNPJ}` : undefined}
        breadcrumbs={breadcrumbs}
      />

      <NotificationBanner notification={notification} />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : !provedor ? (
        <EmptyState message="Provedor não encontrado." className="rounded-xl border border-slate-200 bg-slate-50 p-8" />
      ) : (
        <>
          {/* Cartão-resumo do provedor */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-slate-900">{valor(provedor.RAZAO_SOCIAL)}</h1>
                  <span className="inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    {valor(provedor.STATUS_CADASTRO)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-mono">{valor(provedor.CNPJ)}</span>
                  {provedor.NOME_FANTASIA ? ` · ${provedor.NOME_FANTASIA}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={carregarDados} disabled={refreshing}>
                  <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
                <Button type="button" size="sm" onClick={() => setModalSolicitarAberto(true)} disabled={!provedor}>
                  <Send className="h-4 w-4" />
                  Solicitar Ação
                </Button>
              </div>
            </div>

            <dl className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
              <EstatItem label="Processos" valor={processos.length} />
              <EstatItem label="Contratos / PNs" valor={contratos.length} />
              <EstatItem label="Ações" valor={acoes.length} />
              <EstatItem
                label="Última assinatura"
                valor={contratos.length > 0 ? formatarDataCurta(contratos[0].DATA_ASSINATURA) : "—"}
              />
              <EstatItem
                label="Compartilhamento"
                valor={temCompartilhamentoAtivo ? "Ativo" : "Em regularização"}
                tom={temCompartilhamentoAtivo ? "green" : "amber"}
              />
            </dl>

            {/* Abas ancoradas ao rodapé do cartão-resumo */}
            <div className="px-3">
              <AbasEnterprise
                abas={[
                  { valor: "cadastro", rotulo: "Cadastro" },
                  { valor: "processos", rotulo: "Processos", contador: processos.length },
                  { valor: "contrato", rotulo: "Contrato", contador: contratos.length },
                  { valor: "acoes", rotulo: "Ações", contador: acoes.length },
                  { valor: "timeline", rotulo: "Timeline", contador: timeline.length },
                ]}
                ativa={aba}
                onChange={(v) => setAba(v as Aba)}
              />
            </div>
          </section>

          {/* --- Cadastro --- */}
          {aba === "cadastro" && (
            <div className="space-y-5">
              <SecaoCard titulo="Identificação" descricao="Dados cadastrais do provedor">
                <DefGrid cols={3}>
                  <Def label="Razão Social">{valor(provedor.RAZAO_SOCIAL)}</Def>
                  <Def label="Nome Fantasia">{valor(provedor.NOME_FANTASIA)}</Def>
                  <Def label="CNPJ">
                    <span className="font-mono">{valor(provedor.CNPJ)}</span>
                  </Def>
                  <Def label="Responsável">{valor(provedor.RESPONSAVEL)}</Def>
                  <Def label="E-mail">{valor(provedor.EMAIL)}</Def>
                  <Def label="Telefone">{valor(provedor.TELEFONE)}</Def>
                  <Def label="Status do Cadastro">
                    <span className="inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                      {valor(provedor.STATUS_CADASTRO)}
                    </span>
                  </Def>
                </DefGrid>
              </SecaoCard>

              {entrada && (
                <SecaoCard titulo="Entrada original" descricao="Origem do provedor na Jornada de Entrantes">
                  <DefGrid cols={3}>
                    <Def label="Município">{valor(entrada.MUNICIPIO)}</Def>
                    <Def label="Recebido em">{formatarData(entrada.DATA_RECEBIMENTO)}</Def>
                  </DefGrid>
                </SecaoCard>
              )}
            </div>
          )}

          {/* --- Processos --- */}
          {aba === "processos" && (
            <SecaoCard
              titulo={`Processos (${processos.length})`}
              descricao="Processos/PNs abertos para este provedor"
              acao={
                <Button type="button" size="sm" onClick={criarNovoProcesso} disabled={criandoProcesso}>
                  <Plus className="h-4 w-4" />
                  {criandoProcesso ? "Criando..." : "Novo Processo/PN"}
                </Button>
              }
            >
                {processos.length === 0 ? (
                  <EmptyState message="Nenhum processo para este provedor ainda." />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <Table className="bg-white text-sm">
                      <TableHeader className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <TableRow>
                          <TableHead className="px-4 py-3">Protocolo</TableHead>
                          <TableHead className="px-4 py-3">Etapa Atual</TableHead>
                          <TableHead className="px-4 py-3">Status</TableHead>
                          <TableHead className="px-4 py-3">Abertura</TableHead>
                          <TableHead className="px-4 py-3">Conclusão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processos.map((processo) => (
                          <TableRow
                            key={processo.ID_PROCESSO}
                            className="cursor-pointer"
                            onClick={() => router.push(`/comercial/processos/${processo.ID_PROCESSO}`)}
                          >
                            <TableCell className="px-4 py-3 font-medium text-primary">{valor(processo.NUMERO_PROTOCOLO)}</TableCell>
                            <TableCell className="px-4 py-3">{valor(processo.NOME_ETAPA_ATUAL)}</TableCell>
                            <TableCell className="px-4 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusProcessoClass(processo.STATUS_ATUAL)}`}>
                                {valor(processo.STATUS_ATUAL)}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-3">{formatarData(processo.DT_ABERTURA)}</TableCell>
                            <TableCell className="px-4 py-3">{formatarData(processo.DT_CONCLUSAO)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </SecaoCard>
          )}

          {/* --- Contrato --- */}
          {aba === "contrato" && (
            <SecaoCard titulo="Contrato / PN" descricao="Contratos gerados na conclusão da etapa de Contratação">
              <DefGrid cols={3}>
                <Def label="Situação">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                      temCompartilhamentoAtivo
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {temCompartilhamentoAtivo ? "Compartilhamento ativo" : "Em regularização"}
                  </span>
                </Def>
                <Def label="Contratos / PNs">{contratos.length}</Def>
                <Def label="Última assinatura">
                  {contratos.length > 0 ? formatarDataCurta(contratos[0].DATA_ASSINATURA) : "—"}
                </Def>
              </DefGrid>

              <div className="mt-5">
                {contratos.length === 0 ? (
                  <EmptyState message="Nenhum contrato registrado. O contrato/PN é gerado quando um processo conclui a etapa de Contratação." />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <Table className="bg-white text-sm">
                      <TableHeader className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <TableRow>
                          <TableHead className="px-4 py-3">Nº Contrato</TableHead>
                          <TableHead className="px-4 py-3">PN</TableHead>
                          <TableHead className="px-4 py-3">Protocolo</TableHead>
                          <TableHead className="px-4 py-3">Município</TableHead>
                          <TableHead className="px-4 py-3">Assinatura</TableHead>
                          <TableHead className="px-4 py-3 text-right">Documento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contratos.map((contrato) => (
                          <TableRow key={contrato.ID_CONTRATACAO}>
                            <TableCell className="px-4 py-3 font-medium text-slate-800">
                              <span className="inline-flex items-center gap-1.5">
                                <FileSignature className="h-3.5 w-3.5 text-slate-400" />
                                {valor(contrato.NUMERO_CONTRATO)}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-3">{valor(contrato.NUMERO_PN)}</TableCell>
                            <TableCell
                              className="px-4 py-3 text-primary hover:underline"
                              role="button"
                              onClick={() => router.push(`/comercial/processos/${contrato.ID_PROCESSO}`)}
                            >
                              {valor(contrato.NUMERO_PROTOCOLO)}
                            </TableCell>
                            <TableCell className="px-4 py-3">{valor(contrato.MUNICIPIO)}</TableCell>
                            <TableCell className="px-4 py-3">{formatarDataCurta(contrato.DATA_ASSINATURA)}</TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              {contrato.URL_CONTRATO ? (
                                <a
                                  href={contrato.URL_CONTRATO}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Abrir
                                </a>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </SecaoCard>
          )}

          {/* --- Ações --- */}
          {aba === "acoes" && (
            <SecaoCard
              titulo={`Ações solicitadas (${acoes.length})`}
              descricao="Fiscalização, ordenamento e remoção pedidos para este provedor"
            >
                {acoes.length === 0 ? (
                  <EmptyState message="Nenhuma ação solicitada para este provedor ainda." />
                ) : (
                  <ol className="space-y-4">
                    {acoes.map((acao, index) => {
                      const Icone = iconePorTime(acao.TIME_RESPONSAVEL);
                      const execucao = acao.ID_ACAO_POSTE ? execucaoPorAcao[acao.ID_ACAO_POSTE] : undefined;
                      return (
                        <li key={acao.ID_SOLICITACAO} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Icone className="h-3.5 w-3.5" />
                            </span>
                            {index < acoes.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-800">
                                  {CATALOGO_TIPOS_ACAO[acao.TIPO_ACAO]?.label || acao.TIPO_ACAO}
                                </p>
                                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusSolicitacaoClass(acao.STATUS)}`}>
                                  {LABEL_STATUS_SOLICITACAO[acao.STATUS] || acao.STATUS}
                                </span>
                              </div>
                              <Button type="button" size="sm" variant="outline" onClick={() => setAcaoDetalhe(acao)}>
                                <Eye className="h-3.5 w-3.5" />
                                Ver detalhes
                              </Button>
                            </div>
                            <p className="text-xs text-slate-500">
                              Time {LABEL_TIME[acao.TIME_RESPONSAVEL] || acao.TIME_RESPONSAVEL} · {formatarData(acao.DATA_SOLICITACAO)}
                            </p>
                            {execucao && (
                              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                                <HardHat className="h-3.5 w-3.5 text-slate-400" />
                                <strong>{execucao.registros}</strong> registro(s) de campo ·{" "}
                                {execucao.postes_executados.toLocaleString("pt-BR")} postes ·{" "}
                                <button
                                  type="button"
                                  onClick={() => router.push("/mapa-postes/acoes")}
                                  className="font-medium text-primary hover:underline"
                                >
                                  Ação #{acao.ID_ACAO_POSTE}
                                </button>
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
            </SecaoCard>
          )}

          {/* --- Timeline --- */}
          {aba === "timeline" && (
            <SecaoCard titulo="Timeline" descricao="Histórico de eventos do provedor e dos processos">
                {timeline.length === 0 ? (
                  <EmptyState message="Nenhum evento registrado para este provedor ainda." />
                ) : (
                  <ol className="space-y-4">
                    {timeline.map((evento, index) => {
                      const Icone = iconePorTipo(evento.tipo);
                      const processo = processos.find((p) => p.ID_PROCESSO === evento.id_processo);
                      return (
                        <li key={index} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Icone className="h-3.5 w-3.5" />
                            </span>
                            {index < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                          </div>
                          <div className="pb-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800">{valor(evento.titulo)}</p>
                              {processo?.NUMERO_PROTOCOLO && (
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {processo.NUMERO_PROTOCOLO}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {formatarData(evento.data)}
                              {evento.usuario ? ` - ${evento.usuario}` : ""}
                            </p>
                            {evento.descricao && <p className="mt-1 text-xs text-slate-600">{evento.descricao}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
            </SecaoCard>
          )}
        </>
      )}

      <SolicitarAcaoModal
        open={modalSolicitarAberto}
        onOpenChange={setModalSolicitarAberto}
        idProvedor={id}
        onSalvar={solicitarAcao}
      />

      <Dialog open={acaoDetalhe !== null} onOpenChange={(open) => !open && setAcaoDetalhe(null)}>
        <DialogContent className="sm:max-w-lg">
          {acaoDetalhe && (
            <>
              <DialogHeader>
                <DialogTitle>{CATALOGO_TIPOS_ACAO[acaoDetalhe.TIPO_ACAO]?.label || acaoDetalhe.TIPO_ACAO}</DialogTitle>
                <DialogDescription>
                  Time {LABEL_TIME[acaoDetalhe.TIME_RESPONSAVEL] || acaoDetalhe.TIME_RESPONSAVEL} · Solicitado por {valor(acaoDetalhe.SOLICITADO_POR)} em {formatarData(acaoDetalhe.DATA_SOLICITACAO)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusSolicitacaoClass(acaoDetalhe.STATUS)}`}>
                    {LABEL_STATUS_SOLICITACAO[acaoDetalhe.STATUS] || acaoDetalhe.STATUS}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${prioridadeClass(acaoDetalhe.PRIORIDADE)}`}>
                    Prioridade {valor(acaoDetalhe.PRIORIDADE)}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descrição</p>
                  <p className="mt-1 text-sm text-slate-700">{valor(acaoDetalhe.DESCRICAO)}</p>
                </div>

                {acaoDetalhe.RESPONSAVEL_EXECUCAO && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Responsável pela execução</p>
                    <p className="mt-1 text-sm text-slate-700">{acaoDetalhe.RESPONSAVEL_EXECUCAO}</p>
                  </div>
                )}

                {acaoDetalhe.OBSERVACAO_CONCLUSAO && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Retorno do time</p>
                    <p className="mt-1 text-sm text-slate-700">{acaoDetalhe.OBSERVACAO_CONCLUSAO}</p>
                  </div>
                )}

                {acaoDetalhe.DATA_CONCLUSAO && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Encerrado em</p>
                    <p className="mt-1 text-sm text-slate-700">{formatarData(acaoDetalhe.DATA_CONCLUSAO)}</p>
                  </div>
                )}

                {acaoDetalhe.ID_ACAO_POSTE && (
                  <Button type="button" variant="outline" size="sm" onClick={() => router.push("/mapa-postes/acoes")}>
                    <MapPin className="h-3.5 w-3.5" />
                    Ver ação no Mapa de Postes
                  </Button>
                )}
              </div>

              {(acaoDetalhe.STATUS === "ABERTA" || acaoDetalhe.STATUS === "EM_ANDAMENTO") && (
                <DialogFooter>
                  {acaoDetalhe.STATUS === "ABERTA" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        atualizarStatusAcao(acaoDetalhe, "EM_ANDAMENTO");
                        setAcaoDetalhe(null);
                      }}
                    >
                      <PlayCircle className="h-4 w-4" />
                      Iniciar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAcaoEmEdicao({ acao: acaoDetalhe, status: "CONCLUIDA" });
                      setAcaoDetalhe(null);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Concluir
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      setAcaoEmEdicao({ acao: acaoDetalhe, status: "CANCELADA" });
                      setAcaoDetalhe(null);
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <PromptModal
        open={acaoEmEdicao !== null}
        title={acaoEmEdicao?.status === "CANCELADA" ? "Cancelar solicitação" : "Concluir solicitação"}
        label={acaoEmEdicao?.status === "CANCELADA" ? "Motivo do cancelamento" : "Retorno do time responsável"}
        confirmLabel={acaoEmEdicao?.status === "CANCELADA" ? "Cancelar solicitação" : "Concluir"}
        onCancel={() => setAcaoEmEdicao(null)}
        onConfirm={(texto) => {
          if (acaoEmEdicao) {
            atualizarStatusAcao(acaoEmEdicao.acao, acaoEmEdicao.status, texto);
          }
          setAcaoEmEdicao(null);
        }}
      />
    </div>
  );
}
