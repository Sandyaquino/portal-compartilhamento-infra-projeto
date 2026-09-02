"use strict"

// Base de Postes Coelba (cadastro de ativos). Espelha
// sql/PORTAL_COMPARTILHAMENTO_BASE_POSTE.sql.
//
// Estrategia de carga: a base e enorme, entao o mapa nunca carrega tudo.
//   - navegacao por MUNICIPIO -> LOCALIDADE (fitBounds)
//   - pontos individuais so quando a selecao e estreita (uma localidade,
//     ou bbox de viewport com area <= LIMITE_AREA_GRAUS2)
//   - fora disso, so agregacao (densidade por celula)
//   - teto de LIMITE_PONTOS + flag "truncado"
//
// Caso de uso central: selecionar postes SEM PROVEDOR numa area e gerar
// uma acao de FISCALIZACAO.

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

const LIMITE_PONTOS = 2000
const LIMITE_AREA_GRAUS2 = 0.02
const VINCULOS = ["todos", "sem_provedor", "com_provedor"]

function num(query, nome) {
  const v = query.get(nome)
  if (v === null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function bounds(lista) {
  if (!lista.length) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of lista) {
    if (p.NU_LONGITUDE < minX) minX = p.NU_LONGITUDE
    if (p.NU_LONGITUDE > maxX) maxX = p.NU_LONGITUDE
    if (p.NU_LATITUDE < minY) minY = p.NU_LATITUDE
    if (p.NU_LATITUDE > maxY) maxY = p.NU_LATITUDE
  }
  return { min_x: minX, max_x: maxX, min_y: minY, max_y: maxY }
}

function aplicarVinculo(lista, vinculo) {
  if (vinculo === "sem_provedor") return lista.filter((p) => !db.basePosteTemProvedor(p.DE_BARRAMENTO))
  if (vinculo === "com_provedor") return lista.filter((p) => db.basePosteTemProvedor(p.DE_BARRAMENTO))
  return lista
}

function serializar(p) {
  return {
    NU_PG_ID: p.NU_PG_ID,
    NU_LOCALIDADE_ID: p.NU_LOCALIDADE_ID,
    LOCALIDADE: p.LOCALIDADE,
    DE_BARRAMENTO: p.DE_BARRAMENTO,
    MUNICIPIO: p.MUNICIPIO,
    UF: p.UF,
    NU_LATITUDE: p.NU_LATITUDE,
    NU_LONGITUDE: p.NU_LONGITUDE,
    DATA_ATUALIZACAO: p.DATA_ATUALIZACAO,
    TEM_PROVEDOR: db.basePosteTemProvedor(p.DE_BARRAMENTO) ? "S" : "N",
  }
}

function registrar(router) {
  router.get("/api/base-postes/resumo", (req, res) => {
    const total = db.basePostes.length
    const comProvedor = db.basePostes.filter((p) => db.basePosteTemProvedor(p.DE_BARRAMENTO)).length
    const dataMax = db.basePostes.reduce((m, p) => (p.DATA_ATUALIZACAO > m ? p.DATA_ATUALIZACAO : m), "")
    enviarJson(res, 200, {
      total,
      com_provedor: comProvedor,
      sem_provedor: total - comProvedor,
      municipios: new Set(db.basePostes.map((p) => p.MUNICIPIO)).size,
      localidades: db.baseLocalidades.length,
      data_atualizacao_max: dataMax || null,
    })
  })

  router.get("/api/base-postes/municipios", (req, res) => {
    const porMun = {}
    for (const p of db.basePostes) {
      const m = (porMun[p.MUNICIPIO] ||= { MUNICIPIO: p.MUNICIPIO, TOTAL: 0, SEM_PROVEDOR: 0, _pts: [] })
      m.TOTAL++
      if (!db.basePosteTemProvedor(p.DE_BARRAMENTO)) m.SEM_PROVEDOR++
      m._pts.push(p)
    }
    const lista = Object.values(porMun)
      .map(({ _pts, ...m }) => ({ ...m, bounds: bounds(_pts) }))
      .sort((a, b) => b.TOTAL - a.TOTAL)
    enviarJson(res, 200, lista)
  })

  router.get("/api/base-postes/localidades", (req, res, ctx) => {
    const municipio = (ctx.query.get("municipio") || "").toUpperCase()
    const locs = db.baseLocalidades.filter((l) => !municipio || l.MUNICIPIO === municipio)
    const lista = locs
      .map((l) => {
        const pts = db.basePostes.filter((p) => p.NU_LOCALIDADE_ID === l.NU_LOCALIDADE_ID)
        const semProv = pts.filter((p) => !db.basePosteTemProvedor(p.DE_BARRAMENTO)).length
        return {
          NU_LOCALIDADE_ID: l.NU_LOCALIDADE_ID,
          LOCALIDADE: l.LOCALIDADE,
          MUNICIPIO: l.MUNICIPIO,
          TOTAL: pts.length,
          SEM_PROVEDOR: semProv,
          bounds: bounds(pts),
        }
      })
      .sort((a, b) => a.LOCALIDADE.localeCompare(b.LOCALIDADE))
    enviarJson(res, 200, lista)
  })

  router.get("/api/base-postes/mapa", (req, res, ctx) => {
    const vinculo = ctx.query.get("vinculo") || "todos"
    if (!VINCULOS.includes(vinculo)) {
      return erroDetalhe(res, 400, `vinculo deve ser um de: ${VINCULOS.join(", ")}`)
    }
    const municipio = (ctx.query.get("municipio") || "").toUpperCase()
    const localidade = num(ctx.query, "localidade")
    const min_x = num(ctx.query, "min_x")
    const max_x = num(ctx.query, "max_x")
    const min_y = num(ctx.query, "min_y")
    const max_y = num(ctx.query, "max_y")
    const limite = Math.min(LIMITE_PONTOS, num(ctx.query, "limite") || LIMITE_PONTOS)

    let lista = db.basePostes
    if (localidade) lista = lista.filter((p) => p.NU_LOCALIDADE_ID === localidade)
    else if (municipio) lista = lista.filter((p) => p.MUNICIPIO === municipio)

    const temBbox = [min_x, max_x, min_y, max_y].every((v) => v !== null)
    if (temBbox) {
      lista = lista.filter(
        (p) => p.NU_LONGITUDE >= min_x && p.NU_LONGITUDE <= max_x && p.NU_LATITUDE >= min_y && p.NU_LATITUDE <= max_y,
      )
    }

    lista = aplicarVinculo(lista, vinculo)

    // Selecao estreita? (localidade escolhida, ou bbox pequena)
    const areaBbox = temBbox ? (max_x - min_x) * (max_y - min_y) : Infinity
    const estreito = Boolean(localidade) || areaBbox <= LIMITE_AREA_GRAUS2

    if (!estreito) {
      return enviarJson(res, 200, {
        postes: [],
        truncado: false,
        agregar: true, // o front deve usar /densidade
        total_na_selecao: lista.length,
      })
    }

    const truncado = lista.length > limite
    enviarJson(res, 200, {
      postes: (truncado ? lista.slice(0, limite) : lista).map(serializar),
      truncado,
      agregar: false,
      total_na_selecao: lista.length,
    })
  })

  router.get("/api/base-postes/densidade", (req, res, ctx) => {
    const vinculo = ctx.query.get("vinculo") || "todos"
    if (!VINCULOS.includes(vinculo)) {
      return erroDetalhe(res, 400, `vinculo deve ser um de: ${VINCULOS.join(", ")}`)
    }
    const municipio = (ctx.query.get("municipio") || "").toUpperCase()
    const min_x = num(ctx.query, "min_x")
    const max_x = num(ctx.query, "max_x")
    const min_y = num(ctx.query, "min_y")
    const max_y = num(ctx.query, "max_y")
    if ([min_x, max_x, min_y, max_y].some((v) => v === null) || max_x <= min_x || max_y <= min_y) {
      return erroDetalhe(res, 400, "bounds inválidos")
    }
    let grade = Number(ctx.query.get("grade")) || 24
    grade = Math.min(60, Math.max(4, grade))

    let lista = db.basePostes
    if (municipio) lista = lista.filter((p) => p.MUNICIPIO === municipio)
    lista = aplicarVinculo(lista, vinculo).filter(
      (p) => p.NU_LONGITUDE >= min_x && p.NU_LONGITUDE <= max_x && p.NU_LATITUDE >= min_y && p.NU_LATITUDE <= max_y,
    )

    const passoX = (max_x - min_x) / grade
    const passoY = (max_y - min_y) / grade
    const mapaCelulas = new Map()
    let maior_qtd = 0
    for (const p of lista) {
      const i = Math.min(grade - 1, Math.floor((p.NU_LONGITUDE - min_x) / passoX))
      const j = Math.min(grade - 1, Math.floor((p.NU_LATITUDE - min_y) / passoY))
      const chave = `${i}:${j}`
      const atual = (mapaCelulas.get(chave) || 0) + 1
      mapaCelulas.set(chave, atual)
      if (atual > maior_qtd) maior_qtd = atual
    }
    const celulas = []
    for (const [chave, qtd] of mapaCelulas) {
      const [i, j] = chave.split(":").map(Number)
      celulas.push({
        min_x: min_x + i * passoX,
        max_x: min_x + (i + 1) * passoX,
        min_y: min_y + j * passoY,
        max_y: min_y + (j + 1) * passoY,
        qtd,
      })
    }
    enviarJson(res, 200, { celulas, maior_qtd })
  })

  // Seleciona os postes SEM PROVEDOR de uma area e cria uma acao de fiscalizacao.
  router.post("/api/base-postes/fiscalizacao", async (req, res, ctx) => {
    const corpo = ctx.body || {}
    const b = corpo.bounds || null
    const localidade = corpo.localidade ? Number(corpo.localidade) : null
    const municipio = (corpo.municipio || "").toUpperCase()

    let lista = db.basePostes.filter((p) => !db.basePosteTemProvedor(p.DE_BARRAMENTO))
    if (localidade) lista = lista.filter((p) => p.NU_LOCALIDADE_ID === localidade)
    else if (municipio) lista = lista.filter((p) => p.MUNICIPIO === municipio)
    if (b && ["min_x", "max_x", "min_y", "max_y"].every((k) => typeof b[k] === "number")) {
      lista = lista.filter(
        (p) =>
          p.NU_LONGITUDE >= b.min_x && p.NU_LONGITUDE <= b.max_x && p.NU_LATITUDE >= b.min_y && p.NU_LATITUDE <= b.max_y,
      )
    }
    if (Array.isArray(corpo.barramentos) && corpo.barramentos.length) {
      const alvo = new Set(corpo.barramentos)
      lista = lista.filter((p) => alvo.has(p.DE_BARRAMENTO))
    }

    if (!lista.length) {
      return erroDetalhe(res, 400, "Nenhum poste sem provedor na seleção")
    }

    const barramentos = [...new Set(lista.map((p) => p.DE_BARRAMENTO))]
    const id_acao = db.novaAcao({
      tipo: "FISCALIZACAO",
      titulo: corpo.titulo || `Fiscalização - postes sem provedor${municipio ? ` (${municipio})` : ""}`,
      responsavel: corpo.responsavel || null,
      prazo: corpo.prazo || null,
      status: "ABERTA",
      qtdPostes: barramentos.length,
      bounds: b,
      observacao: corpo.observacao || `Gerada da Base de Postes: ${lista.length} poste(s) sem provedor associado.`,
      criadoPor: corpo.criado_por || "dev.local",
      barramentos,
    })

    enviarJson(res, 201, { success: true, id_acao, qtd_postes: barramentos.length })
  })
}

module.exports = { registrar }
