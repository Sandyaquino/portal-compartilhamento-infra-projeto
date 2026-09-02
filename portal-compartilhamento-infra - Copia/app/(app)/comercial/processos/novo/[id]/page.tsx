"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL } from "@/lib/config";
import { NotificationBanner } from "@/components/ui/notification-banner";
import { Button } from "@/components/ui/button";
import { useEntranteDetalhe } from "@/hooks/use-entrante-detalhe";
import { valor, SectionCard, ResumoEntranteCard } from "@/components/comercial/entrante-resumo";

function ReadOnlyField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">
        {valor(value) || "-"}
      </div>
    </div>
  );
}

export default function CriarProcessoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { entrante, loading, notification, setNotification } = useEntranteDetalhe(id);

  const [creating, setCreating] = useState(false);
  const [processoCriado, setProcessoCriado] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  async function handleConfirm() {
    if (!entrante || creating) return;
    if (entrante.STATUS_ENTRADA !== "PROVEDOR_CRIADO") {
      setNotification({
        type: "warning",
        message: "Para criar o processo, o Entrante precisa estar com status PROVEDOR_CRIADO.",
      });
      setShowConfirmModal(false);
      return;
    }
    setCreating(true);
    setNotification(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/novos-entrantes/entrada/${id}/criar-processo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setNotification({
          type: "error",
          message: err?.detail || "Erro ao criar processo.",
        });
        setShowConfirmModal(false);
        return;
      }
      const data = await res.json();
      setNotification({
        type: "success",
        message: "Processo criado com sucesso.",
      });
      setProcessoCriado(true);
      setShowConfirmModal(false);

      const idProcesso = data?.id_processo ?? data?.processoCriado;
      if (idProcesso) {
        router.push(`/comercial/processos/${idProcesso}`);
      }
    } catch (error) {
      console.error("Erro ao criar processo:", error);
      setNotification({
        type: "error",
        message: "Não foi possível criar o processo.",
      });
      setShowConfirmModal(false);
    } finally {
      setCreating(false);
    }
  }

  function handleVoltar() {
    router.back();
  }

  const canCreateProcess = entrante?.STATUS_ENTRADA === "PROVEDOR_CRIADO" && !processoCriado;

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
          title="Criar Processo"
          description="Não foi possível localizar os dados do entrante informado."
          breadcrumbs={[
            { label: "Comercial", href: "/comercial" },
            { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
            { label: "Criar Processo" },
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
          title={`Criar Processo - Entrante ${id}`}
          description="Revise os dados do entrante antes de confirmar a criação do processo."
          breadcrumbs={[
            { label: "Comercial", href: "/comercial" },
            { label: "Jornada de Entrantes", href: "/comercial/novosentrantes" },
            { label: "Detalhe do Entrante", href: `/comercial/novosentrantes/${id}` },
            { label: "Criar Processo" },
          ]}
        />

        <NotificationBanner notification={notification} />

        <ResumoEntranteCard
          entrante={entrante}
          descricao="Registro selecionado para criação de processo."
          badgeLabel={valor(entrante.STATUS_ENTRADA) || "-"}
        />

        <SectionCard title="Dados Cadastrais">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Razão Social" value={entrante.RAZAO_SOCIAL} />
            <ReadOnlyField label="Nome Fantasia" value={entrante.NOME_FANTASIA} />
            <ReadOnlyField label="CNPJ" value={entrante.CNPJ} />
          </div>
        </SectionCard>

        <SectionCard title="Endereço">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Logradouro" value={entrante.LOGRADOURO} />
            <ReadOnlyField label="Número" value={entrante.NUMERO_ENDERECO} />
            <ReadOnlyField label="Bairro" value={entrante.BAIRRO} />
            <ReadOnlyField label="CEP" value={entrante.CEP} />
            <ReadOnlyField label="Município" value={entrante.MUNICIPIO} />
            <ReadOnlyField label="UF" value={entrante.UF} />
          </div>
        </SectionCard>

        <SectionCard title="Contato">
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField label="Email" value={entrante.EMAIL_CONTATO} />
            <ReadOnlyField label="Telefone" value={entrante.TELEFONE_CONTATO} />
          </div>
        </SectionCard>

        <SectionCard title="Responsável">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Nome" value={entrante.NOME_RESPONSAVEL} />
            <ReadOnlyField label="CPF" value={entrante.CPF_RESPONSAVEL} />
            <ReadOnlyField label="RG" value={entrante.RG_RESPONSAVEL} />
            <ReadOnlyField label="Email" value={entrante.EMAIL_RESPONSAVEL} />
            <ReadOnlyField label="Telefone" value={entrante.TELEFONE_RESPONSAVEL} />
          </div>
        </SectionCard>
      </div>

      <div className="sticky bottom-0 z-20 -mx-6 border-t border-slate-200 bg-white/95 px-6 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={handleVoltar}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          <Button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={!canCreateProcess || creating}
            className="px-5"
          >
            {creating
              ? "Criando..."
              : processoCriado
              ? "Processo Já Criado"
              : "Criar Processo"}
          </Button>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                Confirmar Criação do Processo
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Você deseja mesmo criar um processo com os dados abaixo?
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
                Esta ação criará um registro definitivo de processo e iniciará a jornada operacional.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={creating || processoCriado}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                onClick={handleConfirm}
                disabled={creating || processoCriado}
              >
                {creating ? "Criando..." : processoCriado ? "Processo Já Criado" : "Confirmar Criação do Processo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
