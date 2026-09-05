"use strict"

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

const LIMITE_PONTOS_MAPA = 3000
const STATUS_VALIDOS_POSTE = ["identificado", "nao_identificado"]
const STATUS_VALIDOS_ACAO = ["ABERTA", "CANCELADA", "CONCLUIDA"]
const TIPOS_VALIDOS_ACAO = ["FISCALIZACAO", "ORDENAMENTO", "REMOCAO"]
const SATURACOES_VALIDAS = ["disponivel", "quase", "esgotado", "sobrecarga"]

// Mesmos limiares do frontend (lib/types/postes.ts -> nivelSaturacao).
function nivelSaturacao(ocupados, capacidade) {
  if (!capacidade || capacidade <= 0 || ocupados <= 0) return "disponivel"
  if (ocupados > capacidade) return "sobrecarga"
  if (ocupados === capacidade) return "esgotado"
  if (ocupados / capacidade >= 0.6) return "quase"
  return "disponivel"
}

function numeroObrigatorio(query, nome) {
  const valor = query.get(nome)
  if (valor === null || valor === "") return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function filtrarPorBoundsEStatusEOperadoras(query) {
  const min_x = numeroObrigatorio(query, "min_x")
  const max_x = numeroObrigatorio(query, "max_x")
  const min_y = numeroObrigatorio(query, "min_y")
  const max_y = numeroObrigatorio(query, "max_y")
  const status = query.get("status")
  const saturacao = query.get("saturacao")
  const idsOperadora = query.getAll("id_operadora").map(Number).filter(Number.isFinite)

  let lista = db.postes.filter((p) => p.X >= min_x && p.X <= max_x && p.Y >= min_y && p.Y <= max_y)

  if (status === "identificado") {
    lista = lista.filter((p) => p.TEM_OCUPACAO_IDENTIFICADA === "S")
  } else if (status === "nao_identificado") {
    lista = lista.filter((p) => p.TEM_OCUPACAO_IDENTIFICADA === "N")
  }

  if (saturacao) {
    lista = lista.filter((p) => nivelSaturacao(p.PONTOS_OCUPADOS, p.CAPACIDADE) === saturacao)
  }

  if (idsOperadora.length) {
    const barramentosDaOperadora = new Set(
      db.ocupacoes.filter((o) => idsOperadora.includes(o._idOperadora)).map((o) => o.BARRAMENTO)
    )
    lista = lista.filter((p) => barramentosDaOperadora.has(p.BARRAMENTO))
  }

  return { lista, min_x, max_x, min_y, max_y, status, saturacao }
}

function registrar(router) {
  router.get("/api/postes/mapa", (req, res, ctx) => {
    const status = ctx.query.get("status")
    if (status && !STATUS_VALIDOS_POSTE.includes(status)) {
      return erroDetalhe(res, 400, `status deve ser um de: ${STATUS_VALIDOS_POSTE.join(", ")}`)
    }
    const saturacao = ctx.query.get("saturacao")
    if (saturacao && !SATURACOES_VALIDAS.includes(saturacao)) {
      return erroDetalhe(res, 400, `saturacao deve ser um de: ${SATURACOES_VALIDAS.join(", ")}`)
    }

    const { lista, min_x, max_x, min_y, max_y } = filtrarPorBoundsEStatusEOperadoras(ctx.query)
    if ([min_x, max_x, min_y, max_y].some((v) => v === null)) {
      return erroDetalhe(res, 400, "Informe min_x, max_x, min_y e max_y")
    }

    const truncado = lista.length > LIMITE_PONTOS_MAPA
    const postesResposta = (truncado ? lista.slice(0, LIMITE_PONTOS_MAPA) : lista).map((p) => ({
      BARRAMENTO: p.BARRAMENTO,
      X: p.X,
      Y: p.Y,
      TEM_OCUPACAO_IDENTIFICADA: p.TEM_OCUPACAO_IDENTIFICADA,
      CAPACIDADE: p.CAPACIDADE,
      PONTOS_OCUPADOS: p.PONTOS_OCUPADOS,
    }))

    enviarJson(res, 200, { postes: postesResposta, truncado })
  })

  router.get("/api/postes/:barramento/ocupacoes", (req, res, ctx) => {
    const poste = db.postes.find((p) => p.BARRAMENTO === ctx.params.barramento)
    if (!poste) return erroDetalhe(res, 404, "Poste não encontrado")

    const lista = db.ocupacoes
      .filter((o) => o.BARRAMENTO === ctx.params.barramento)
      .sort((a, b) => a.BOARD_NAME.localeCompare(b.BOARD_NAME))
      .map((o) => ({
        ID: o.ID,
        BOARD_NAME: o.BOARD_NAME,
        ORGANIZATION_NAME: o.ORGANIZATION_NAME,
        CNPJ: o.CNPJ,
        RAZAO_SOCIAL: o.RAZAO_SOCIAL,
      }))

    enviarJson(res, 200, lista)
  })

  router.get("/api/postes/operadoras", (req, res) => {
    const lista = db.operadoras
      .map((op) => ({
        ID: op.ID,
        RAZAO_SOCIAL: op.RAZAO_SOCIAL,
        CNPJ: op.CNPJ,
        TOTAL_OCUPACOES: db.ocupacoes.filter((o) => o._idOperadora === op.ID).length,
      }))
      .sort((a, b) => a.RAZAO_SOCIAL.localeCompare(b.RAZAO_SOCIAL))

    enviarJson(res, 200, lista)
  })

  router.get("/api/postes/resumo", (req, res) => {
    const total_postes = db.postes.length
    const total_ocupacoes = db.ocupacoes.length
    const postes_identificados = db.postes.filter((p) => p.TEM_OCUPACAO_IDENTIFICADA === "S").length
    const percentual_identificado = total_postes
      ? Math.round((postes_identificados / total_postes) * 1000) / 10
      : 0
    const postes_esgotados = db.postes.filter((p) => p.PONTOS_OCUPADOS >= p.CAPACIDADE).length
    const postes_sobrecarga = db.postes.filter((p) => p.PONTOS_OCUPADOS > p.CAPACIDADE).length

    enviarJson(res, 200, {
      total_postes,
      total_ocupacoes,
      postes_identificados,
      percentual_identificado,
      postes_esgotados,
      postes_sobrecarga,
    })
  })

  router.get("/api/postes/densidade", (req, res, ctx) => {
    const status = ctx.query.get("status")
    if (status && !STATUS_VALIDOS_POSTE.includes(status)) {
      return erroDetalhe(res, 400, `status deve ser um de: ${STATUS_VALIDOS_POSTE.join(", ")}`)
    }
    const saturacao = ctx.query.get("saturacao")
    if (saturacao && !SATURACOES_VALIDAS.includes(saturacao)) {
      return erroDetalhe(res, 400, `saturacao deve ser um de: ${SATURACOES_VALIDAS.join(", ")}`)
    }

    const { lista, min_x, max_x, min_y, max_y } = filtrarPorBoundsEStatusEOperadoras(ctx.query)
    if ([min_x, max_x, min_y, max_y].some((v) => v === null) || max_x <= min_x || max_y <= min_y) {
      return erroDetalhe(res, 400, "bounds inválidos")
    }

    let grade = Number(ctx.query.get("grade")) || 24
    grade = Math.min(60, Math.max(4, grade))

    const passoX = (max_x - min_x) / grade
    const passoY = (max_y - min_y) / grade
    const celulas = []
    let maior_qtd = 0

    for (let i = 0; i < grade; i++) {
      for (let j = 0; j < grade; j++) {
        const cMinX = min_x + i * passoX
        const cMaxX = cMinX + passoX
        const cMinY = min_y + j * passoY
        const cMaxY = cMinY + passoY
        const qtd = lista.filter((p) => p.X >= cMinX && p.X < cMaxX && p.Y >= cMinY && p.Y < cMaxY).length
        if (qtd > 0) {
          celulas.push({ min_x: cMinX, max_x: cMaxX, min_y: cMinY, max_y: cMaxY, qtd })
          if (qtd > maior_qtd) maior_qtd = qtd
        }
      }
    }

    enviarJson(res, 200, { celulas, maior_qtd })
  })

  router.post("/api/postes/acoes", async (req, res, ctx) => {
    const corpo = ctx.body
    const tipo = corpo.tipo
    const barramentos = Array.isArray(corpo.barramentos) ? corpo.barramentos : []

    if (!TIPOS_VALIDOS_ACAO.includes(tipo)) {
      return erroDetalhe(res, 400, `tipo deve ser um de: ${TIPOS_VALIDOS_ACAO.join(", ")}`)
    }
    if (!barramentos.length) {
      return erroDetalhe(res, 400, "Informe ao menos um poste (barramentos)")
    }

    const id_acao = db.novaAcao({
      tipo,
      titulo: corpo.titulo ?? null,
      responsavel: corpo.responsavel ?? null,
      prazo: corpo.prazo ?? null,
      status: "ABERTA",
      qtdPostes: barramentos.length,
      bounds: corpo.bounds ?? null,
      observacao: corpo.observacao ?? null,
      criadoPor: corpo.criado_por ?? null,
      barramentos,
    })

    enviarJson(res, 200, { id_acao, qtd_postes: barramentos.length })
  })

  router.get("/api/postes/acoes", (req, res, ctx) => {
    const tipo = ctx.query.get("tipo")
    const status = ctx.query.get("status")
    const responsavel = ctx.query.get("responsavel")

    let lista = db.acoes
    if (tipo) lista = lista.filter((a) => a.TIPO === tipo)
    if (status) lista = lista.filter((a) => a.STATUS === status)
    if (responsavel) lista = lista.filter((a) => a.RESPONSAVEL === responsavel)

    lista = [...lista].sort((a, b) => {
      const prazo = String(a.PRAZO ?? "").localeCompare(String(b.PRAZO ?? ""))
      if (prazo !== 0) return prazo
      return String(b.CREATED_AT).localeCompare(String(a.CREATED_AT))
    })

    enviarJson(
      res,
      200,
      lista.map(({ _barramentos, ...campos }) => campos)
    )
  })

  router.get("/api/postes/acoes/:id", (req, res, ctx) => {
    const acao = db.acoes.find((a) => a.ID_ACAO === Number(ctx.params.id))
    if (!acao) return erroDetalhe(res, 404, "Ação não encontrada")

    const { _barramentos, ...campos } = acao
    const postesDaAcao = (_barramentos || []).map((barramento) => {
      const poste = db.postes.find((p) => p.BARRAMENTO === barramento)
      return { BARRAMENTO: barramento, X: poste ? poste.X : null, Y: poste ? poste.Y : null }
    })

    enviarJson(res, 200, { ...campos, postes: postesDaAcao })
  })

  // Postes de uma operadora (todos, sem recorte de viewport) - alimenta o
  // "Ver no mapa" da barra lateral, que dá fitBounds em cima do parque dela.
  router.get("/api/postes/por-operadora", (req, res, ctx) => {
    const id = Number(ctx.query.get("id_operadora"))
    if (!Number.isFinite(id)) return erroDetalhe(res, 400, "Informe id_operadora")

    const barramentos = new Set(
      db.ocupacoes.filter((o) => o._idOperadora === id).map((o) => o.BARRAMENTO)
    )
    const lista = db.postes
      .filter((p) => barramentos.has(p.BARRAMENTO))
      .map((p) => ({ BARRAMENTO: p.BARRAMENTO, X: p.X, Y: p.Y }))

    enviarJson(res, 200, lista)
  })

  // Municípios em que a operadora tem postes ocupados (via Base Coelba, que
  // é onde mora o MUNICIPIO). Cada item traz a caixa (bounds) pra o mapa dar
  // fitBounds direto nos pontos da operadora naquele município.
  router.get("/api/postes/operadora-municipios", (req, res, ctx) => {
    const bruto = ctx.query.get("id_operadora")
    const id = Number(bruto)
    if (!bruto || !Number.isFinite(id)) return erroDetalhe(res, 400, "Informe id_operadora")

    const barramentos = new Set(
      db.ocupacoes.filter((o) => o._idOperadora === id).map((o) => o.BARRAMENTO)
    )
    const porMunicipio = new Map()
    for (const bp of db.basePostes) {
      if (bp.ATIVO === "N" || !barramentos.has(bp.DE_BARRAMENTO)) continue
      let m = porMunicipio.get(bp.MUNICIPIO)
      if (!m) {
        m = {
          MUNICIPIO: bp.MUNICIPIO,
          _barr: new Set(),
          min_x: Infinity,
          max_x: -Infinity,
          min_y: Infinity,
          max_y: -Infinity,
        }
        porMunicipio.set(bp.MUNICIPIO, m)
      }
      m._barr.add(bp.DE_BARRAMENTO)
      m.min_x = Math.min(m.min_x, bp.NU_LONGITUDE)
      m.max_x = Math.max(m.max_x, bp.NU_LONGITUDE)
      m.min_y = Math.min(m.min_y, bp.NU_LATITUDE)
      m.max_y = Math.max(m.max_y, bp.NU_LATITUDE)
    }

    const lista = [...porMunicipio.values()]
      .map((m) => ({
        MUNICIPIO: m.MUNICIPIO,
        TOTAL: m._barr.size,
        min_x: m.min_x,
        max_x: m.max_x,
        min_y: m.min_y,
        max_y: m.max_y,
      }))
      .sort((a, b) => b.TOTAL - a.TOTAL || a.MUNICIPIO.localeCompare(b.MUNICIPIO))

    enviarJson(res, 200, lista)
  })

  router.patch("/api/postes/acoes/:id", async (req, res, ctx) => {
    const acao = db.acoes.find((a) => a.ID_ACAO === Number(ctx.params.id))
    if (!acao) return erroDetalhe(res, 404, "Ação não encontrada")

    const corpo = ctx.body
    if (corpo.status !== undefined && corpo.status !== null && !STATUS_VALIDOS_ACAO.includes(corpo.status)) {
      return erroDetalhe(res, 400, `status deve ser um de: ${[...STATUS_VALIDOS_ACAO].sort().join(", ")}`)
    }

    const campos = ["responsavel", "prazo", "status", "observacao"]
    const mapaCampo = { responsavel: "RESPONSAVEL", prazo: "PRAZO", status: "STATUS", observacao: "OBSERVACAO" }
    let alterou = false

    for (const campo of campos) {
      if (corpo[campo] !== undefined && corpo[campo] !== null) {
        acao[mapaCampo[campo]] = corpo[campo]
        alterou = true
      }
    }

    if (!alterou) {
      return enviarJson(res, 200, { mensagem: "Nada para atualizar" })
    }

    acao.UPDATED_AT = db.agora()
    enviarJson(res, 200, { success: true })
  })

  // Poste único por barramento - alimenta a busca "Ir para poste" do mapa.
  // Registrado por último de propósito: o padrão :barramento (um segmento)
  // casaria com /api/postes/mapa, /resumo, /operadoras, etc., então precisa
  // ficar depois de todas as rotas literais de /api/postes/*.
  router.get("/api/postes/:barramento", (req, res, ctx) => {
    const poste = db.postes.find((p) => p.BARRAMENTO === ctx.params.barramento)
    if (!poste) return erroDetalhe(res, 404, "Poste não encontrado")

    enviarJson(res, 200, {
      BARRAMENTO: poste.BARRAMENTO,
      X: poste.X,
      Y: poste.Y,
      TEM_OCUPACAO_IDENTIFICADA: poste.TEM_OCUPACAO_IDENTIFICADA,
      CAPACIDADE: poste.CAPACIDADE,
      PONTOS_OCUPADOS: poste.PONTOS_OCUPADOS,
    })
  })
}

module.exports = { registrar }
