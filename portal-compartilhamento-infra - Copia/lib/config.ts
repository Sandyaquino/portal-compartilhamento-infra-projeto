// URL da API. Padrão: a "versão trabalho" (NEXT_PUBLIC_API_URL) ou o mock local.
//
// Fallback automático: se a versão trabalho não responder (rede fora, VPN
// caída, backend parado), o portal passa a usar o mock em localhost:8000
// sozinho — sem precisar mudar configuração. `API_BASE_URL` é um binding
// vivo (export let), então os `fetch(`${API_BASE_URL}/api/...`)` já
// existentes passam a apontar pro mock assim que a troca acontece.

const CONFIGURADA = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")
export const MOCK_API_URL = "http://localhost:8000"

export let API_BASE_URL = CONFIGURADA

let noMock = CONFIGURADA === MOCK_API_URL
export function usandoMock() {
  return noMock
}

function cairPraMock(motivo: string) {
  if (noMock) return
  noMock = true
  API_BASE_URL = MOCK_API_URL
  if (typeof console !== "undefined") {
    console.warn(`[api] ${motivo}; usando o mock local (${MOCK_API_URL}).`)
  }
}

// Sonda única no navegador: um GET curto na raiz da versão trabalho.
if (typeof window !== "undefined" && !noMock) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  fetch(`${CONFIGURADA}/`, { cache: "no-store", signal: ctrl.signal })
    .then((resposta) => {
      if (resposta.status >= 500) throw new Error(String(resposta.status))
    })
    .catch(() => cairPraMock("versão trabalho indisponível"))
    .finally(() => clearTimeout(timer))
}

// Wrapper resiliente por requisição: usa a versão trabalho e, se ela falhar
// (erro de rede ou 502/503/504), troca pro mock e repete a chamada uma vez.
export async function apiFetch(caminho: string, init?: RequestInit): Promise<Response> {
  const montar = () => `${API_BASE_URL}${caminho.startsWith("/") || caminho.startsWith("http") ? "" : "/"}${caminho}`
  try {
    const resposta = await fetch(montar(), init)
    if (resposta.status >= 502 && resposta.status <= 504 && !noMock) {
      cairPraMock(`versão trabalho respondeu ${resposta.status}`)
      return fetch(montar(), init)
    }
    return resposta
  } catch (erro) {
    if (!noMock) {
      cairPraMock("versão trabalho não respondeu")
      return fetch(montar(), init)
    }
    throw erro
  }
}
