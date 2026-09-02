"use client"

import { useEffect, useMemo, useState } from "react"

import { API_BASE_URL } from "@/lib/config"

export type Entrante = {
  ID?: number | string | null
  ID_ENTRADA?: number | string | null
  DATA_RECEBIMENTO?: string | null
  RAZAO_SOCIAL?: string | null
  NOME_FANTASIA?: string | null
  CNPJ?: string | null
  MUNICIPIO?: string | null
  UF?: string | null
  QTD_POSTES?: number | string | null
  POSSUI_GEOS?: string | null
  STATUS_ENTRADA?: string | null
  MOTIVO_DESCARTE?: string | null
  ID_PROCESSO?: number | string | null
  CREATED_BY?: string | null
  RESPONSAVEL_ANALISE?: string | null
  PRAZO_ANALISE?: string | null
}

export const ESTAGIOS_ATIVOS = ["NOVO", "ANALISADO", "PROVEDOR_CRIADO", "PROCESSO_CRIADO"]

export function getEntranteId(item: Entrante): number | string | null {
  return item.ID_ENTRADA ?? item.ID ?? null
}

export function normalizar(valor: unknown) {
  return String(valor ?? "")
}

export function normalizarStatus(status?: string | null) {
  const s = normalizar(status).trim().toUpperCase()
  return s || "NOVO"
}

export function formatarData(valor?: string | null) {
  if (!valor) return "-"

  const data = new Date(valor)

  if (Number.isNaN(data.getTime())) return String(valor)

  return data.toLocaleString("pt-BR")
}

export function formatarNumero(valor: number | string | null | undefined) {
  const numero = Number(valor ?? 0)

  if (Number.isNaN(numero)) return "0"

  return numero.toLocaleString("pt-BR")
}

export function statusClass(status?: string | null) {
  const s = normalizarStatus(status)

  if (s === "ANALISADO") {
    return "bg-amber-100 text-amber-700 border border-amber-200"
  }
  if (s === "PROVEDOR_CRIADO") {
    return "bg-green-100 text-green-700 border border-green-200"
  }
  if (s === "PROCESSO_CRIADO") {
    return "bg-blue-100 text-blue-700 border border-blue-200"
  }
  if (s === "DESCARTADO") {
    return "bg-red-100 text-red-700 border border-red-200"
  }

  return "bg-slate-100 text-slate-700 border border-slate-200"
}

export function statusLabel(status?: string | null) {
  const s = normalizarStatus(status)

  if (s === "PROVEDOR_CRIADO") return "PROVEDOR CRIADO"
  if (s === "PROCESSO_CRIADO") return "PROCESSO CRIADO"

  return s
}

export function getErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback

  const obj = data as Record<string, unknown>

  if (typeof obj.detail === "string") return obj.detail
  if (typeof obj.message === "string") return obj.message
  if (typeof obj.mensagem === "string") return obj.mensagem

  return fallback
}

