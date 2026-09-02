"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useCurrentUser } from "@/hooks/use-current-user"
import { AcessoNegado } from "@/components/administracao/acesso-negado"
import { PerfilModal, type PerfilFormValues } from "@/components/administracao/perfil-modal"
import { adminFetch, ehPerfilAdministrador } from "@/lib/admin-api"

type Perfil = {
  ID: number
  NOME: string
  DESCRICAO: string | null
  QTD_USUARIOS: number
}

const VALORES_VAZIOS: PerfilFormValues = { nome: "", descricao: "" }

export default function AdministracaoPerfisPage() {
  const router = useRouter()
  const { user, loading: carregandoUsuario } = useCurrentUser()
  const temAcesso = ehPerfilAdministrador(user?.perfil)

  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [perfilEditando, setPerfilEditando] = useState<Perfil | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      const perfisData = await adminFetch<Perfil[]>("/api/admin/perfis")
      setPerfis(perfisData)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar perfis",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (temAcesso) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temAcesso])

  function abrirCriacao() {
    setPerfilEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(perfil: Perfil) {
    setPerfilEditando(perfil)
    setModalAberto(true)
  }

  async function salvar(valores: PerfilFormValues) {
    const payload = { nome: valores.nome.trim(), descricao: valores.descricao.trim() || null }

    if (perfilEditando) {
      await adminFetch(`/api/admin/perfis/${perfilEditando.ID}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    } else {
      await adminFetch("/api/admin/perfis", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }

    setNotification({ type: "success", message: "Perfil salvo com sucesso!" })
    await carregar()
  }

  async function excluir(perfil: Perfil) {
    if (!window.confirm(`Excluir o perfil "${perfil.NOME}"? Essa ação não pode ser desfeita.`)) return

    try {
      await adminFetch(`/api/admin/perfis/${perfil.ID}`, { method: "DELETE" })
      setNotification({ type: "success", message: "Perfil excluído com sucesso!" })
      await carregar()
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao excluir perfil",
      })
    }
  }

  if (carregandoUsuario) return null
  if (!temAcesso) return <AcessoNegado />

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Perfis"
        description="Perfis de acesso, cada um com seu conjunto de funcionalidades e permissões por módulo."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Administração", href: "/administracao" },
          { label: "Perfis" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex justify-end">
          <Button onClick={abrirCriacao} className="h-9 w-fit">
            <Plus className="h-4 w-4" />
            Novo perfil
          </Button>
        </div>

        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <TableHead className="p-2 text-left">Nome</TableHead>
              <TableHead className="p-2 text-left">Descrição</TableHead>
              <TableHead className="p-2 text-center">Usuários</TableHead>
              <TableHead className="p-2 text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && perfis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState message="Nenhum perfil encontrado." />
                </TableCell>
              </TableRow>
            ) : (
              perfis.map((perfil) => (
                <TableRow key={perfil.ID}>
                  <TableCell className="p-2 font-medium text-slate-800">{perfil.NOME}</TableCell>
                  <TableCell className="p-2 text-slate-600">{perfil.DESCRICAO ?? "-"}</TableCell>
                  <TableCell className="p-2 text-center text-slate-700">{perfil.QTD_USUARIOS}</TableCell>
                  <TableCell className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Permissões"
                        onClick={() => router.push(`/administracao/perfis/${perfil.ID}/permissoes`)}
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Editar" onClick={() => abrirEdicao(perfil)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Excluir"
                        onClick={() => excluir(perfil)}
                        disabled={perfil.QTD_USUARIOS > 0}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PerfilModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        titulo={perfilEditando ? `Editar perfil — ${perfilEditando.NOME}` : "Novo perfil"}
        valoresIniciais={
          perfilEditando
            ? { nome: perfilEditando.NOME, descricao: perfilEditando.DESCRICAO ?? "" }
            : VALORES_VAZIOS
        }
        onSalvar={salvar}
      />
    </div>
  )
}
