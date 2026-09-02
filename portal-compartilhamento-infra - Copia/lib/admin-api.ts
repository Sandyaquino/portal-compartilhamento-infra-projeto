import { API_BASE_URL } from "@/lib/config"
import { getToken } from "@/lib/session"

export function ehPerfilAdministrador(perfil?: string | null) {
  return (perfil ?? "").trim().toUpperCase() === "ADMINISTRADOR"
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    let detail = ""
    try {
      const body = await response.json()
      detail = body?.detail || ""
    } catch {
      detail = await response.text().catch(() => "")
    }
    throw new Error(detail || `Erro ${response.status}`)
  }

  if (response.status === 204) return undefined as T

  return response.json()
}
