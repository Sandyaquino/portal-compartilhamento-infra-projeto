"use strict"

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
])

function aplicarCors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  }
  res.setHeader("Access-Control-Allow-Methods", "*")
  res.setHeader("Access-Control-Allow-Headers", "*")
}

function enviarJson(res, status, corpo) {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(texto)
}

function erroDetalhe(res, status, detail) {
  enviarJson(res, status, { detail })
}

function lerCorpoJson(req) {
  return new Promise((resolve, reject) => {
    let dados = ""
    req.on("data", (pedaco) => {
      dados += pedaco
    })
    req.on("end", () => {
      if (!dados) return resolve({})
      try {
        resolve(JSON.parse(dados))
      } catch (erro) {
        reject(erro)
      }
    })
    req.on("error", reject)
  })
}

function extrairBearer(req) {
  const auth = req.headers["authorization"] || ""
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim()
  }
  return null
}

// Router simples com suporte a params (:nome) no path. Cada rota casa
// método + padrão de path; o primeiro match vence.
class Router {
  constructor() {
    this.rotas = []
  }

  add(method, path, handler) {
    const nomes = []
    const regexStr =
      "^" +
      path.replace(/:[^/]+/g, (trecho) => {
        nomes.push(trecho.slice(1))
        return "([^/]+)"
      }) +
      "$"
    this.rotas.push({ method, regex: new RegExp(regexStr), nomes, handler })
  }

  get(path, handler) {
    this.add("GET", path, handler)
  }

  post(path, handler) {
    this.add("POST", path, handler)
  }

  patch(path, handler) {
    this.add("PATCH", path, handler)
  }

  delete(path, handler) {
    this.add("DELETE", path, handler)
  }

  encontrar(method, pathname) {
    for (const rota of this.rotas) {
      if (rota.method !== method) continue
      const m = rota.regex.exec(pathname)
      if (m) {
        const params = {}
        rota.nomes.forEach((nome, i) => {
          params[nome] = decodeURIComponent(m[i + 1])
        })
        return { handler: rota.handler, params }
      }
    }
    return null
  }
}

module.exports = {
  aplicarCors,
  enviarJson,
  erroDetalhe,
  lerCorpoJson,
  extrairBearer,
  Router,
}