export function useListaEntrantes() {
  const [entrantes, setEntrantes] = useState<Entrante[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroRazao, setFiltroRazao] = useState("")
  const [filtroCNPJ, setFiltroCNPJ] = useState("")
  const [filtroMunicipio, setFiltroMunicipio] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")
  const [mostrarDescartados, setMostrarDescartados] = useState(false)

  const [sortField, setSortField] = useState<keyof Entrante>("DATA_RECEBIMENTO")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const [pagina, setPagina] = useState(1)
  const tamanhoPagina = 25

  async function carregarEntrantes() {
    try {
      setLoading(true)

      const response = await fetch(`${API_BASE_URL}/api/novos-entrantes`, {
        cache: "no-store",
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("ENTRANTES", response.status, errorText)
        throw new Error(`Erro ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      setEntrantes(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Erro ao carregar entrantes:", error)
      setEntrantes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarEntrantes()
  }, [])

  function handleSort(field: keyof Entrante) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
    setPagina(1)
  }

  function atualizarFiltro(setter: (valor: string) => void) {
    return (valor: string) => {
      setter(valor)
      setPagina(1)
    }
  }

  const filteredEntrantes = useMemo(() => {
    const razaoFiltro = filtroRazao.trim().toLowerCase()
    const cnpjFiltro = filtroCNPJ.trim().toLowerCase()
    const municipioFiltro = filtroMunicipio.trim().toLowerCase()
    const statusFiltro = filtroStatus.trim().toLowerCase()

    const resultado = entrantes.filter((item) => {
      const status = normalizarStatus(item.STATUS_ENTRADA)

      if (!mostrarDescartados && status === "DESCARTADO") return false

      const razao = normalizar(item.RAZAO_SOCIAL).toLowerCase()
      const nomeFantasia = normalizar(item.NOME_FANTASIA).toLowerCase()
      const cnpj = normalizar(item.CNPJ).toLowerCase()
      const municipio = normalizar(item.MUNICIPIO).toLowerCase()

      return (
        (razao.includes(razaoFiltro) || nomeFantasia.includes(razaoFiltro)) &&
        cnpj.includes(cnpjFiltro) &&
        municipio.includes(municipioFiltro) &&
        status.toLowerCase().includes(statusFiltro)
      )
    })

    resultado.sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (sortField === "ID_ENTRADA" || sortField === "QTD_POSTES") {
        const numA = Number(aValue ?? 0)
        const numB = Number(bValue ?? 0)
        return sortDirection === "asc" ? numA - numB : numB - numA
      }

      if (sortField === "DATA_RECEBIMENTO") {
        const dataA = new Date(String(aValue ?? "")).getTime() || 0
        const dataB = new Date(String(bValue ?? "")).getTime() || 0
        return sortDirection === "asc" ? dataA - dataB : dataB - dataA
      }

      return sortDirection === "asc"
        ? String(aValue ?? "").localeCompare(String(bValue ?? ""))
        : String(bValue ?? "").localeCompare(String(aValue ?? ""))
    })

    return resultado
  }, [entrantes, filtroRazao, filtroCNPJ, filtroMunicipio, filtroStatus, mostrarDescartados, sortField, sortDirection])

  const ultimoRegistro = useMemo(() => {
    if (entrantes.length === 0) return null

    return [...entrantes].sort((a, b) => {
      const dataA = new Date(normalizar(a.DATA_RECEBIMENTO)).getTime() || 0
      const dataB = new Date(normalizar(b.DATA_RECEBIMENTO)).getTime() || 0
      return dataB - dataA
    })[0]
  }, [entrantes])

  const totalPaginas = Math.max(1, Math.ceil(filteredEntrantes.length / tamanhoPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)

  const paginatedEntrantes = useMemo(() => {
    const inicio = (paginaAtual - 1) * tamanhoPagina
    return filteredEntrantes.slice(inicio, inicio + tamanhoPagina)
  }, [filteredEntrantes, paginaAtual])

  return {
    entrantes,
    filteredEntrantes,
    paginatedEntrantes,
    pagina: paginaAtual,
    setPagina,
    totalPaginas,
    tamanhoPagina,
    loading,
    filtroRazao,
    setFiltroRazao: atualizarFiltro(setFiltroRazao),
    filtroCNPJ,
    setFiltroCNPJ: atualizarFiltro(setFiltroCNPJ),
    filtroMunicipio,
    setFiltroMunicipio: atualizarFiltro(setFiltroMunicipio),
    filtroStatus,
    setFiltroStatus: atualizarFiltro(setFiltroStatus),
    mostrarDescartados,
    setMostrarDescartados: (valor: boolean) => {
      setMostrarDescartados(valor)
      setPagina(1)
    },
    sortField,
    sortDirection,
    handleSort,
    carregarEntrantes,
    ultimoRegistro,
  }
}
