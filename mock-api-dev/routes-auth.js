"use strict"

const { enviarJson, erroDetalhe, extrairBearer } = require("./util")

const USUARIO_FICTICIO = {
  LOGIN: "dev.local",
  NOME: "Usuário de Desenvolvimento",
  EMAIL: "dev@local.test",
  PERFIL_ID: 1,
  PERFIL: "Administrador",
  STATUS: "A",
}

const FUNCIONALIDADES_FICTICIAS = ["EDITAR_CADASTRO_TECNICO", "EDITAR_CADASTRO_EQUIPE"]

// email (minusculo) -> { codigo, expiraEm }
const codigosOtp = new Map()

function criarToken(usuario) {
  const payload = { ...usuario, criadoEm: Date.now() }
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url")
}

function lerToken(token) {
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf-8"))
  } catch {
    return null
  }
}

function registrar(router) {
  const enviarCodigo = async (req, res, ctx) => {
    const email = (ctx.body.email || "").trim().toLowerCase()
    if (!email || !email.includes("@")) {
      return erroDetalhe(res, 400, "Informe um e-mail válido")
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000))
    const expiraEm = Date.now() + 10 * 60 * 1000
    codigosOtp.set(email, { codigo, expiraEm })

    console.log(`[mock-api-dev] código gerado para ${email}: ${codigo}`)

    enviarJson(res, 200, {
      success: true,
      mensagem: "Código de acesso gerado com sucesso em modo desenvolvimento (mock).",
      email,
      expira_em: new Date(expiraEm).toISOString(),
      codigo_teste: codigo,
    })
  }

  const validarCodigo = async (req, res, ctx) => {
    const email = (ctx.body.email || "").trim().toLowerCase()
    const codigo = (ctx.body.codigo || "").trim()

    const registro = codigosOtp.get(email)
    if (!registro || registro.codigo !== codigo || registro.expiraEm < Date.now()) {
      return erroDetalhe(res, 401, "Código inválido ou expirado")
    }
    codigosOtp.delete(email)

    const usuario = { ...USUARIO_FICTICIO, EMAIL: email }
    const token = criarToken(usuario)

    enviarJson(res, 200, {
      success: true,
      token,
      usuario: {
        login: usuario.LOGIN,
        nome: usuario.NOME,
        email: usuario.EMAIL,
        perfil_id: usuario.PERFIL_ID,
        perfil: usuario.PERFIL,
      },
    })
  }

  const me = (req, res) => {
    const token = extrairBearer(req)
    const usuario = token ? lerToken(token) : null
    if (!usuario) return erroDetalhe(res, 401, "Token não informado ou inválido")

    enviarJson(res, 200, {
      success: true,
      usuario,
      permissoes: [],
      funcionalidades: FUNCIONALIDADES_FICTICIAS,
    })
  }

  router.post("/auth/enviar-codigo", enviarCodigo)
  router.post("/api/auth/enviar-codigo", enviarCodigo)
  router.post("/auth/validar-codigo", validarCodigo)
  router.post("/api/auth/validar-codigo", validarCodigo)
  router.get("/auth/me", me)
  router.get("/api/auth/me", me)
}

module.exports = { registrar }
