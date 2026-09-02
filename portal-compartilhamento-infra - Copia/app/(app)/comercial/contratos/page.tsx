"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL } from "@/lib/config";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { ProvedorContrato } from "@/lib/types/contratos";

function valor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function formatarData(v?: string | null): string {
  if (!v) return "-";
  const data = new Date(v);
  if (Number.isNaN(data.getTime())) return String(v);
  return data.toLocaleDateString("pt-BR");
}

export default function ContratosPage() {
  const router = useRouter();

  const [provedores, setProvedores] = useState<ProvedorContrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        setErro(null);

        const response = await fetch(`${API_BASE_URL}/api/provedores`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Erro ${response.status} ao carregar contratos.`);
        }

        const dados = await response.json();
        setProvedores(Array.isArray(dados) ? dados : []);
      } catch (error) {
        setErro(error instanceof Error ? error.message : "Erro ao carregar contratos.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return provedores;

    return provedores.filter((p) =>
      [p.RAZAO_SOCIAL, p.NOME_FANTASIA, p.CNPJ]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo))
    );
  }, [provedores, busca]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Contratos"
        description="Provedores que já concluíram a jornada de compartilhamento — gestão do contrato e solicitação de ações."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Contratos" },
        ]}
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar por razão social, nome fantasia ou CNPJ..."
          className="h-9 pl-8"
        />
      </div>

      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {erro}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando contratos...</p>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={FileText}
          message="Nenhum contrato encontrado. Um provedor só aparece aqui depois de concluir toda a jornada (pelo menos um processo/PN concluído)."
          className="rounded-xl border border-slate-200 bg-slate-50 p-10"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <Table className="bg-white text-sm">
            <TableHeader className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <TableRow>
                <TableHead className="px-4 py-3">Razão Social</TableHead>
                <TableHead className="px-4 py-3">CNPJ</TableHead>
                <TableHead className="px-4 py-3">Responsável</TableHead>
                <TableHead className="px-4 py-3">Processos</TableHead>
                <TableHead className="px-4 py-3">Última Conclusão</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((provedor) => (
                <TableRow
                  key={provedor.ID_PROVEDOR}
                  className="cursor-pointer"
                  onClick={() => router.push(`/comercial/contratos/${provedor.ID_PROVEDOR}`)}
                >
                  <TableCell className="px-4 py-3">
                    <p className="font-medium text-slate-800">{valor(provedor.RAZAO_SOCIAL)}</p>
                    {provedor.NOME_FANTASIA && (
                      <p className="text-xs text-slate-500">{provedor.NOME_FANTASIA}</p>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">{valor(provedor.CNPJ)}</TableCell>
                  <TableCell className="px-4 py-3">{valor(provedor.RESPONSAVEL)}</TableCell>
                  <TableCell className="px-4 py-3">{valor(provedor.TOTAL_PROCESSOS)}</TableCell>
                  <TableCell className="px-4 py-3">{formatarData(provedor.ULTIMA_CONCLUSAO)}</TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      {valor(provedor.STATUS_CADASTRO)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
