"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Link2, Mail, Paperclip } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { API_BASE_URL } from "@/lib/config"
import { useCurrentUser } from "@/hooks/use-current-user"
import type { Submissao } from "@/lib/types/projetos"

function formatarDataHora(valor?: string | null) {
  if (!valor) return "—"
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleString("pt-BR")
}

export default function CaixaEntradaProjetosPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [submissoes, setSubmissoes] = useState<Submissao[]>([])
  const [loading, setLoading] = useState(true)
  const [vinculando, setVinculando] = useState<number | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/projetos/submissoes?status=NOVO`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Erro ${res.status} ao carregar a caixa de entrada`)
      setSubmissoes(await res.json())
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar a caixa de entrada",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  async function vincular(sub: Submissao) {
    setVinculando(sub.ID_SUBMISSAO)
    try {
      const res = await fetch(`${API_BASE_URL}/api/projetos/submissoes/${sub.ID_SUBMISSAO}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submetido_por: user?.login ?? "dev.local" }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail || "Erro ao gerar o projeto")
      setNotification({
        type: "success",
        message: `Projeto ${data.numero_projeto} criado${data.vinculo_resolvido ? " e vinculado ao provedor" : " (provedor ainda não cadastrado)"}.`,
      })
      router.push(`/projetos/${data.id_projeto}`)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao gerar o projeto",
      })
      setVinculando(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Caixa de Entrada — Projetos"
        description="E-mails com projetos de compartilhamento recebidos na caixa institucional, aguardando triagem."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Projetos", href: "/projetos" },
          { label: "Caixa de Entrada" },
        ]}
      />

      <NotificationBanner notification={notification} />

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : submissoes.length === 0 ? (
        <EmptyState message="Nenhum e-mail pendente de triagem." className="rounded-xl border border-slate-200 bg-slate-50 p-10" />
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {submissoes.length} e-mail{submissoes.length === 1 ? "" : "s"} pendente{submissoes.length === 1 ? "" : "s"}
          </p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {submissoes.map((sub) => (
              <div key={sub.ID_SUBMISSAO} className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <p className="font-semibold text-slate-800">{sub.ASSUNTO}</p>
                    {sub.PROVEDOR_CONHECIDO ? (
                      <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                        Provedor cadastrado
                      </span>
                    ) : (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        Provedor não cadastrado
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{sub.EMAIL_REMETENTE}</span>
                    <span className="text-slate-300">·</span>
                    <span>{formatarDataHora(sub.DATA_EMAIL)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{sub.QTD_ANEXOS} anexo(s)</span>
                    <span className="text-slate-300">·</span>
                    <span>chave <span className="font-mono font-semibold text-slate-600">{sub.CHAVE_CONEXAO}</span></span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{sub.CORPO_RESUMO}</p>
                </div>
                <Button type="button" onClick={() => vincular(sub)} disabled={vinculando !== null}>
                  <Link2 className="h-4 w-4" />
                  {vinculando === sub.ID_SUBMISSAO ? "Gerando..." : "Triar e gerar projeto"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
