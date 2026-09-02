"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Users, ShieldCheck, ArrowRight } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { KpiCard } from "@/components/comercial/kpi-card"
import { useCurrentUser } from "@/hooks/use-current-user"
import { AcessoNegado } from "@/components/administracao/acesso-negado"
import { adminFetch, ehPerfilAdministrador } from "@/lib/admin-api"

type Usuario = {
  LOGIN: string
  STATUS?: string | null
}

type Perfil = {
  ID: number
  NOME: string
}

export default function AdministracaoPage() {
  const { user, loading: carregandoUsuario } = useCurrentUser()
  const temAcesso = ehPerfilAdministrador(user?.perfil)

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!temAcesso) return

    async function carregar() {
      try {
        const [usuariosData, perfisData] = await Promise.all([
          adminFetch<Usuario[]>("/api/admin/usuarios"),
          adminFetch<Perfil[]>("/api/admin/perfis"),
        ])
        setUsuarios(usuariosData)
        setPerfis(perfisData)
      } catch (error) {
        console.error("Erro ao carregar visão geral de administração:", error)
      } finally {
        setLoading(false)
      }
    }

    carregar()
  }, [temAcesso])

  if (carregandoUsuario) return null
  if (!temAcesso) return <AcessoNegado />

  const usuariosAtivos = usuarios.filter((usuario) => (usuario.STATUS ?? "A") === "A").length

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Administração"
        description="Gestão de usuários, perfis e permissões de acesso ao portal."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Administração" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard
          title="Usuários Ativos"
          value={loading ? "…" : String(usuariosAtivos)}
          subtitle={`${usuarios.length} usuário(s) cadastrado(s) no total`}
          icon={Users}
          color="text-primary"
        />
        <KpiCard
          title="Perfis"
          value={loading ? "…" : String(perfis.length)}
          subtitle="Perfis de acesso configurados"
          icon={ShieldCheck}
          color="text-blue-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/administracao/usuarios"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold text-slate-900">Usuários</p>
              <p className="text-sm text-slate-500">Criar, editar e ativar/inativar usuários</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/administracao/perfis"
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <div>
              <p className="font-semibold text-slate-900">Perfis</p>
              <p className="text-sm text-slate-500">Gerenciar perfis, funcionalidades e permissões</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </Link>
      </div>
    </div>
  )
}
