"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock,
  FileText,
  Loader2,
  RefreshCcw,
  UploadCloud,
  Copy,
  Check,
  ExternalLink,
  Eye,
  FolderOpen,
  X,
  Undo2,
  Ban,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptModal } from "@/components/ui/prompt-modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Notification = {
  type: "success" | "error" | "warning" | "info";
  message: string;
};

// Pasta compartilhada onde os documentos das etapas devem ser organizados -
// a pessoa cria a subpasta do processo aqui, sobe o arquivo e cola o link
// final no campo "Link SharePoint / Caminho do arquivo".
const LINK_PASTA_SHAREPOINT =
  "https://iberdrola.sharepoint.com/sites/CompartilhamentodePostes/Documentos%20Compartilhados/Forms/AllItems.aspx?id=%2Fsites%2FCompartilhamentodePostes%2FDocumentos%20Compartilhados%2FPortal%20Compartilhamento&viewid=95a48d22%2Dc8a2%2D493c%2D952f%2Df365fcdab0c3&newTargetListUrl=%2Fsites%2FCompartilhamentodePostes%2FDocumentos%20Compartilhados&viewpath=%2Fsites%2FCompartilhamentodePostes%2FDocumentos%20Compartilhados%2FForms%2FAllItems%2Easpx";

type ProcessoDetail = {
  ID_PROCESSO?: number | string | null;
  ID_PROVEDOR?: number | string | null;
  NUMERO_PROTOCOLO?: string | null;
  TIPO_PROCESSO?: string | null;
  STATUS_ATUAL?: string | null;
  ETAPA_ATUAL?: number | string | null;
  MUNICIPIO?: string | null;
  REGIONAL?: string | null;
  PRIORIDADE?: string | null;
  DT_ABERTURA?: string | null;
  DT_PREVISAO_CONCLUSAO?: string | null;
  DT_CONCLUSAO?: string | null;
  RAZAO_SOCIAL?: string | null;
  NOME_FANTASIA?: string | null;
  CNPJ?: string | null;
  RESPONSAVEL?: string | null;
  EMAIL?: string | null;
  TELEFONE?: string | null;
};

type EtapaFluxo = {
  ID_ETAPA: number;
  NOME_ETAPA: string;
  ORDEM_FLUXO: number;
  SLA_DIAS?: number | null;
  ETAPA_CRITICA?: string | null;
  OBRIGA_DOCUMENTO?: string | null;
};

type JornadaItem = {
  ID_JORNADA?: number | string | null;
  ID_PROCESSO?: number | string | null;
  ID_ETAPA?: number | string | null;
  NOME_ETAPA?: string | null;
  STATUS_ETAPA?: string | null;
  RESPONSAVEL_ATUAL?: string | null;
  RESPONSAVEL_ETAPA?: string | null;
  PRAZO_ETAPA?: string | null;
  AREA_RESPONSAVEL?: string | null;
  DATA_ENTRADA_ETAPA?: string | null;
  DATA_PREVISTA_CONCLUSAO?: string | null;
  DATA_CONCLUSAO_ETAPA?: string | null;
  SLA_DIAS?: number | null;
  DIAS_CONSUMIDOS?: number | null;
  DIAS_ATRASO?: number | null;
  OBSERVACAO?: string | null;
  MOTIVO_RETORNO?: string | null;
  COR_SLA?: string | null;
  FLAG_PENDENCIA?: string | null;
  FLAG_DOCUMENTO_PENDENTE?: string | null;
  FLAG_BLOQUEADO?: string | null;
};

type DocumentoRegistrado = {
  ID_DOCUMENTO?: number | string | null;
  ID_PROCESSO?: number | string | null;
  ID_ETAPA?: number | string | null;
  NOME_ETAPA?: string | null;
  TIPO_DOCUMENTO?: string | null;
  NOME_ARQUIVO?: string | null;
  TIPO_ARQUIVO?: string | null;
  CAMINHO_ARQUIVO?: string | null;
  TAMANHO_BYTES?: number | string | null;
  STATUS_DOCUMENTO?: string | null;
  OBSERVACAO?: string | null;
  DATA_UPLOAD?: string | null;
  USUARIO_UPLOAD?: string | null;
  ATIVO?: string | null;
};

type ContatoProcesso = {
  ID_CONTATO?: number | string | null;
  ID_PROCESSO?: number | string | null;
  DATA_CONTATO?: string | null;
  MEIO_CONTATO?: string | null;
  PESSOA_CONTATO?: string | null;
  OBSERVACAO?: string | null;
  RESULTADO?: string | null;
  USUARIO_REGISTRO?: string | null;
  DATA_REGISTRO?: string | null;
};

