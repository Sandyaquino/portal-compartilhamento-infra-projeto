export async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" })

    if (!response.ok) {
      const texto = await response.text().catch(() => "")
      console.error("Erro na API:", url, response.status, texto)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("Erro ao carregar API:", url, error)
    return null
  }
}

export async function fetchJsonOrThrow<T>(url: string, mensagemErro: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    const texto = await response.text().catch(() => "")
    throw new Error(`${mensagemErro} | Status ${response.status} | ${texto}`)
  }

  return response.json()
}
