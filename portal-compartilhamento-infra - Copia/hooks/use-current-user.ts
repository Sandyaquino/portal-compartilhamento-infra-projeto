"use client"

import { useEffect, useState } from "react"

import { getCurrentUser, type CurrentUser } from "@/lib/auth"

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [funcionalidades, setFuncionalidades] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadUser() {
      try {
        const { user, funcionalidades } = await getCurrentUser()

        if (!cancelled) {
          setUser(user)
          setFuncionalidades(funcionalidades)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar usuário"
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadUser()

    return () => {
      cancelled = true
    }
  }, [])

  return { user, funcionalidades, loading, error }
}
