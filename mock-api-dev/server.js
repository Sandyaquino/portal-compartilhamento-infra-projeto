// Mock API para desenvolvimento local do frontend, sem depender do SAP HANA
// nem do backend real (portal-api). Fica FORA das pastas dos projetos reais
// de propósito: nenhum arquivo do frontend ou do backend é alterado, então
// o comportamento no ambiente corporativo (apontando para a API real) continua
// intacto. Roda na porta 8000, a mesma que lib/config.ts já usa como padrão
// (NEXT_PUBLIC_API_URL || "http://localhost:8000"), então não precisa
// configurar nada no frontend para usar este mock.
//
// Módulos cobertos até agora: autenticação (auth), Mapa de Postes (postes) e
// Comercial: Novos Entrantes + Processos (entrantes, processos), todos com
// dados fictícios em memória (mock-api-dev/db.js) e suportando as operações
// de criar/editar/avançar, não só listar.
//
// Requisições para rotas ainda sem fixture aparecem no console como
// "sem mock:" pra facilitar saber o que falta conforme mais telas forem
// sendo testadas.

const http = require("http")

const { Router, aplicarCors, enviarJson, lerCorpoJson } = require("./util")

const PORT = process.env.MOCK_API_PORT || 8000

const router = new Router()

require("./routes-auth").registrar(router)
require("./routes-postes").registrar(router)
require("./routes-entrantes").registrar(router)
require("./routes-processos").registrar(router)
require("./routes-provedores").registrar(router)
require("./routes-operacao").registrar(router)
require("./routes-projetos").registrar(router)
require("./routes-tarefas").registrar(router)

router.get("/", (req, res) => {
  enviarJson(res, 200, { status: "online (mock-api-dev)" })
})

const server = http.createServer(async (req, res) => {
  aplicarCors(req, res)

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const encontrada = router.encontrar(req.method, url.pathname)

  if (!encontrada) {
    console.log(`[mock-api-dev] sem mock: ${req.method} ${url.pathname}`)
    return enviarJson(res, 404, { detail: `Endpoint fictício ainda não implementado: ${req.method} ${url.pathname}` })
  }

  try {
    const corpo = req.method === "GET" || req.method === "DELETE" ? {} : await lerCorpoJson(req)
    await encontrada.handler(req, res, { params: encontrada.params, query: url.searchParams, body: corpo })
  } catch (erro) {
    console.error("[mock-api-dev] erro:", erro)
    enviarJson(res, 500, { detail: "Erro interno do mock" })
  }
})

server.listen(PORT, () => {
  console.log(`[mock-api-dev] rodando em http://localhost:${PORT}`)
})
