"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL } from "@/lib/config";
import { NotificationBanner } from "@/components/ui/notification-banner";
import { Button } from "@/components/ui/button";
import { useEntranteDetalhe, type EntranteDetail } from "@/hooks/use-entrante-detalhe";
import { valor, SectionCard, ResumoEntranteCard } from "@/components/comercial/entrante-resumo";

function EditableField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={valor(value)}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
    </label>
  );
}

export default function CriarProvedorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { entrante, setEntrante, loading, notification, setNotification } = useEntranteDetalhe(id);

  const [saving, setSaving] = useState(false);
  const [provedorCriado, setProvedorCriado] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    setProvedorCriado(Boolean(entrante?.ID_PROVEDOR));
  }, [entrante]);

  function atualizarCampo<K extends keyof EntranteDetail>(
    campo: K,
    value: EntranteDetail[K]
  ) {
    setEntrante((prev) => (prev ? { ...prev, [campo]: value } : prev));
  }

  async function handleConfirm() {
    if (!entrante || saving) return;

    setSaving(true);
    setNotification(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${id}/criar-provedor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            RAZAO_SOCIAL: entrante.RAZAO_SOCIAL,
            NOME_FANTASIA: entrante.NOME_FANTASIA,
            CNPJ: entrante.CNPJ,
            RESPONSAVEL: entrante.NOME_RESPONSAVEL,
            EMAIL: entrante.EMAIL_CONTATO,
            TELEFONE: entrante.TELEFONE_CONTATO,
            MUNICIPIO: entrante.MUNICIPIO,
            UF: entrante.UF,
          }),
        }
      );

      if (response.status === 409) {
        const erro = await response.json().catch(() => null);
        setNotification({
          type: "error",
          message:
            erro?.detail || "Já existe um provedor cadastrado com este CNPJ.",
        });
        setShowConfirmModal(false);
        return;
      }

      if (!response.ok) {
        const texto = await response.text();
        setNotification({
          type: "error",
          message: `Erro ao criar provedor: ${texto}`,
        });
        setShowConfirmModal(false);
        return;
      }

      await response.json();

      setNotification({
        type: "success",
        message: "Provedor criado com sucesso.",
      });

      setShowConfirmModal(false);
    } catch (error) {
      console.error("Erro ao criar provedor:", error);
      setNotification({
        type: "error",
        message: "Não foi possível criar o provedor.",
      });
      setShowConfirmModal(false);
    } finally {
      setSaving(false);
    }
  }

  function handleVoltar() {
    router.back();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-sm">
          Carregando dados do entrante...
        </div>
      </main>
    );
  }

  if (!entrante) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <PageHeader
          title="Criar Provedor"
          description="Não foi possível localizar os dados do entrante informado."
          breadcrumbs={[
            { label: "Comercial", href: "/comercial" },
            { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
            { label: "Criar Provedor" },
          ]}
        />

        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          Entrante não encontrado.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title={`Criar Provedor - Entrante ${id}`}
          description="Revise os dados do entrante antes de confirmar a criação do provedor."
          breadcrumbs={[
            { label: "Comercial", href: "/comercial" },
            { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
            { label: "Detalhe do Entrante", href: `/comercial/novosentrantes/${id}` },
            { label: "Criar Provedor" },
          ]}
        />

        <NotificationBanner notification={notification} />

        <ResumoEntranteCard
          entrante={entrante}
          descricao="Registro selecionado para conversão em provedor."
          badgeLabel="PRONTO PARA IMPORTAÇÃO"
        />

        <SectionCard title="Dados Cadastrais">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <EditableField
              label="Razão Social"
              value={entrante.RAZAO_SOCIAL}
              onChange={(value) => atualizarCampo("RAZAO_SOCIAL", value)}
            />
            <EditableField
              label="Nome Fantasia"
              value={entrante.NOME_FANTASIA}
              onChange={(value) => atualizarCampo("NOME_FANTASIA", value)}
            />
            <EditableField
              label="CNPJ"
              value={entrante.CNPJ}
              onChange={(value) => atualizarCampo("CNPJ", value)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Endereço">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <EditableField
              label="Logradouro"
              value={entrante.LOGRADOURO}
              onChange={(value) => atualizarCampo("LOGRADOURO", value)}
            />
            <EditableField
              label="Número"
              value={entrante.NUMERO_ENDERECO}
              onChange={(value) => atualizarCampo("NUMERO_ENDERECO", value)}
            />
            <EditableField
              label="Bairro"
              value={entrante.BAIRRO}
              onChange={(value) => atualizarCampo("BAIRRO", value)}
            />
            <EditableField
              label="CEP"
              value={entrante.CEP}
              onChange={(value) => atualizarCampo("CEP", value)}
            />
            <EditableField
              label="Município"
              value={entrante.MUNICIPIO}
              onChange={(value) => atualizarCampo("MUNICIPIO", value)}
            />
            <EditableField
              label="UF"
              value={entrante.UF}
              onChange={(value) => atualizarCampo("UF", value)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Contato">
          <div className="grid gap-4 md:grid-cols-2">
            <EditableField
              label="Email"
              value={entrante.EMAIL_CONTATO}
              onChange={(value) => atualizarCampo("EMAIL_CONTATO", value)}
            />
            <EditableField
              label="Telefone"
              value={entrante.TELEFONE_CONTATO}
              onChange={(value) => atualizarCampo("TELEFONE_CONTATO", value)}
            />
          </div>
        </SectionCard>

        <SectionCard title="Responsável">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <EditableField
              label="Nome"
              value={entrante.NOME_RESPONSAVEL}
              onChange={(value) => atualizarCampo("NOME_RESPONSAVEL", value)}
            />
            <EditableField
              label="CPF"
              value={entrante.CPF_RESPONSAVEL}
              onChange={(value) => atualizarCampo("CPF_RESPONSAVEL", value)}
            />
            <EditableField
              label="RG"
              value={entrante.RG_RESPONSAVEL}
              onChange={(value) => atualizarCampo("RG_RESPONSAVEL", value)}
            />
            <EditableField
              label="Email"
              value={entrante.EMAIL_RESPONSAVEL}
              onChange={(value) => atualizarCampo("EMAIL_RESPONSAVEL", value)}
            />
            <EditableField
              label="Telefone"
              value={entrante.TELEFONE_RESPONSAVEL}
              onChange={(value) => atualizarCampo("TELEFONE_RESPONSAVEL", value)}
            />
          </div>
        </SectionCard>

        <div className="sticky bottom-0 z-20 -mx-6 border-t border-slate-200 bg-white/95 px-6 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={handleVoltar}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>

            <Button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={saving || provedorCriado}
              className="px-5"
            >
              {saving ? "Criando..." : provedorCriado ? "Provedor Já Criado" : "Confirmar Criação do Provedor"}
            </Button>
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                Confirmar Criação do Provedor
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Você deseja mesmo criar um provedor com os dados abaixo?
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="space-y-2">
                <p>
                  <span className="font-semibold text-slate-900">Razão Social:</span>{" "}
                  {valor(entrante.RAZAO_SOCIAL) || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">CNPJ:</span>{" "}
                  {valor(entrante.CNPJ) || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Município:</span>{" "}
                  {valor(entrante.MUNICIPIO) || "-"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                Esta ação criará um registro definitivo de provedor e atualizará a etapa do fluxo.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving || provedorCriado}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                onClick={handleConfirm}
                disabled={saving || provedorCriado}
              >
                {saving ? "Criando..." : provedorCriado ? "Provedor Já Criado" : "Confirmar Criação do Provedor"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
