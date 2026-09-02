"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Save } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner"
import { Button } from "@/components/ui/button"
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
import { adminFetch, ehPerfilAdministrador } from "@/lib/admin-api"

type Perfil = { ID: number; NOME: string }
type Modulo = { ID: number; CODIGO: string; NOME: string }
type Funcionalidade = {
  ID: number
  CODIGO: string
  NOME: string
  DESCRICAO: string | null
  MODULO_ID: number
  MODULO_NOME: string
}
type PermissaoModulo = {
  MODULO_ID: number
  VISUALIZAR: string | null
  EDITAR: string | null
  EXCLUIR: string | null
  EXPORTAR: string | null
}

type PermissaoLinha = {
  visualizar: boolean
  editar: boolean
  excluir: boolean
  exportar: boolean
}

function permissaoVazia(): PermissaoLinha {
  return { visualizar: false, editar: false, excluir: false, exportar: false }
}

export default function AdministracaoPermissoesPage() {
  const params = useParams<{ id: string }>()
  const perfilId = Number(params.id)
  const router = useRouter()

  const { user, loading: carregandoUsuario } = useCurrentUser()
  const temAcesso = ehPerfilAdministrador(user?.perfil)

  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidade[]>([])
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())
  const [permissoes, setPermissoes] = useState<Record<number, PermissaoLinha>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [notification, setNotification] = useState<Notification | null>(null)

  useEffect(() => {
    if (!temAcesso || !perfilId) return

    async function carregar() {
      setLoading(true)
      try {
        const [perfisData, modulosData, funcionalidadesData, funcionalidadesPerfil, permissoesPerfil] =
          await Promise.all([
            adminFetch<Perfil[]>("/api/admin/perfis"),
            adminFetch<Modulo[]>("/api/admin/modulos"),
            adminFetch<Funcionalidade[]>("/api/admin/funcionalidades"),
            adminFetch<{ funcionalidade_ids: number[] }>(`/api/admin/perfis/${perfilId}/funcionalidades`),
            adminFetch<PermissaoModulo[]>(`/api/admin/perfis/${perfilId}/permissoes`),
          ])

        setPerfil(perfisData.find((item) => item.ID === perfilId) ?? null)
        setModulos(modulosData)
        setFuncionalidades(funcionalidadesData)
        setSelecionadas(new Set(funcionalidadesPerfil.funcionalidade_ids))

        const mapaPermissoes: Record<number, PermissaoLinha> = {}
        for (const item of permissoesPerfil) {
          mapaPermissoes[item.MODULO_ID] = {
            visualizar: item.VISUALIZAR === "S",
            editar: item.EDITAR === "S",
            excluir: item.EXCLUIR === "S",
            exportar: item.EXPORTAR === "S",
          }
        }
        setPermissoes(mapaPermissoes)
      } catch (error) {
        setNotification({
          type: "error",
          message: error instanceof Error ? error.message : "Erro ao carregar permissões",
        })
      } finally {
        setLoading(false)
      }
    }

    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temAcesso, perfilId])

  const funcionalidadesPorModulo = useMemo(() => {
    const mapa = new Map<string, Funcionalidade[]>()
    for (const item of funcionalidades) {
      const lista = mapa.get(item.MODULO_NOME) ?? []
      lista.push(item)
      mapa.set(item.MODULO_NOME, lista)
    }
    return mapa
  }, [funcionalidades])

  function alternarFuncionalidade(id: number) {
    setSelecionadas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarPermissao(moduloId: number, campo: keyof PermissaoLinha) {
    setPermissoes((atual) => {
      const linha = atual[moduloId] ?? permissaoVazia()
      return { ...atual, [moduloId]: { ...linha, [campo]: !linha[campo] } }
    })
  }

  async function salvar() {
    setSalvando(true)
    try {
      const permissoesPayload = modulos
        .map((modulo) => ({ modulo_id: modulo.ID, ...(permissoes[modulo.ID] ?? permissaoVazia()) }))
        .filter((item) => item.visualizar || item.editar || item.excluir || item.exportar)

      await Promise.all([
        adminFetch(`/api/admin/perfis/${perfilId}/funcionalidades`, {
          method: "PUT",
          body: JSON.stringify({ funcionalidade_ids: Array.from(selecionadas) }),
        }),
        adminFetch(`/api/admin/perfis/${perfilId}/permissoes`, {
          method: "PUT",
          body: JSON.stringify({ permissoes: permissoesPayload }),
        }),
      ])

      setNotification({ type: "success", message: "Permissões salvas com sucesso!" })
    } catch (error) {
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao salvar permissões",
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregandoUsuario) return null
  if (!temAcesso) return <AcessoNegado />

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <PageHeader
        title={perfil ? `Permissões — ${perfil.NOME}` : "Permissões"}
        description="Funcionalidades atribuídas e matriz de permissão por módulo para este perfil."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Administração", href: "/administracao" },
          { label: "Perfis", href: "/administracao/perfis" },
          { label: perfil?.NOME ?? "Permissões" },
        ]}
      />

      <NotificationBanner notification={notification} />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push("/administracao/perfis")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para Perfis
        </Button>

        <Button onClick={salvar} disabled={loading || salvando}>
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          Carregando permissões...
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-900">Funcionalidades</h2>
        <p className="mb-4 text-sm text-slate-500">
          Ações pontuais liberadas para este perfil (ex.: editar um cadastro específico).
        </p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from(funcionalidadesPorModulo.entries()).map(([moduloNome, itens]) => (
            <div key={moduloNome} className="rounded-lg border border-slate-100 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{moduloNome}</p>
              <div className="space-y-2">
                {itens.map((funcionalidade) => (
                  <label key={funcionalidade.ID} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                      checked={selecionadas.has(funcionalidade.ID)}
                      onChange={() => alternarFuncionalidade(funcionalidade.ID)}
                    />
                    <span>
                      <span className="font-medium text-slate-800">{funcionalidade.NOME}</span>
                      {funcionalidade.DESCRICAO && (
                        <span className="block text-xs text-slate-500">{funcionalidade.DESCRICAO}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-900">Matriz de Permissões</h2>
        <p className="mb-4 text-sm text-slate-500">
          Controle de visualizar/editar/excluir/exportar por módulo do portal.
        </p>

        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <TableHead className="p-2 text-left">Módulo</TableHead>
              <TableHead className="p-2 text-center">Visualizar</TableHead>
              <TableHead className="p-2 text-center">Editar</TableHead>
              <TableHead className="p-2 text-center">Excluir</TableHead>
              <TableHead className="p-2 text-center">Exportar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.map((modulo) => {
              const linha = permissoes[modulo.ID] ?? permissaoVazia()
              return (
                <TableRow key={modulo.ID}>
                  <TableCell className="p-2 font-medium text-slate-800">{modulo.NOME}</TableCell>
                  {(["visualizar", "editar", "excluir", "exportar"] as const).map((campo) => (
                    <TableCell key={campo} className="p-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={linha[campo]}
                        onChange={() => alternarPermissao(modulo.ID, campo)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
