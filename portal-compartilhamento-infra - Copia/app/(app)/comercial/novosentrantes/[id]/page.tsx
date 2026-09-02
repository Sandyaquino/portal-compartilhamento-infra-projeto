"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Pencil,
  X,
  Building2,
  ClipboardCheck,
  Eye,
  Ban,
  Info,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL } from "@/lib/config";
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner";
import { PromptModal } from "@/components/ui/prompt-modal";
import { Button } from "@/components/ui/button";
import { JornadaStepper } from "@/components/comercial/jornada-stepper";
import { TimelineEntrante } from "@/components/comercial/timeline-entrante";
import { statusClass, statusLabel } from "@/hooks/use-lista-entrantes";
const CRIAR_PROVEDOR_BASE_PATH = "/comercial/provedores/novo";
const CRIAR_PROCESSO_BASE_PATH = "/comercial/processos/novo";

type EntranteDetail = {
  ID?: number | string | null;
  ID_ENTRADA?: number | string | null;
  ID_FORMS?: string | null;
  STATUS_ENTRADA?: string | null;
  MOTIVO_DESCARTE?: string | null;
  DATA_RECEBIMENTO?: string | null;
  DATA_IMPORTACAO?: string | null;
  ID_PROCESSO?: number | string | null;

  RAZAO_SOCIAL?: string | null;
  NOME_FANTASIA?: string | null;
  CNPJ?: string | null;

  LOGRADOURO?: string | null;
  NUMERO_ENDERECO?: string | null;
  BAIRRO?: string | null;
  CEP?: string | null;
  MUNICIPIO?: string | null;
  UF?: string | null;

  EMAIL_CONTATO?: string | null;
  TELEFONE_CONTATO?: string | null;

  INSCRICAO_MUNICIPAL?: string | null;
  INSCRICAO_ESTADUAL?: string | null;
  PROCESSO_SEI_ANATEL?: string | null;

  POSSUI_GEOS?: string | null;
  POSSUI_OS_GEOS?: string | null;

  NOME_RESPONSAVEL?: string | null;
  CPF_RESPONSAVEL?: string | null;
  RG_RESPONSAVEL?: string | null;
  EMAIL_RESPONSAVEL?: string | null;
  TELEFONE_RESPONSAVEL?: string | null;

  REDE_FIBRA?: string | null;
  ATENDE_DIS_NOR_056?: string | null;
  QTD_MUNICIPIOS?: number | string | null;
  MUNICIPIOS_ATUACAO?: string | null;
  QTD_POSTES?: number | string | null;
  INFORMACOES_ADICIONAIS?: string | null;
  ACEITE_DECLARACAO?: string | null;

  CREATED_AT?: string | null;
  CREATED_BY?: string | null;
  UPDATED_AT?: string | null;
  UPDATED_BY?: string | null;
  DELETED_AT?: string | null;
  DELETED_BY?: string | null;
  ATIVO?: string | null;

  CLASSIFICACAO?: string | null;
  PRIORIDADE?: string | null;
  POTENCIAL_RECEITA?: string | null;
  OBSERVACOES_COMERCIAL?: string | null;
  OBSERVACOES?: string | null;
};

function normalizar(valor: unknown): string {
  return String(valor ?? "");
}

function getEntranteId(entrante: EntranteDetail | null): string | number | null {
  return entrante?.ID_ENTRADA ?? entrante?.ID ?? null;
}

function formatarData(valor?: string | null) {
  if (!valor) return "-";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return String(valor);
  }

  return data.toLocaleString("pt-BR");
}

function getMensagemFluxo(status?: string | null) {
  const s = normalizar(status).toUpperCase();
  switch (s) {
    case 'PROVEDOR_CRIADO': return 'Este Entrante já possui um Provedor criado. Alterações cadastrais podem ser realizadas normalmente e não alterarão o status atual.';
    case 'PROCESSO_CRIADO': return 'Este Entrante já possui um Processo associado. Alterações cadastrais não alterarão o status atual.';
    case 'ANALISADO': return 'Os dados do Entrante podem ser atualizados normalmente. O status permanecerá como ANALISADO.';
    case 'DESCARTADO': return 'Este Entrante foi descartado e não pode mais avançar na jornada. As informações abaixo são apenas para consulta.';
    default: return 'Edite e salve os dados necessários. Ao salvar, o status do Entrante será alterado para ANALISADO.';
  }
}


function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function CampoLeitura({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        readOnly
        value={value ?? ""}
        className="h-10 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm text-slate-700 outline-none"
      />
    </div>
  );
}