const MEIOS_CONTATO = [
  { value: "TELEFONE", label: "Telefone" },
  { value: "EMAIL", label: "E-mail" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PRESENCIAL", label: "Presencial" },
  { value: "OUTRO", label: "Outro" },
];

const RESULTADOS_CONTATO = [
  { value: "AGUARDANDO", label: "Aguardando resposta" },
  { value: "RESPONDIDO", label: "Respondeu" },
  { value: "SEM_RESPOSTA", label: "Não respondeu" },
];

function resultadoContatoClass(resultado?: string | null) {
  if (resultado === "RESPONDIDO") return "border-green-200 bg-green-50 text-green-700";
  if (resultado === "SEM_RESPOSTA") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function resultadoContatoLabel(resultado?: string | null) {
  return RESULTADOS_CONTATO.find((item) => item.value === resultado)?.label || "Aguardando resposta";
}

type DocumentoForm = {
  tipo_documento: string;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho_arquivo: string;
  observacao: string;
};

const TIPOS_DOCUMENTO_OBRIGATORIOS = [
  { codigo: "CARTAO_CNPJ", label: "Cartão CNPJ" },
  { codigo: "INSCRICAO_ESTADUAL", label: "Inscrição Estadual" },
  { codigo: "INSCRICAO_MUNICIPAL", label: "Inscrição Municipal" },
  { codigo: "CONTRATO_SOCIAL", label: "Contrato Social" },
  { codigo: "TERMO_OCUPACAO", label: "Registro de Rede Existente (Termo de Ocupação)" },
  { codigo: "RG_CPF", label: "RG e CPF" },
  { codigo: "DECLARACAO_ANATEL", label: "Declaração ANATEL" },
  { codigo: "FICHA_CADASTRAL", label: "Ficha Cadastral" },
] as const;


type ModalEtapa =
  | "ANALISE_CADASTRAL"
  | "DOCUMENTACAO"
  | "APROVACAO"
  | "CONTRATACAO"
  | "GENERICO"
  | null;

function valor(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function normalizar(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("Á", "A")
    .replaceAll("À", "A")
    .replaceAll("Â", "A")
    .replaceAll("Ã", "A")
    .replaceAll("É", "E")
    .replaceAll("Ê", "E")
    .replaceAll("Í", "I")
    .replaceAll("Ó", "O")
    .replaceAll("Ô", "O")
    .replaceAll("Õ", "O")
    .replaceAll("Ú", "U")
    .replaceAll("Ç", "C")
    .replaceAll(" ", "_");
}

function limparCnpj(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

function limparExtensao(value?: string | null): string {
  const extensao = String(value ?? "pdf")
    .trim()
    .toLowerCase()
    .replace(/^\./, "")
    .replace(/[^a-z0-9]/g, "");
  return extensao || "pdf";
}

function gerarNomeArquivoPadrao({
  cnpj,
  protocolo,
  tipoDocumento,
  tipoArquivo,
}: {
  cnpj?: string | null;
  protocolo?: string | null;
  tipoDocumento?: string | null;
  tipoArquivo?: string | null;
}): string {
  const cnpjLimpo = limparCnpj(cnpj);
  const protocoloLimpo = String(protocolo ?? "SEM_PROTOCOLO")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_-]/g, "");
  const tipoLimpo = String(tipoDocumento ?? "DOCUMENTO")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  const ext = limparExtensao(tipoArquivo);

  if (!cnpjLimpo) {
    return `${protocoloLimpo}_${tipoLimpo}.${ext}`;
  }

  return `${cnpjLimpo}_${protocoloLimpo}_${tipoLimpo}.${ext}`;
}

function classificarLinkSharePoint(value?: string | null): "PASTA" | "ARQUIVO" | "VAZIO" | "OUTRO" {
  const link = String(value ?? "").trim();
  if (!link) return "VAZIO";
  if (!link.includes("sharepoint.com")) return "OUTRO";
  if (link.includes(":f:/")) return "PASTA";
  if (link.includes(":b:/") || link.includes(":w:/") || link.includes(":x:/") || link.includes(":p:/") || link.includes(":t:/")) return "ARQUIVO";
  return "ARQUIVO";
}

function mensagemLinkSharePoint(value?: string | null): string {
  const tipo = classificarLinkSharePoint(value);
  if (tipo === "VAZIO") return "Cole aqui o link da pasta ou, preferencialmente, o link final do arquivo no SharePoint.";
  if (tipo === "PASTA") return "Link de pasta detectado. Use para abrir a pasta e fazer upload. Para melhor rastreabilidade, depois do upload copie o link do arquivo e substitua este campo.";
  if (tipo === "ARQUIVO") return "Link de arquivo detectado. Este é o formato preferencial para registrar a evidência documental no portal.";
  return "O link informado não parece ser do SharePoint. Confira se o endereço foi copiado corretamente.";
}

function formatarData(value?: string | null): string {
  if (!value) return "-";
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function statusBadgeClass(status?: string | null) {
  const s = normalizar(status);
  if (["CONCLUIDO", "FINALIZADO"].includes(s)) {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (["EM_ANDAMENTO", "ABERTO", "RECEBIDO"].includes(s)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (["ATRASADO", "BLOQUEADO", "PENDENTE"].includes(s)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["CANCELADO", "ERRO"].includes(s)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function CardInfo({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${
        highlight ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-xs font-medium uppercase tracking-wide ${
          highlight ? "text-green-700" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}


function getDocumentoLabel(codigo?: string | null): string {
  const tipo = TIPOS_DOCUMENTO_OBRIGATORIOS.find((item) => item.codigo === codigo);
  return tipo?.label || String(codigo ?? "Documento");
}

function DocumentoProgressCard({
  inseridos,
  total,
  percentual,
  onOpen,
}: {
  inseridos: number;
  total: number;
  percentual: number;
  onOpen: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Progresso documental
            </span>
            <span className="text-xs font-bold text-blue-700">{percentual}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, percentual))}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600">
            {inseridos} de {total} documentos cadastrados
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onOpen}
          className="border-blue-200 text-xs text-blue-700 hover:bg-blue-50"
        >
          <Eye className="h-4 w-4" />
          Ver Documentos
        </Button>
      </div>
    </div>
  );
}

function DocumentosStatusModal({
  documentos,
  total,
  inseridos,
  pendentes,
  percentual,
  onClose,
}: {
  documentos: DocumentoRegistrado[];
  total: number;
  inseridos: number;
  pendentes: number;
  percentual: number;
  onClose: () => void;
}) {
  const documentosInseridos = TIPOS_DOCUMENTO_OBRIGATORIOS.filter((tipo) =>
    documentos.some((doc) => doc.TIPO_DOCUMENTO === tipo.codigo)
  );

  const documentosPendentes = TIPOS_DOCUMENTO_OBRIGATORIOS.filter(
    (tipo) => !documentos.some((doc) => doc.TIPO_DOCUMENTO === tipo.codigo)
  );

  return (
    <ModalShell
      title="Status documental do processo"
      description="Acompanhe os documentos cadastrados e pendentes da etapa Documentação."
      onClose={onClose}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <CardInfo label="Obrigatórios" value={total} />
        <CardInfo label="Inseridos" value={inseridos} highlight />
        <CardInfo label="Pendentes" value={pendentes} />
        <CardInfo label="Progresso" value={`${percentual}%`} highlight />
      </div>

      <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, percentual))}%` }}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <h3 className="text-sm font-bold text-green-800">Documentos inseridos</h3>
          <div className="mt-3 space-y-2">
            {documentosInseridos.length === 0 ? (
              <div className="rounded-lg border border-green-100 bg-white p-3 text-sm text-slate-500">
                Nenhum documento inserido.
              </div>
            ) : (
              documentosInseridos.map((tipo) => {
                const doc = documentos.find((item) => item.TIPO_DOCUMENTO === tipo.codigo);
                return (
                  <div key={tipo.codigo} className="rounded-lg border border-green-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{tipo.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{valor(doc?.NOME_ARQUIVO)}</div>
                      </div>
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
                        INSERIDO
                      </span>
                    </div>
                    {doc?.CAMINHO_ARQUIVO && (
                      <a
                        href={String(doc.CAMINHO_ARQUIVO)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Abrir no SharePoint
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-800">Documentos pendentes</h3>
          <div className="mt-3 space-y-2">
            {documentosPendentes.length === 0 ? (
              <div className="rounded-lg border border-amber-100 bg-white p-3 text-sm text-green-700">
                Todos os documentos obrigatórios foram cadastrados.
              </div>
            ) : (
              documentosPendentes.map((tipo) => (
                <div key={tipo.codigo} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-white p-3">
                  <div className="text-sm font-medium text-slate-800">{tipo.label}</div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                    PENDENTE
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </ModalShell>
  );
}

export default function GestaoJornadaProcessoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [processo, setProcesso] = useState<ProcessoDetail | null>(null);
  const [etapas, setEtapas] = useState<EtapaFluxo[]>([]);
  const [jornada, setJornada] = useState<JornadaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRetornarModal, setShowRetornarModal] = useState(false);
  const [showCancelarModal, setShowCancelarModal] = useState(false);
  const [modalEtapa, setModalEtapa] = useState<ModalEtapa>(null);
  const [nomeCopiado, setNomeCopiado] = useState(false);
  const [documentos, setDocumentos] = useState<DocumentoRegistrado[]>([]);
  const [showDocumentosModal, setShowDocumentosModal] = useState(false);

  const [checklistAnalise, setChecklistAnalise] = useState({
    dadosConferidos: false,
    cnpjValidado: false,
    responsavelValidado: false,
    contatoConfirmado: false,
  });

  const [documentoForm, setDocumentoForm] = useState<DocumentoForm>({
    tipo_documento: "CARTAO_CNPJ",
    nome_arquivo: "",
    tipo_arquivo: "pdf",
    caminho_arquivo: "",
    observacao: "",
  });

  const [parecer, setParecer] = useState({ resultado: "APROVADO", observacao: "" });
  const [contratacao, setContratacao] = useState({ numeroPN: "", numeroContrato: "", dataAssinatura: "", urlContrato: "" });

  const [contatos, setContatos] = useState<ContatoProcesso[]>([]);
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [contatoForm, setContatoForm] = useState({
    dataContato: "",
    meioContato: "TELEFONE",
    pessoaContato: "",
    assuntoEmail: "",
    destinatarioEmail: "",
    observacao: "",
    resultado: "AGUARDANDO",
  });
  const [atualizandoResultadoId, setAtualizandoResultadoId] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    if (!id) return;

    try {
      setNotification(null);
      setRefreshing(true);

      const [processoRes, etapasRes, jornadaRes, documentosRes, contatosRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/processos/${id}`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/processos/etapas`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/processos/${id}/jornada`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/processos/${id}/documentos`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/processos/${id}/contatos`, { cache: "no-store" }),
      ]);

      if (!processoRes.ok) {
        const texto = await processoRes.text();
        throw new Error(texto || "Erro ao carregar processo.");
      }
      if (!etapasRes.ok) {
        const texto = await etapasRes.text();
        throw new Error(texto || "Erro ao carregar etapas do fluxo.");
      }
      if (!jornadaRes.ok) {
        const texto = await jornadaRes.text();
        throw new Error(texto || "Erro ao carregar jornada do processo.");
      }
      if (!documentosRes.ok) {
        const texto = await documentosRes.text();
        throw new Error(texto || "Erro ao carregar documentos do processo.");
      }
      if (!contatosRes.ok) {
        const texto = await contatosRes.text();
        throw new Error(texto || "Erro ao carregar contatos do processo.");
      }

      const processoData = await processoRes.json();
      const etapasData = await etapasRes.json();
      const jornadaData = await jornadaRes.json();
      const documentosData = await documentosRes.json();
      const contatosData = await contatosRes.json();

      setProcesso(processoData);
      setEtapas(Array.isArray(etapasData) ? etapasData : []);
      setJornada(Array.isArray(jornadaData) ? jornadaData : []);
      setDocumentos(Array.isArray(documentosData) ? documentosData : []);
      setContatos(Array.isArray(contatosData) ? contatosData : []);
    } catch (error) {
      console.error("Erro ao carregar gestão da jornada:", error);
      setNotification({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os dados da jornada.",
      });
      setProcesso(null);
      setEtapas([]);
      setJornada([]);
      setDocumentos([]);
      setContatos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    if (contatoForm.meioContato === "EMAIL" && !contatoForm.destinatarioEmail && processo?.EMAIL) {
      setContatoForm((prev) => ({ ...prev, destinatarioEmail: processo.EMAIL || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoForm.meioContato, processo?.EMAIL]);

  const etapaAtualId = useMemo(() => {
    const raw = processo?.ETAPA_ATUAL;
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }, [processo?.ETAPA_ATUAL]);

  const jornadaAtual = useMemo(() => {
    return jornada.find(
      (item) =>
        Number(item.ID_ETAPA) === etapaAtualId &&
        normalizar(item.STATUS_ETAPA) === "EM_ANDAMENTO"
    );
  }, [jornada, etapaAtualId]);

  const etapaAtual = useMemo(() => {
    return etapas.find((etapa) => Number(etapa.ID_ETAPA) === etapaAtualId) ?? null;
  }, [etapas, etapaAtualId]);

  const nomeEtapaAtualNormalizado = useMemo(() => {
    return normalizar(etapaAtual?.NOME_ETAPA || "");
  }, [etapaAtual?.NOME_ETAPA]);

  const nomeArquivoPadrao = useMemo(() => {
    return gerarNomeArquivoPadrao({
      cnpj: processo?.CNPJ,
      protocolo: processo?.NUMERO_PROTOCOLO,
      tipoDocumento: documentoForm.tipo_documento,
      tipoArquivo: documentoForm.tipo_arquivo,
    });
  }, [processo?.CNPJ, processo?.NUMERO_PROTOCOLO, documentoForm.tipo_documento, documentoForm.tipo_arquivo]);

  useEffect(() => {
    if (modalEtapa === "DOCUMENTACAO") {
      setDocumentoForm((prev) => ({
        ...prev,
        nome_arquivo: nomeArquivoPadrao,
      }));
    }
  }, [modalEtapa, nomeArquivoPadrao]);

  const documentosInseridosPorTipo = useMemo(() => {
    const tipos = new Set<string>();
    documentos.forEach((doc) => {
      if (doc.TIPO_DOCUMENTO) tipos.add(String(doc.TIPO_DOCUMENTO));
    });
    return tipos;
  }, [documentos]);

  const totalDocumentosObrigatorios = TIPOS_DOCUMENTO_OBRIGATORIOS.length;
  const totalDocumentosInseridos = documentosInseridosPorTipo.size;
  const totalDocumentosPendentes = Math.max(0, totalDocumentosObrigatorios - totalDocumentosInseridos);
  const percentualDocumentacao = totalDocumentosObrigatorios > 0
    ? Math.round((totalDocumentosInseridos / totalDocumentosObrigatorios) * 100)
    : 0;

  const processoEncerrado = useMemo(() => {
    const status = normalizar(processo?.STATUS_ATUAL);
    return ["CONCLUIDO", "FINALIZADO", "CANCELADO"].includes(status);
  }, [processo?.STATUS_ATUAL]);

  const podeConcluirEtapa = Boolean(processo && etapaAtual && !processoEncerrado && jornadaAtual);

  function abrirModalDaEtapaAtual() {
    if (!etapaAtual) {
      setNotification({ type: "warning", message: "Não existe etapa atual definida para este processo." });
      return;
    }

    switch (nomeEtapaAtualNormalizado) {
      case "ANALISE_CADASTRAL":
        setModalEtapa("ANALISE_CADASTRAL");
        break;
      case "DOCUMENTACAO":
        setModalEtapa("DOCUMENTACAO");
        break;
      case "APROVACAO":
        setModalEtapa("APROVACAO");
        break;
      case "CONTRATACAO":
        setModalEtapa("CONTRATACAO");
        break;
      default:
        setModalEtapa("GENERICO");
        break;
    }
  }

  async function copiarNomeArquivo() {
    try {
      await navigator.clipboard.writeText(nomeArquivoPadrao);
      setNomeCopiado(true);
      setNotification({
        type: "success",
        message: "Nome padronizado copiado. Use este nome para renomear o arquivo antes de enviar ao SharePoint.",
      });
      window.setTimeout(() => setNomeCopiado(false), 2000);
    } catch (error) {
      console.error("Erro ao copiar nome do arquivo:", error);
      setNotification({
        type: "error",
        message: "Não foi possível copiar o nome automaticamente. Selecione o texto e copie manualmente.",
      });
    }
  }

  function abrirLinkSharePoint() {
    const link = documentoForm.caminho_arquivo?.trim();
    if (!link) {
      setNotification({ type: "warning", message: "Informe o link do SharePoint antes de abrir." });
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function abrirPastaSharePoint() {
    window.open(LINK_PASTA_SHAREPOINT, "_blank", "noopener,noreferrer");
  }

  async function salvarAnaliseCadastral() {
    const completo = Object.values(checklistAnalise).every(Boolean);
    if (!completo) {
      setNotification({
        type: "warning",
        message: "Marque todos os itens do checklist para registrar a análise cadastral.",
      });
      return;
    }

    if (!etapaAtualId) {
      setNotification({ type: "error", message: "Etapa atual inválida para registro da análise cadastral." });
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/analise-cadastral`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_etapa: etapaAtualId,
          dados_conferidos: checklistAnalise.dadosConferidos,
          cnpj_validado: checklistAnalise.cnpjValidado,
          responsavel_validado: checklistAnalise.responsavelValidado,
          contato_confirmado: checklistAnalise.contatoConfirmado,
        }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível registrar a análise cadastral.",
        });
        return;
      }

      setNotification({ type: "success", message: "Análise cadastral registrada com sucesso." });
      setModalEtapa(null);
      await carregarDados();
    } catch (error) {
      console.error("Erro ao registrar análise cadastral:", error);
      setNotification({ type: "error", message: "Erro inesperado ao registrar a análise cadastral." });
    } finally {
      setActionLoading(false);
    }
  }

  async function salvarDocumento() {
    const nomeArquivoFinal = nomeArquivoPadrao || documentoForm.nome_arquivo;

    if (!nomeArquivoFinal || !documentoForm.caminho_arquivo) {
      setNotification({
        type: "warning",
        message: "Informe o link/caminho do SharePoint. O nome do arquivo é gerado automaticamente.",
      });
      return;
    }

    if (!etapaAtualId) {
      setNotification({ type: "error", message: "Etapa atual inválida para registro do documento." });
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/documentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_etapa: etapaAtualId,
          tipo_documento: documentoForm.tipo_documento,
          nome_arquivo: nomeArquivoFinal,
          tipo_arquivo: documentoForm.tipo_arquivo,
          caminho_arquivo: documentoForm.caminho_arquivo,
          observacao: documentoForm.observacao,
        }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível registrar o documento.",
        });
        return;
      }

      setNotification({ type: "success", message: "Documento registrado com sucesso." });
      setDocumentoForm({
        tipo_documento: "CARTAO_CNPJ",
        nome_arquivo: "",
        tipo_arquivo: "pdf",
        caminho_arquivo: "",
        observacao: "",
      });
      setModalEtapa(null);
      await carregarDados();
    } catch (error) {
      console.error("Erro ao registrar documento:", error);
      setNotification({ type: "error", message: "Erro inesperado ao registrar documento." });
    } finally {
      setActionLoading(false);
    }
  }

  async function salvarParecer() {
    if (!parecer.observacao.trim()) {
      setNotification({ type: "warning", message: "Informe um parecer antes de salvar a aprovação." });
      return;
    }

    if (!etapaAtualId) {
      setNotification({ type: "error", message: "Etapa atual inválida para registro do parecer." });
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/parecer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_etapa: etapaAtualId,
          resultado: parecer.resultado,
          observacao: parecer.observacao,
        }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível registrar o parecer.",
        });
        return;
      }

      setNotification({ type: "success", message: "Parecer registrado com sucesso." });
      setModalEtapa(null);
      await carregarDados();
    } catch (error) {
      console.error("Erro ao registrar parecer:", error);
      setNotification({ type: "error", message: "Erro inesperado ao registrar o parecer." });
    } finally {
      setActionLoading(false);
    }
  }

  async function salvarContratacao() {
    if (!contratacao.numeroPN || !contratacao.numeroContrato || !contratacao.urlContrato) {
      setNotification({ type: "warning", message: "Informe o número do PN, número do contrato e o link do contrato no SharePoint." });
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/contratacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_pn: contratacao.numeroPN,
          numero_contrato: contratacao.numeroContrato,
          data_assinatura: contratacao.dataAssinatura || null,
          url_contrato: contratacao.urlContrato,
        }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível registrar os dados de contratação.",
        });
        return;
      }

      setNotification({ type: "success", message: "Dados de contratação registrados com sucesso." });
      setModalEtapa(null);
      await carregarDados();
    } catch (error) {
      console.error("Erro ao registrar contratação:", error);
      setNotification({ type: "error", message: "Erro inesperado ao registrar os dados de contratação." });
    } finally {
      setActionLoading(false);
    }
  }

  async function salvarContato() {
    if (!contatoForm.dataContato || !contatoForm.observacao.trim()) {
      setNotification({ type: "warning", message: "Informe a data do contato e a observação." });
      return;
    }

    try {
      setSalvandoContato(true);
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/contatos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_contato: contatoForm.dataContato,
          meio_contato: contatoForm.meioContato || null,
          pessoa_contato: contatoForm.pessoaContato || null,
          observacao: contatoForm.observacao,
          resultado: contatoForm.resultado || null,
        }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível registrar o contato.",
        });
        return;
      }

      setNotification({ type: "success", message: "Contato registrado com sucesso." });
      setContatoForm({ dataContato: "", meioContato: "TELEFONE", pessoaContato: "", assuntoEmail: "", destinatarioEmail: "", observacao: "", resultado: "AGUARDANDO" });
      await carregarDados();
    } catch (error) {
      console.error("Erro ao registrar contato:", error);
      setNotification({ type: "error", message: "Erro inesperado ao registrar o contato." });
    } finally {
      setSalvandoContato(false);
    }
  }

  async function enviarEmailERegistrar() {
    if (!contatoForm.destinatarioEmail.trim() || !contatoForm.assuntoEmail.trim() || !contatoForm.observacao.trim()) {
      setNotification({ type: "warning", message: "Informe o destinatário, o assunto e o corpo do e-mail." });
      return;
    }

    try {
      setSalvandoContato(true);
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/contatos/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para: contatoForm.destinatarioEmail,
          assunto: contatoForm.assuntoEmail,
          corpo: contatoForm.observacao,
          pessoa_contato: contatoForm.pessoaContato || null,
        }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível enviar o e-mail.",
        });
        return;
      }

      const data = await response.json().catch(() => null);

      setNotification({
        type: "success",
        message: data?.mensagem || "E-mail enviado e contato registrado.",
      });
      setContatoForm({ dataContato: "", meioContato: "TELEFONE", pessoaContato: "", assuntoEmail: "", destinatarioEmail: "", observacao: "", resultado: "AGUARDANDO" });
      await carregarDados();
    } catch (error) {
      console.error("Erro ao enviar e-mail:", error);
      setNotification({ type: "error", message: "Erro inesperado ao enviar o e-mail." });
    } finally {
      setSalvandoContato(false);
    }
  }

  async function atualizarResultadoContato(idContato: number | string | null | undefined, resultado: string) {
    if (idContato === null || idContato === undefined) return;

    try {
      setAtualizandoResultadoId(String(idContato));
      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/contatos/${idContato}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultado }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({ type: "error", message: erro?.detail || "Não foi possível atualizar o resultado do contato." });
        return;
      }

      await carregarDados();
    } catch (error) {
      console.error("Erro ao atualizar resultado do contato:", error);
      setNotification({ type: "error", message: "Erro inesperado ao atualizar o resultado do contato." });
    } finally {
      setAtualizandoResultadoId(null);
    }
  }

  async function handleConcluirEtapa() {
    if (!processo || !podeConcluirEtapa) return;

    try {
      setActionLoading(true);
      setNotification(null);
      setShowConfirmModal(false);

      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/avancar-etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível concluir a etapa atual.",
        });
        return;
      }

      const data = await response.json().catch(() => null);

      setNotification({
        type: "success",
        message:
          data?.mensagem ||
          "Etapa concluída com sucesso. A jornada do processo foi atualizada.",
      });

      await carregarDados();
    } catch (error) {
      console.error("Erro ao concluir etapa:", error);
      setNotification({ type: "error", message: "Erro inesperado ao concluir a etapa atual." });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRetornarEtapa(motivo: string) {
    if (!processo || !podeConcluirEtapa) return;

    try {
      setActionLoading(true);
      setNotification(null);
      setShowRetornarModal(false);

      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/retornar-etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível retornar a etapa atual.",
        });
        return;
      }

      const data = await response.json().catch(() => null);

      setNotification({
        type: "success",
        message: data?.mensagem || "Processo devolvido para a etapa anterior.",
      });

      await carregarDados();
    } catch (error) {
      console.error("Erro ao retornar etapa:", error);
      setNotification({ type: "error", message: "Erro inesperado ao retornar a etapa atual." });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelarProcesso(motivo: string) {
    if (!processo || processoEncerrado) return;

    try {
      setActionLoading(true);
      setNotification(null);
      setShowCancelarModal(false);

      const response = await fetch(`${API_BASE_URL}/api/processos/${id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível cancelar o processo.",
        });
        return;
      }

      const data = await response.json().catch(() => null);

      setNotification({
        type: "success",
        message: data?.mensagem || "Processo cancelado.",
      });

      await carregarDados();
    } catch (error) {
      console.error("Erro ao cancelar processo:", error);
      setNotification({ type: "error", message: "Erro inesperado ao cancelar o processo." });
    } finally {
      setActionLoading(false);
    }
  }

  function handleVoltar() {
    router.back();
  }

  function statusEtapaLinha(etapa: EtapaFluxo) {
    const historicos = jornada.filter((item) => Number(item.ID_ETAPA) === etapa.ID_ETAPA);
    const itemAndamento = historicos.find((item) => normalizar(item.STATUS_ETAPA) === "EM_ANDAMENTO");
    const itemConcluido = historicos.find((item) => ["CONCLUIDO"].includes(normalizar(item.STATUS_ETAPA)));
    if (itemConcluido) return "CONCLUIDO";
    if (itemAndamento) return "EM_ANDAMENTO";
    return "PENDENTE";
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Carregando gestão da jornada...
        </div>
      </main>
    );
  }

  if (!processo) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <PageHeader
            title="Gestão da Jornada"
            description="Não foi possível localizar o processo informado."
            breadcrumbs={[
              { label: "Comercial", href: "/comercial" },
              { label: "Processos", href: "/comercial/processos" },
              { label: "Gestão da Jornada" },
            ]}
          />

          {notification && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
              {notification.message}
            </div>
          )}

          <Button type="button" variant="outline" onClick={handleVoltar}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 pb-28">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title={`Gestão da Jornada - Processo ${valor(processo.ID_PROCESSO)}`}
          description="Acompanhe a etapa atual, histórico da jornada e evolução operacional do processo."
          breadcrumbs={[
            { label: "Comercial", href: "/comercial" },
            { label: "Processos", href: "/comercial/processos" },
            { label: `Processo ${valor(processo.ID_PROCESSO)}` },
          ]}
        />

        {notification && (
          <div
            className={`rounded-xl border p-4 text-sm font-medium shadow-sm ${
              notification.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : notification.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : notification.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {notification.message}
          </div>
        )}

        <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-white to-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Processo de Compartilhamento
              </div>
              <h1 className="mt-4 text-2xl font-bold text-primary">
                Protocolo {valor(processo.NUMERO_PROTOCOLO)}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {valor(processo.RAZAO_SOCIAL || processo.NOME_FANTASIA)} • CNPJ {valor(processo.CNPJ)}
              </p>
              {processo.ID_PROVEDOR && (
                <button
                  type="button"
                  onClick={() => router.push(`/comercial/provedores/${processo.ID_PROVEDOR}`)}
                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                >
                  Ver perfil do provedor
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-4 py-2 text-xs font-semibold ${statusBadgeClass(processo.STATUS_ATUAL)}`}>
                {valor(processo.STATUS_ATUAL)}
              </span>
              <span className="rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold text-primary">
                Etapa atual: {valor(etapaAtual?.NOME_ETAPA || processo.ETAPA_ATUAL)}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <CardInfo label="ID Processo" value={valor(processo.ID_PROCESSO)} />
            <CardInfo label="Tipo" value={valor(processo.TIPO_PROCESSO)} />
            <CardInfo label="Município" value={valor(processo.MUNICIPIO)} />
            <CardInfo label="Data de Abertura" value={formatarData(processo.DT_ABERTURA)} highlight />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <CardInfo
            label="SLA da etapa atual"
            value={etapaAtual?.SLA_DIAS !== undefined && etapaAtual?.SLA_DIAS !== null ? `${etapaAtual.SLA_DIAS} dias` : "-"}
            highlight
          />
          <CardInfo
            label="Dias consumidos"
            value={jornadaAtual?.DIAS_CONSUMIDOS !== undefined && jornadaAtual?.DIAS_CONSUMIDOS !== null ? `${jornadaAtual.DIAS_CONSUMIDOS} dias` : "-"}
          />
          <CardInfo
            label="Dias em atraso"
            value={jornadaAtual?.DIAS_ATRASO !== undefined && jornadaAtual?.DIAS_ATRASO !== null ? `${jornadaAtual.DIAS_ATRASO} dias` : "-"}
          />
        </section>

        <SectionCard
          title="Jornada do Processo"
          description="Visualização executiva do fluxo por etapa, status e histórico de movimentação."
        >
          {etapas.length === 0 ? (
            <EmptyState
              message="Nenhuma etapa cadastrada para este fluxo."
              className="rounded-xl border border-slate-200 bg-slate-50 p-6"
            />
          ) : (
            <div className="relative space-y-4">
              {etapas
                .slice()
                .sort((a, b) => Number(a.ORDEM_FLUXO) - Number(b.ORDEM_FLUXO))
                .map((etapa, index) => {
                  const statusLinha = statusEtapaLinha(etapa);
                  const isAtual = statusLinha === "EM_ANDAMENTO";
                  const isConcluida = statusLinha === "CONCLUIDO";
                  const Icon = isConcluida ? CheckCircle2 : isAtual ? Clock : Circle;

                  return (
                    <div key={etapa.ID_ETAPA} className="relative flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                            isConcluida
                              ? "border-green-600 bg-green-600 text-white"
                              : isAtual
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-slate-300 bg-white text-slate-400"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {index < etapas.length - 1 && <div className="mt-2 h-10 w-px bg-slate-200" />}
                      </div>

                      <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              {etapa.ORDEM_FLUXO}. {etapa.NOME_ETAPA}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              SLA: {etapa.SLA_DIAS ?? "-"} dias • Documento obrigatório: {valor(etapa.OBRIGA_DOCUMENTO)}
                            </div>
                            {normalizar(etapa.NOME_ETAPA) === "DOCUMENTACAO" && (
                              <DocumentoProgressCard
                                inseridos={totalDocumentosInseridos}
                                total={totalDocumentosObrigatorios}
                                percentual={percentualDocumentacao}
                                onOpen={() => setShowDocumentosModal(true)}
                              />
                            )}
                          </div>
                          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(statusLinha)}`}>
                            {statusLinha}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Histórico da Jornada" description="Registros gravados na PORTAL_COMPARTILHAMENTO_JORNADA.">
          {jornada.length === 0 ? (
            <EmptyState
              message="Nenhum histórico de jornada encontrado para este processo."
              className="rounded-xl border border-slate-200 bg-slate-50 p-6"
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <Table className="bg-white text-sm">
                <TableHeader className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <TableRow>
                    <TableHead className="px-4 py-3">Data Entrada</TableHead>
                    <TableHead className="px-4 py-3">Etapa</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3">Responsável</TableHead>
                    <TableHead className="px-4 py-3">SLA</TableHead>
                    <TableHead className="px-4 py-3">Pendência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-slate-700">
                  {jornada.map((item) => (
                    <TableRow key={String(item.ID_JORNADA)}>
                      <TableCell className="px-4 py-3">{formatarData(item.DATA_ENTRADA_ETAPA)}</TableCell>
                      <TableCell className="px-4 py-3 font-medium text-slate-900">
                        {valor(item.NOME_ETAPA || item.ID_ETAPA)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(item.STATUS_ETAPA)}`}>
                          {valor(item.STATUS_ETAPA)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {valor(item.RESPONSAVEL_ATUAL)}
                        {item.RESPONSAVEL_ETAPA && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Atribuído: {item.RESPONSAVEL_ETAPA}
                            {item.PRAZO_ETAPA ? ` · prazo ${formatarData(item.PRAZO_ETAPA)}` : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">{item.SLA_DIAS ?? "-"} dias</TableCell>
                      <TableCell className="px-4 py-3">{valor(item.FLAG_PENDENCIA)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Contatos com o Provedor"
          description="Registro de todas as tentativas de contato feitas durante a jornada deste processo."
        >
          <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-1.5 text-sm xl:col-span-1">
              <span className="font-medium text-slate-700">Data do contato</span>
              <Input
                type="datetime-local"
                value={contatoForm.dataContato}
                onChange={(event) => setContatoForm((prev) => ({ ...prev, dataContato: event.target.value }))}
              />
            </label>

            <label className="grid gap-1.5 text-sm xl:col-span-1">
              <span className="font-medium text-slate-700">Meio</span>
              <Select
                value={contatoForm.meioContato}
                onValueChange={(v) => v !== null && setContatoForm((prev) => ({ ...prev, meioContato: v }))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEIOS_CONTATO.map((meio) => (
                    <SelectItem key={meio.value} value={meio.value}>{meio.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1.5 text-sm xl:col-span-1">
              <span className="font-medium text-slate-700">Pessoa de contato</span>
              <Input
                placeholder="Nome do contato no provedor"
                value={contatoForm.pessoaContato}
                onChange={(event) => setContatoForm((prev) => ({ ...prev, pessoaContato: event.target.value }))}
              />
            </label>

            <label className="grid gap-1.5 text-sm xl:col-span-1">
              <span className="font-medium text-slate-700">Resultado</span>
              <Select
                value={contatoForm.resultado}
                onValueChange={(v) => v !== null && setContatoForm((prev) => ({ ...prev, resultado: v }))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESULTADOS_CONTATO.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {contatoForm.meioContato === "WHATSAPP" && (
              <div className="grid gap-1.5 text-sm xl:col-span-1">
                <span className="font-medium text-slate-700">WhatsApp</span>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Por enquanto o sistema não abre o WhatsApp automaticamente (bloqueio de rede). Envie a mensagem
                  por fora e use este formulário só para registrar que o contato foi feito.
                </p>
              </div>
            )}

            {contatoForm.meioContato === "EMAIL" && (
              <>
                <label className="grid gap-1.5 text-sm xl:col-span-1">
                  <span className="font-medium text-slate-700">Destinatário</span>
                  <Input
                    type="email"
                    placeholder="email@provedor.com"
                    value={contatoForm.destinatarioEmail}
                    onChange={(event) => setContatoForm((prev) => ({ ...prev, destinatarioEmail: event.target.value }))}
                  />
                </label>

                <label className="grid gap-1.5 text-sm xl:col-span-1">
                  <span className="font-medium text-slate-700">Assunto do e-mail</span>
                  <Input
                    placeholder="Assunto"
                    value={contatoForm.assuntoEmail}
                    onChange={(event) => setContatoForm((prev) => ({ ...prev, assuntoEmail: event.target.value }))}
                  />
                </label>
              </>
            )}

            <label className="grid gap-1.5 text-sm xl:col-span-2">
              <span className="font-medium text-slate-700">
                {contatoForm.meioContato === "EMAIL" ? "Corpo do e-mail" : "Observação"}
              </span>
              <Input
                placeholder={contatoForm.meioContato === "EMAIL" ? "Mensagem que será enviada ao provedor" : "O que foi tratado no contato"}
                value={contatoForm.observacao}
                onChange={(event) => setContatoForm((prev) => ({ ...prev, observacao: event.target.value }))}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-5">
              {contatoForm.meioContato === "EMAIL" ? (
                <Button type="button" onClick={enviarEmailERegistrar} disabled={salvandoContato}>
                  {salvandoContato ? "Enviando..." : "Enviar E-mail e Registrar"}
                </Button>
              ) : (
                <Button type="button" onClick={salvarContato} disabled={salvandoContato}>
                  {salvandoContato ? "Registrando..." : "Registrar Contato"}
                </Button>
              )}
            </div>
          </div>

          {contatos.length === 0 ? (
            <EmptyState
              message="Nenhum contato registrado para este processo ainda."
              className="rounded-xl border border-slate-200 bg-slate-50 p-6"
            />
          ) : (
            <ol className="space-y-4">
              {contatos.map((item) => (
                <li key={String(item.ID_CONTATO)} className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatarData(item.DATA_CONTATO)}
                        {item.PESSOA_CONTATO ? ` · ${item.PESSOA_CONTATO}` : ""}
                      </p>
                      {item.MEIO_CONTATO && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {item.MEIO_CONTATO}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.OBSERVACAO}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${resultadoContatoClass(item.RESULTADO)}`}>
                        {resultadoContatoLabel(item.RESULTADO)}
                      </span>
                      <Select
                        value={item.RESULTADO || "AGUARDANDO"}
                        onValueChange={(v) => v !== null && atualizarResultadoContato(item.ID_CONTATO, v)}
                        disabled={atualizandoResultadoId === String(item.ID_CONTATO)}
                      >
                        <SelectTrigger className="h-7 w-fit text-xs"><SelectValue placeholder="Alterar resultado" /></SelectTrigger>
                        <SelectContent>
                          {RESULTADOS_CONTATO.map((opcao) => (
                            <SelectItem key={opcao.value} value={opcao.value}>{opcao.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Registrado por {valor(item.USUARIO_REGISTRO)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-6 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={handleVoltar}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={carregarDados}
              disabled={refreshing || actionLoading}
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={abrirModalDaEtapaAtual}
              disabled={!podeConcluirEtapa || actionLoading}
              className="border-primary/40 text-primary hover:bg-primary/10"
            >
              <FileText className="h-4 w-4" />
              Executar Etapa
            </Button>

            <Button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={!podeConcluirEtapa || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Concluir Etapa
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRetornarModal(true)}
              disabled={!podeConcluirEtapa || actionLoading}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Undo2 className="h-4 w-4" />
              Retornar Etapa
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowCancelarModal(true)}
              disabled={processoEncerrado || actionLoading}
            >
              <Ban className="h-4 w-4" />
              Cancelar Processo
            </Button>
          </div>
        </div>
      </div>

      <PromptModal
        open={showRetornarModal}
        title="Retornar etapa"
        label="Motivo do retorno (obrigatório)"
        confirmLabel="Retornar etapa"
        onCancel={() => setShowRetornarModal(false)}
        onConfirm={handleRetornarEtapa}
      />

      <PromptModal
        open={showCancelarModal}
        title="Cancelar processo"
        label="Motivo do cancelamento (obrigatório)"
        confirmLabel="Cancelar processo"
        onCancel={() => setShowCancelarModal(false)}
        onConfirm={handleCancelarProcesso}
      />

      {modalEtapa === "ANALISE_CADASTRAL" && (
        <ModalShell
          title="Análise Cadastral"
          description="Valide os dados mínimos do provedor antes de liberar a próxima etapa da jornada."
          onClose={() => setModalEtapa(null)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <CardInfo label="Razão Social" value={valor(processo.RAZAO_SOCIAL || processo.NOME_FANTASIA)} />
            <CardInfo label="CNPJ" value={valor(processo.CNPJ)} />
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Checklist de validação</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["dadosConferidos", "Dados cadastrais conferidos"],
                ["cnpjValidado", "CNPJ validado"],
                ["responsavelValidado", "Responsável validado"],
                ["contatoConfirmado", "Contato confirmado"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(checklistAnalise[key as keyof typeof checklistAnalise])}
                    onChange={(event) =>
                      setChecklistAnalise((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                    className="h-4 w-4 accent-green-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setModalEtapa(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarAnaliseCadastral}>
              Salvar validação
            </Button>
          </div>
        </ModalShell>
      )}

      {modalEtapa === "DOCUMENTACAO" && (
        <ModalShell
          title="Documentação"
          description="Registre o documento que foi enviado manualmente para a biblioteca SharePoint existente."
          onClose={() => setModalEtapa(null)}
        >
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Use o botão Copiar Nome para renomear o arquivo localmente antes do upload. Depois envie o arquivo para a biblioteca SharePoint e cole abaixo o link final do arquivo. Se ainda estiver organizando a pasta, você pode colar temporariamente o link da pasta.
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Documentos obrigatórios da etapa</h3>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
              {TIPOS_DOCUMENTO_OBRIGATORIOS.map((tipo) => {
                const inserido = documentos.some((doc) => doc.TIPO_DOCUMENTO === tipo.codigo);
                return (
                  <div
                    key={tipo.codigo}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 transition ${
                      inserido
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {inserido ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="font-medium">{tipo.label}</span>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      inserido ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {inserido ? "INSERIDO" : "PENDENTE"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Tipo do documento
              <Select
                value={documentoForm.tipo_documento}
                onValueChange={(value) => value !== null && setDocumentoForm((prev) => ({ ...prev, tipo_documento: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO_OBRIGATORIOS.map((tipo) => (
                    <SelectItem key={tipo.codigo} value={tipo.codigo}>
                      {tipo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Tipo do arquivo
              <input
                value={documentoForm.tipo_arquivo}
                onChange={(event) => setDocumentoForm((prev) => ({ ...prev, tipo_arquivo: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="pdf, docx, xlsx..."
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              Nome padronizado do arquivo
              <input
                value={nomeArquivoPadrao}
                readOnly
                className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                title="Nome gerado automaticamente no padrão CNPJ_PROTOCOLO_TIPO_DOCUMENTO.extensão"
              />
              <p className="text-xs font-normal text-slate-500">
                Padrão: CNPJ_PROTOCOLO_TIPO_DOCUMENTO.extensão. Exemplo: {limparCnpj(processo.CNPJ)}_{valor(processo.NUMERO_PROTOCOLO)}_{documentoForm.tipo_documento}.{limparExtensao(documentoForm.tipo_arquivo)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={copiarNomeArquivo}
                  className="text-xs"
                >
                  {nomeCopiado ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar Nome
                    </>
                  )}
                </Button>
              </div>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Link SharePoint / Caminho do arquivo</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={abrirPastaSharePoint}
                  className="text-xs font-normal"
                >
                  <FolderOpen className="h-4 w-4" />
                  Abrir Pasta do SharePoint
                </Button>
              </div>
              <input
                value={documentoForm.caminho_arquivo}
                onChange={(event) => setDocumentoForm((prev) => ({ ...prev, caminho_arquivo: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Cole aqui o link da pasta ou, preferencialmente, o link final do arquivo no SharePoint"
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className={`text-xs font-normal ${classificarLinkSharePoint(documentoForm.caminho_arquivo) === "PASTA" ? "text-amber-700" : classificarLinkSharePoint(documentoForm.caminho_arquivo) === "ARQUIVO" ? "text-green-700" : "text-slate-500"}`}>
                  {mensagemLinkSharePoint(documentoForm.caminho_arquivo)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={abrirLinkSharePoint}
                  disabled={!documentoForm.caminho_arquivo}
                  className="text-xs"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir Link
                </Button>
              </div>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              Observação
              <textarea
                value={documentoForm.observacao}
                onChange={(event) => setDocumentoForm((prev) => ({ ...prev, observacao: event.target.value }))}
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Observações sobre o documento registrado"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setModalEtapa(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarDocumento}>
              <UploadCloud className="h-4 w-4" />
              Registrar Documento
            </Button>
          </div>
        </ModalShell>
      )}

      {modalEtapa === "APROVACAO" && (
        <ModalShell title="Aprovação" description="Registre o parecer comercial para a etapa de aprovação." onClose={() => setModalEtapa(null)}>
          <div className="grid gap-4">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Resultado
              <Select
                value={parecer.resultado}
                onValueChange={(value) => value !== null && setParecer((prev) => ({ ...prev, resultado: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APROVADO">Aprovado</SelectItem>
                  <SelectItem value="REPROVADO">Reprovado</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Parecer
              <textarea
                value={parecer.observacao}
                onChange={(event) => setParecer((prev) => ({ ...prev, observacao: event.target.value }))}
                className="min-h-32 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setModalEtapa(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarParecer}>
              Salvar parecer
            </Button>
          </div>
        </ModalShell>
      )}

      {modalEtapa === "CONTRATACAO" && (
        <ModalShell title="Contratação" description="Registre as informações mínimas do contrato assinado." onClose={() => setModalEtapa(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Número do PN
              <input
                value={contratacao.numeroPN}
                onChange={(event) => setContratacao((prev) => ({ ...prev, numeroPN: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="PN-2026-000123"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Número do contrato
              <input
                value={contratacao.numeroContrato}
                onChange={(event) => setContratacao((prev) => ({ ...prev, numeroContrato: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Data de assinatura
              <input
                type="date"
                value={contratacao.dataAssinatura}
                onChange={(event) => setContratacao((prev) => ({ ...prev, dataAssinatura: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              Link do contrato no SharePoint
              <input
                value={contratacao.urlContrato}
                onChange={(event) => setContratacao((prev) => ({ ...prev, urlContrato: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setModalEtapa(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarContratacao}>
              Salvar contratação
            </Button>
          </div>
        </ModalShell>
      )}

      {modalEtapa === "GENERICO" && (
        <ModalShell
          title="Executar Etapa"
          description="Não há modal específico configurado para esta etapa. Você pode seguir para a conclusão manual da etapa."
          onClose={() => setModalEtapa(null)}
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Etapa atual: <strong>{valor(etapaAtual?.NOME_ETAPA)}</strong>
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={() => setModalEtapa(null)}>
              Entendi
            </Button>
          </div>
        </ModalShell>
      )}

      {showDocumentosModal && (
        <DocumentosStatusModal
          documentos={documentos}
          total={totalDocumentosObrigatorios}
          inseridos={totalDocumentosInseridos}
          pendentes={totalDocumentosPendentes}
          percentual={percentualDocumentacao}
          onClose={() => setShowDocumentosModal(false)}
        />
      )}

      {showConfirmModal && (
        <ModalShell
          title="Confirmar conclusão da etapa"
          description="Ao confirmar, a etapa atual será concluída e o processo avançará para a próxima etapa do fluxo, quando existir."
          onClose={() => setShowConfirmModal(false)}
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Etapa atual: {valor(etapaAtual?.NOME_ETAPA)}</div>
                <div className="mt-1">Processo: {valor(processo.ID_PROCESSO)} • Protocolo: {valor(processo.NUMERO_PROTOCOLO)}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConcluirEtapa}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar
                </>
              )}
            </Button>
          </div>
        </ModalShell>
      )}
    </main>
  );
}
