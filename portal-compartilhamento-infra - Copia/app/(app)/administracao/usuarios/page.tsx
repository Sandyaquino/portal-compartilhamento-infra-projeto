"use client"

import { useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Search } from "lucide-react"

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
import { UsuarioModal, type PerfilOpcao, type UsuarioFormValues } from "@/components/administracao/usuario-modal"
import { adminFetch, ehPerfilAdministrador } from "@/lib/admin-api"

type Usuario = {
  LOGIN: string
  NOME: string | null
  EMAIL: string | null
  PERFIL_ID: number | null
  PERFIL: string | null
  STATUS: string | null
  ULTIMO_LOGIN: string | null
  EMPRESA: string | null
  TELEFONE: string | null
}

const VALORES_VAZIOS: UsuarioFormValues = {
  login: "",
  nome: "",
  email: "",
  perfilId: "",
  empresa: "",
  telefone: "",
  status: "A",
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "Nunca acessou"
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return String(valor)
  return data.toLocaleString("pt-BR")
}

export default function AdministracaoUsuariosPage() {
  const { user, loading: carregandoUsuario } = useCurrentUser()
  const temAcesso = ehPerfilAdministrador(user?.perfil)

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [perfis, setPerfis] = useState<PerfilOpcao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [notification, setNotification] = useState<Notification | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      const [usuariosData, perfisData] = await Promise.all([
        adminFetch<Usuario[]>("/api/admin/usuarios"),
        adminFetch<PerfilOpcao[]>("/api/admin/perfis"),
      ])
      setUsuarios(usuariosData)
      setPerfis(perfisData)
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar usuários",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (temAcesso) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temAcesso])

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return usuarios
    return usuarios.filter((usuario) =>
      [usuario.LOGIN, usuario.NOME, usuario.EMAIL, usuario.PERFIL]
        .map((valor) => String(valor ?? "").toLowerCase())
        .some((valor) => valor.includes(termo)),
    )
  }, [usuarios, busca])

  function abrirCriacao() {
    setUsuarioEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(usuario: Usuario) {
    setUsuarioEditando(usuario)
    setModalAberto(true)
  }

  async function salvar(valores: UsuarioFormValues) {
    const payload = {
      nome: valores.nome.trim(),
      email: valores.email.trim(),
      perfil_id: Number(valores.perfilId),
      empresa: valores.empresa.trim() || null,
      telefone: valores.telefone.trim() || null,
    }

    if (usuarioEditando) {
      await adminFetch(`/api/admin/usuarios/${encodeURIComponent(usuarioEditando.LOGIN)}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, status: valores.status }),
      })
    } else {
      await adminFetch("/api/admin/usuarios", {
        method: "POST",
        body: JSON.stringify({ ...payload, login: valores.login.trim() }),
      })
    }

    setNotification({ type: "success", message: "Usuário salvo com sucesso!" })
    await carregar()
  }

  if (carregandoUsuario) return null
  if (!temAcesso) return <AcessoNegado />

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Usuários"
        description="Controle de quem pode acessar o portal e com qual perfil."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Administração", href: "/administracao" },
          { label: "Usuários" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 lg:w-[340px]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              placeholder="Pesquisar login, nome, e-mail, perfil..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <Button onClick={abrirCriacao} className="h-9 w-fit">
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        </div>

        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <TableHead className="p-2 text-left">Login</TableHead>
              <TableHead className="p-2 text-left">Nome</TableHead>
              <TableHead className="p-2 text-left">E-mail</TableHead>
              <TableHead className="p-2 text-left">Perfil</TableHead>
              <TableHead className="p-2 text-center">Status</TableHead>
              <TableHead className="p-2 text-left">Empresa</TableHead>
              <TableHead className="p-2 text-left">Último acesso</TableHead>
              <TableHead className="p-2 text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && usuariosFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState message="Nenhum usuário encontrado." />
                </TableCell>
              </TableRow>
            ) : (
              usuariosFiltrados.map((usuario) => (
                <TableRow key={usuario.LOGIN}>
                  <TableCell className="p-2 font-medium text-slate-800">{usuario.LOGIN}</TableCell>
                  <TableCell className="p-2 text-slate-700">{usuario.NOME ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{usuario.EMAIL ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{usuario.PERFIL ?? "-"}</TableCell>
                  <TableCell className="p-2 text-center">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        (usuario.STATUS ?? "A") === "A"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {(usuario.STATUS ?? "A") === "A" ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell className="p-2 text-slate-600">{usuario.EMPRESA ?? "-"}</TableCell>
                  <TableCell className="p-2 text-slate-600">{formatarDataHora(usuario.ULTIMO_LOGIN)}</TableCell>
                  <TableCell className="p-2 text-center">
                    <Button variant="ghost" size="icon-sm" onClick={() => abrirEdicao(usuario)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UsuarioModal
        open={modalAberto}
        onOpenChange={setModalAberto}
        titulo={usuarioEditando ? `Editar usuário — ${usuarioEditando.LOGIN}` : "Novo usuário"}
        modoEdicao={usuarioEditando !== null}
        perfis={perfis}
        valoresIniciais={
          usuarioEditando
            ? {
                login: usuarioEditando.LOGIN,
                nome: usuarioEditando.NOME ?? "",
                email: usuarioEditando.EMAIL ?? "",
                perfilId: usuarioEditando.PERFIL_ID ? String(usuarioEditando.PERFIL_ID) : "",
                empresa: usuarioEditando.EMPRESA ?? "",
                telefone: usuarioEditando.TELEFONE ?? "",
                status: usuarioEditando.STATUS ?? "A",
              }
            : VALORES_VAZIOS
        }
        onSalvar={salvar}
      />
    </div>
  )
}