function CampoEditavel({
  label,
  value,
  disabled,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number | null | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`h-10 w-full rounded-lg border px-3 text-sm outline-none transition ${
          disabled
            ? "border-slate-300 bg-slate-100 text-slate-700"
            : "border-slate-300 bg-white text-slate-900 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        }`}
      />
    </div>
  );
}

function AreaEditavel({
  label,
  value,
  disabled,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string | null | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
          disabled
            ? "border-slate-300 bg-slate-100 text-slate-700"
            : "border-slate-300 bg-white text-slate-900 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        }`}
      />
    </div>
  );
}

export default function DetalheEntrantePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [entrante, setEntrante] = useState<EntranteDetail | null>(null);
  const [snapshot, setSnapshot] = useState<EntranteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [descartarModalOpen, setDescartarModalOpen] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [idProvedor, setIdProvedor] = useState<number | null>(null);

  async function carregarEntrante() {
    if (!id) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${id}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Erro ${response.status}: ${text}`);
      }

      const data = await response.json();
      setEntrante(data);
      setSnapshot(data);
    } catch (error) {
      console.error("Erro ao carregar detalhe do entrante:", error);
      setNotification({
        type: "error",
        message: "Não foi possível carregar os dados do entrante.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEntrante();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const status = normalizar(entrante?.STATUS_ENTRADA).toUpperCase();
    const cnpj = entrante?.CNPJ;
    if (!cnpj || !["PROVEDOR_CRIADO", "PROCESSO_CRIADO"].includes(status)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdProvedor(null);
      return;
    }

    let cancelado = false;

    fetch(`${API_BASE_URL}/api/provedores/existe/${cnpj}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelado && data?.id_provedor) {
          setIdProvedor(data.id_provedor);
        }
      })
      .catch((error) => console.error("Erro ao buscar provedor do entrante:", error));

    return () => {
      cancelado = true;
    };
  }, [entrante?.STATUS_ENTRADA, entrante?.CNPJ]);

  function updateCampo<K extends keyof EntranteDetail>(
    campo: K,
    valor: EntranteDetail[K]
  ) {
    setEntrante((prev) =>
      prev
        ? {
            ...prev,
            [campo]: valor,
          }
        : prev
    );
  }

  function handleCancelar() {
    setEntrante(snapshot);
    setEditMode(false);
    setNotification(null);
  }

  async function handleSave() {
    if (!entrante) return;

    try {
      setSaving(true);
      setNotification(null);

      const payload: EntranteDetail = {
        ...entrante,
        STATUS_ENTRADA: "ANALISADO",
      };

      const response = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao salvar o entrante.");
      }

      // Não substitua o estado por { success: true } ou retorno parcial do backend.
      // Recarregar garante que a tela fique com os dados persistidos no SAP HANA.
      await carregarEntrante();

      setEditMode(false);
      setNotification({
        type: "success",
        message: isProviderCreated ? "Dados salvos com sucesso. O status do Entrante foi preservado." : "Dados salvos com sucesso. Status alterado para ANALISADO.",
      });
    } catch (error) {
      console.error("Erro ao salvar entrante:", error);
      setNotification({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar os dados do entrante.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCriarProvedor() {
    const targetId = getEntranteId(entrante);

    if (!targetId) {
      setNotification({
        type: "error",
        message: "Registro sem ID de entrada. Não foi possível abrir a criação do provedor.",
      });
      return;
    }

    router.push(`${CRIAR_PROVEDOR_BASE_PATH}/${targetId}`);
  }

  function handleCriarProcesso() {
    const targetId = getEntranteId(entrante);

    if (!targetId) {
      setNotification({
        type: "error",
        message: "Registro sem ID de entrada. Não foi possível abrir a criação do processo.",
      });
      return;
    }

    router.push(`${CRIAR_PROCESSO_BASE_PATH}/${targetId}`);
  }

  function handleVerProcesso() {
    if (!entrante?.ID_PROCESSO) return;
    router.push(`/comercial/processos/${entrante.ID_PROCESSO}`);
  }

  async function confirmarDescarte(motivo: string) {
    setDescartarModalOpen(false);

    const targetId = getEntranteId(entrante);
    if (!targetId) return;

    try {
      setDescartando(true);

      const response = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${targetId}/descartar`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo }),
        }
      );

      if (!response.ok) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message: erro?.detail || "Não foi possível descartar o entrante.",
        });
        return;
      }

      await carregarEntrante();
      setNotification({ type: "success", message: "Entrante descartado." });
    } catch (error) {
      console.error("Erro ao descartar entrante:", error);
      setNotification({ type: "error", message: "Não foi possível descartar o entrante." });
    } finally {
      setDescartando(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 bg-slate-50 p-6">
        <PageHeader
          title="Detalhe do Entrante"
          description="Carregando dados do entrante."
          breadcrumbs={[
            { label: "Início", href: "/" },
            { label: "Comercial", href: "/comercial" },
            { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
            { label: "Detalhe" },
          ]}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Carregando...
        </div>
      </div>
    );
  }

  if (!entrante) {
    return (
      <div className="space-y-6 bg-slate-50 p-6">
        <PageHeader
          title="Detalhe do Entrante"
          description="Registro não encontrado."
          breadcrumbs={[
            { label: "Início", href: "/" },
            { label: "Comercial", href: "/comercial" },
            { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
            { label: "Detalhe" },
          ]}
        />
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm">
          Entrante não encontrado.
        </div>
      </div>
    );
  }

  const statusAtual = normalizar(entrante.STATUS_ENTRADA).toUpperCase() || "NOVO";
  const isAnalisado = statusAtual === "ANALISADO";
  const isProviderCreated = statusAtual === "PROVEDOR_CRIADO";
  const isProcessoCriado = statusAtual === "PROCESSO_CRIADO";
  const isDescartado = statusAtual === "DESCARTADO";
  const podeDescartar = !isDescartado && !isProcessoCriado;

  return (
    <div className="space-y-6 bg-slate-50 p-6">
      <PageHeader
        title="Detalhe do Entrante"
        description="Acompanhe a jornada do entrante até a criação do provedor e do processo."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
          { label: "Detalhe" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <PromptModal
        open={descartarModalOpen}
        title="Descartar entrante"
        label="Informe o motivo do descarte:"
        confirmLabel="Descartar"
        onCancel={() => setDescartarModalOpen(false)}
        onConfirm={confirmarDescarte}
      />

      <JornadaStepper status={entrante.STATUS_ENTRADA} motivoDescarte={entrante.MOTIVO_DESCARTE} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} className="h-10">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          {idProvedor && (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/comercial/provedores/${idProvedor}`)}
              className="h-10"
            >
              <Building2 className="h-4 w-4" />
              Ver perfil do provedor
            </Button>
          )}

          {!editMode ? (
            <Button
              type="button"
              onClick={() => {
                setSnapshot(entrante);
                setEditMode(true);
              }}
              className="h-10 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancelar}
                disabled={saving}
                className="h-10"
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>

              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-10"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </>
          )}

          {podeDescartar && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDescartarModalOpen(true)}
              disabled={descartando}
              className="h-10"
            >
              <Ban className="h-4 w-4" />
              Descartar
            </Button>
          )}
        </div>

        {isProcessoCriado ? (
          <Button
            type="button"
            onClick={handleVerProcesso}
            className="h-10 bg-blue-600 px-5 text-white hover:bg-blue-700"
          >
            <Eye className="h-4 w-4" />
            Ver Processo
          </Button>
        ) : isProviderCreated ? (
          <Button type="button" onClick={handleCriarProcesso} className="h-10 px-5">
            <ClipboardCheck className="h-4 w-4" />
            Criar Processo
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : !isDescartado ? (
          <Button
            type="button"
            onClick={handleCriarProvedor}
            disabled={!isAnalisado}
            className="h-10 px-5"
            title={
              !isAnalisado
                ? "Salve as informações do entrante para analisá-lo antes de criar o provedor"
                : "Abrir tela de criação do provedor"
            }
          >
            <Building2 className="h-4 w-4" />
            Criar Provedor
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <SectionCard
        title="Resumo do Entrante"
        description="Dados principais do registro selecionado."
      >
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {getMensagemFluxo(entrante?.STATUS_ENTRADA)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CampoEditavel
            label="Razão Social"
            value={entrante.RAZAO_SOCIAL}
            disabled={!editMode}
            onChange={(value) => updateCampo("RAZAO_SOCIAL", value)}
          />
          <CampoEditavel
            label="Nome Fantasia"
            value={entrante.NOME_FANTASIA}
            disabled={!editMode}
            onChange={(value) => updateCampo("NOME_FANTASIA", value)}
          />
          <CampoLeitura label="CNPJ" value={entrante.CNPJ} />
          <CampoEditavel
            label="Município"
            value={entrante.MUNICIPIO}
            disabled={!editMode}
            onChange={(value) => updateCampo("MUNICIPIO", value)}
          />
          <CampoEditavel
            label="UF"
            value={entrante.UF}
            disabled={!editMode}
            onChange={(value) => updateCampo("UF", value)}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Status
            </label>
            <div className="flex h-10 items-center">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                  entrante.STATUS_ENTRADA
                )}`}
              >
                {statusLabel(entrante.STATUS_ENTRADA)}
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Timeline do Entrante"
        description="Transições de estágio e interações de contato (e-mail, ligação, WhatsApp...) com o entrante."
      >
        <TimelineEntrante
          idEntrada={id}
          emailContato={entrante.EMAIL_CONTATO}
          telefoneContato={entrante.TELEFONE_CONTATO}
          disabled={isDescartado}
        />
      </SectionCard>

      <SectionCard title="Dados de Origem">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CampoLeitura label="ID Entrada" value={entrante.ID_ENTRADA} />
          <CampoLeitura label="ID Forms" value={entrante.ID_FORMS} />
          <CampoLeitura label="ID Processo" value={entrante.ID_PROCESSO} />
          <CampoLeitura
            label="Data Recebimento"
            value={formatarData(entrante.DATA_RECEBIMENTO)}
          />
          <CampoLeitura
            label="Data Importação"
            value={formatarData(entrante.DATA_IMPORTACAO)}
          />
          <CampoLeitura label="Ativo" value={entrante.ATIVO} />
          <CampoLeitura
            label="Criado em"
            value={formatarData(entrante.CREATED_AT)}
          />
          <CampoLeitura label="Criado por" value={entrante.CREATED_BY} />
          <CampoLeitura
            label="Atualizado em"
            value={formatarData(entrante.UPDATED_AT)}
          />
          <CampoLeitura label="Atualizado por" value={entrante.UPDATED_BY} />
        </div>
      </SectionCard>

      <SectionCard title="Dados Cadastrais">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CampoEditavel
            label="Razão Social"
            value={entrante.RAZAO_SOCIAL}
            disabled={!editMode}
            onChange={(value) => updateCampo("RAZAO_SOCIAL", value)}
          />
          <CampoEditavel
            label="Nome Fantasia"
            value={entrante.NOME_FANTASIA}
            disabled={!editMode}
            onChange={(value) => updateCampo("NOME_FANTASIA", value)}
          />
          <CampoLeitura label="CNPJ" value={entrante.CNPJ} />
          <CampoEditavel
            label="Inscrição Municipal"
            value={entrante.INSCRICAO_MUNICIPAL}
            disabled={!editMode}
            onChange={(value) => updateCampo("INSCRICAO_MUNICIPAL", value)}
          />
          <CampoEditavel
            label="Inscrição Estadual"
            value={entrante.INSCRICAO_ESTADUAL}
            disabled={!editMode}
            onChange={(value) => updateCampo("INSCRICAO_ESTADUAL", value)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Endereço">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CampoEditavel
            label="Logradouro"
            value={entrante.LOGRADOURO}
            disabled={!editMode}
            onChange={(value) => updateCampo("LOGRADOURO", value)}
          />
          <CampoEditavel
            label="Número"
            value={entrante.NUMERO_ENDERECO}
            disabled={!editMode}
            onChange={(value) => updateCampo("NUMERO_ENDERECO", value)}
          />
          <CampoEditavel
            label="Bairro"
            value={entrante.BAIRRO}
            disabled={!editMode}
            onChange={(value) => updateCampo("BAIRRO", value)}
          />
          <CampoEditavel
            label="CEP"
            value={entrante.CEP}
            disabled={!editMode}
            onChange={(value) => updateCampo("CEP", value)}
          />
          <CampoEditavel
            label="Município"
            value={entrante.MUNICIPIO}
            disabled={!editMode}
            onChange={(value) => updateCampo("MUNICIPIO", value)}
          />
          <CampoEditavel
            label="UF"
            value={entrante.UF}
            disabled={!editMode}
            onChange={(value) => updateCampo("UF", value)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Contato">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CampoEditavel
            label="E-mail Contato"
            value={entrante.EMAIL_CONTATO}
            disabled={!editMode}
            onChange={(value) => updateCampo("EMAIL_CONTATO", value)}
          />
          <CampoEditavel
            label="Telefone Contato"
            value={entrante.TELEFONE_CONTATO}
            disabled={!editMode}
            onChange={(value) => updateCampo("TELEFONE_CONTATO", value)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Responsável">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CampoEditavel
            label="Nome Responsável"
            value={entrante.NOME_RESPONSAVEL}
            disabled={!editMode}
            onChange={(value) => updateCampo("NOME_RESPONSAVEL", value)}
          />
          <CampoEditavel
            label="CPF Responsável"
            value={entrante.CPF_RESPONSAVEL}
            disabled={!editMode}
            onChange={(value) => updateCampo("CPF_RESPONSAVEL", value)}
          />
          <CampoEditavel
            label="RG Responsável"
            value={entrante.RG_RESPONSAVEL}
            disabled={!editMode}
            onChange={(value) => updateCampo("RG_RESPONSAVEL", value)}
          />
          <CampoEditavel
            label="E-mail Responsável"
            value={entrante.EMAIL_RESPONSAVEL}
            disabled={!editMode}
            onChange={(value) => updateCampo("EMAIL_RESPONSAVEL", value)}
          />
          <CampoEditavel
            label="Telefone Responsável"
            value={entrante.TELEFONE_RESPONSAVEL}
            disabled={!editMode}
            onChange={(value) => updateCampo("TELEFONE_RESPONSAVEL", value)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Informações Técnicas">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CampoEditavel
            label="Processo SEI Anatel"
            value={entrante.PROCESSO_SEI_ANATEL}
            disabled={!editMode}
            onChange={(value) => updateCampo("PROCESSO_SEI_ANATEL", value)}
          />
          <CampoEditavel
            label="Possui GEOs"
            value={entrante.POSSUI_GEOS}
            disabled={!editMode}
            onChange={(value) => updateCampo("POSSUI_GEOS", value)}
          />
          <CampoEditavel
            label="Possui OS GEOs"
            value={entrante.POSSUI_OS_GEOS}
            disabled={!editMode}
            onChange={(value) => updateCampo("POSSUI_OS_GEOS", value)}
          />
          <CampoEditavel
            label="Rede Fibra"
            value={entrante.REDE_FIBRA}
            disabled={!editMode}
            onChange={(value) => updateCampo("REDE_FIBRA", value)}
          />
          <CampoEditavel
            label="Atende DIS-NOR-056"
            value={entrante.ATENDE_DIS_NOR_056}
            disabled={!editMode}
            onChange={(value) => updateCampo("ATENDE_DIS_NOR_056", value)}
          />
          <CampoEditavel
            label="Qtd Municípios"
            value={entrante.QTD_MUNICIPIOS}
            disabled={!editMode}
            type="number"
            onChange={(value) => updateCampo("QTD_MUNICIPIOS", value)}
          />
          <CampoEditavel
            label="Qtd Postes"
            value={entrante.QTD_POSTES}
            disabled={!editMode}
            type="number"
            onChange={(value) => updateCampo("QTD_POSTES", value)}
          />
          <CampoEditavel
            label="Aceite Declaração"
            value={entrante.ACEITE_DECLARACAO}
            disabled={!editMode}
            onChange={(value) => updateCampo("ACEITE_DECLARACAO", value)}
          />
          <div className="md:col-span-3">
            <AreaEditavel
              label="Municípios de Atuação"
              value={entrante.MUNICIPIOS_ATUACAO}
              disabled={!editMode}
              onChange={(value) => updateCampo("MUNICIPIOS_ATUACAO", value)}
            />
          </div>
          <div className="md:col-span-3">
            <AreaEditavel
              label="Informações Adicionais"
              value={entrante.INFORMACOES_ADICIONAIS}
              disabled={!editMode}
              onChange={(value) => updateCampo("INFORMACOES_ADICIONAIS", value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Complementação Comercial">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CampoEditavel
            label="Classificação"
            value={entrante.CLASSIFICACAO}
            disabled={!editMode}
            onChange={(value) => updateCampo("CLASSIFICACAO", value)}
          />
          <CampoEditavel
            label="Prioridade"
            value={entrante.PRIORIDADE}
            disabled={!editMode}
            onChange={(value) => updateCampo("PRIORIDADE", value)}
          />
          <CampoEditavel
            label="Potencial de Receita"
            value={entrante.POTENCIAL_RECEITA}
            disabled={!editMode}
            onChange={(value) => updateCampo("POTENCIAL_RECEITA", value)}
          />
          <div className="md:col-span-3">
            <AreaEditavel
              label="Observações Comerciais"
              value={entrante.OBSERVACOES_COMERCIAL ?? entrante.OBSERVACOES}
              disabled={!editMode}
              onChange={(value) => updateCampo("OBSERVACOES_COMERCIAL", value)}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}