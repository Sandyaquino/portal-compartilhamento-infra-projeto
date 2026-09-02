"use client"

import { useEffect, useState } from "react"

import { API_BASE_URL } from "@/lib/config"

export function useConsolidado() {
  const [dados, setDados] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function carregar() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/turma-campo/consolidado`
        )

        if (!response.ok) {
          throw new Error(`Erro ${response.status} ao carregar consolidado`)
        }

        const data = await response.json()

        if (!cancelled) {
          setDados(Array.isArray(data) ? data[0] ?? null : null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar consolidado"
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    carregar()

    return () => {
      cancelled = true
    }
  }, [])

  return { dados, loading, error }
}
