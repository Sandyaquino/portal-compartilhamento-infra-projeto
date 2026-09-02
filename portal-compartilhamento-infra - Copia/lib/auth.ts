import { API_BASE_URL } from "@/lib/config"
import { getToken } from "@/lib/session"

export type CurrentUser = {
  login: string
  nome: string
  email: string
  perfil: string
  perfilId: number | null
}

export type Permissao = {
  PERFIL_ID: number
  MODULO_ID: number
  VISUALIZAR: string
  EDITAR: string
  EXCLUIR: string
  EXPORTAR: string
}

export async function getCurrentUser(): Promise<{
  user: CurrentUser
  permissoes: Permissao[]
  funcionalidades: string[]
}> {
  const token = getToken()

  if (!token) {
    throw new Error("Usuário não autenticado")
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Erro ao carregar usuário")
  }

  const data = await response.json()

  return {
    user: {
      login: data.usuario?.LOGIN,
      nome: data.usuario?.NOME,
      email: data.usuario?.EMAIL,
      perfil: data.usuario?.PERFIL,
      perfilId: data.usuario?.PERFIL_ID ?? null,
    },
    permissoes: data.permissoes ?? [],
    funcionalidades: data.funcionalidades ?? [],
  }
}
