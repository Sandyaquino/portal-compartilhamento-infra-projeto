"use client"

import { useEffect, useState } from "react"

import { API_BASE_URL } from "@/lib/config"
import type { Notification } from "@/components/ui/notification-banner"

export type EntranteDetail = {
  ID_ENTRADA?: number | null
  ID_FORMS?: string | null
  STATUS_ENTRADA?: string | null
  DATA_RECEBIMENTO?: string | null
  DATA_IMPORTACAO?: string | null
  ID_PROCESSO?: number | null
  ID_PROVEDOR?: number | null
  RAZAO_SOCIAL?: string | null
  NOME_FANTASIA?: string | null
  CNPJ?: string | null
  LOGRADOURO?: string | null
  NUMERO_ENDERECO?: string | null
  BAIRRO?: string | null
  CEP?: string | null
  MUNICIPIO?: string | null
  UF?: string | null
  EMAIL_CONTATO?: string | null
  TELEFONE_CONTATO?: string | null
  NOME_RESPONSAVEL?: string | null
  CPF_RESPONSAVEL?: string | null
  RG_RESPONSAVEL?: string | null
  EMAIL_RESPONSAVEL?: string | null
  TELEFONE_RESPONSAVEL?: string | null
}

export function useEntranteDetalhe(id: string | undefined) {
  const [entrante, setEntrante] = useState<EntranteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<Notification | null>(null)

  useEffect(() => {
    if (!id) return

    let cancelled = false

    async function carregarDetalhe() {
      try {
        setLoading(true)
        setNotification(null)

        const response = await fetch(
          `${API_BASE_URL}/api/novos-entrantes/entrada/${id}`,
          { cache: "no-store" }
        )

        if (!response.ok) {
          const texto = await response.text()
          if (!cancelled) {
            setNotification({ type: "error", message: `Erro ao carregar entrante: ${texto}` })
            setEntrante(null)
          }
          return
        }

        const data = await response.json()
        if (!cancelled) {
          setEntrante(data)
        }
      } catch (error) {
        console.error("Erro ao carregar detalhe do entrante:", error)
        if (!cancelled) {
          setNotification({ type: "error", message: "Não foi possível carregar os dados do entrante." })
          setEntrante(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    carregarDetalhe()

    return () => {
      cancelled = true
    }
  }, [id])

  return { entrante, setEntrante, loading, notification, setNotification }
}
