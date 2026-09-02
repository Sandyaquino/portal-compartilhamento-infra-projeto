import { API_BASE_URL as API_URL } from "@/lib/config"

export async function getConsolidado() {
  const response = await fetch(
    `${API_URL}/api/turma-campo/consolidado`,
    {
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error("Erro ao carregar consolidado")
  }

  return response.json()
}

export async function getHistoricoImportacoes() {
  const response = await fetch(
    `${API_URL}/api/turma-campo/importacoes`,
    {
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error("Erro ao carregar histórico")
  }

  return response.json()
}

export async function getConsolidadoTabela() {
  const response = await fetch(
    `${API_URL}/api/turma-campo/consolidado_tabela`,
    {
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error("Erro ao carregar tabela")
  }

  return response.json()
}
