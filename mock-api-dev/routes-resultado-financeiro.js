"use strict"

// Resultado Financeiro mensal: Faturamento, Custos e Receita Liquida.
// Acompanhamento Meta x Realizado x REV (revisao/projecao), mensal e YTD.
// Espelha sql/PORTAL_COMPARTILHAMENTO_RESULTADO_FINANCEIRO.sql e o
// router real portal-api/routers/resultado_financeiro.py.
//
// O acumulado YTD e o desvio (REALIZADO - META) sao SEMPRE recalculados
// aqui - nunca gravados - pra nunca dessincronizar.

const { enviarJson, erroDetalhe } = require("./util")

const INDICADORES = ["FATURAMENTO", "CUSTOS", "RECEITA_LIQUIDA"]
const LABEL = {
  FATURAMENTO: "Faturamento",
  CUSTOS: "Custos",
  RECEITA_LIQUIDA: "Receita Líquida",
}

// Normaliza o texto do indicador vindo de planilha ("Receita Líquida",
// "receita_liquida", "RECEITA LIQUIDA"...) para o codigo do dominio.
function normalizarIndicador(valor) {
  // NFD + descarte de tudo que nao for A-Z ja remove acentos e separadores.
  const t = String(valor || "")
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
  if (t.startsWith("FATURAMENTO") || t.startsWith("RECEITABRUTA")) return "FATURAMENTO"
  if (t.startsWith("CUSTO") || t.startsWith("DESPESA")) return "CUSTOS"
  if (t.startsWith("RECEITALIQUIDA") || t === "RL") return "RECEITA_LIQUIDA"
  return null
}

// ------------------------------------------------------------------
// Estado em memoria (seed 2025 fechado + 2026 em andamento)
// ------------------------------------------------------------------
let seqId = 0
const dados = [] // { ID, ANO, MES, INDICADOR, META, REALIZADO, REV, MOEDA, OBSERVACAO, ... }

function seedAno(ano, mesesRealizados) {
  const fatBase = ano <= 2025 ? 2_100_000 : 2_350_000
  const custoBase = ano <= 2025 ? 1_350_000 : 1_460_000
  const arred = (v) => Math.round(v / 1000) * 1000
  const fator = (base, amp, off) => base + amp * Math.sin((ano * 3 + off) * 1.3 + off * 1.7)

  for (let mes = 1; mes <= 12; mes++) {
    const cresc = 1 + (mes - 1) * 0.012
    const sazon = 1 + Math.sin((mes / 12) * Math.PI * 2) * 0.06
    const fatMeta = arred(fatBase * cresc * sazon)
    const custoMeta = arred(custoBase * cresc * (1.02 - (sazon - 1) * 0.4))
    const impostos = arred(fatMeta * 0.092)
    const rlMeta = fatMeta - impostos - custoMeta

    const linha = (INDICADOR, META, fReal, fRev) => {
      const REALIZADO = mes <= mesesRealizados ? arred(META * fReal) : null
      const REV = arred(META * fRev)
      dados.push({
        ID: ++seqId,
        ANO: ano,
        MES: mes,
        INDICADOR,
        META,
        REALIZADO,
        REV,
        MOEDA: "BRL",
        OBSERVACAO: null,
        CREATED_AT: new Date().toISOString(),
        CREATED_BY: "seed",
        UPDATED_AT: null,
        UPDATED_BY: null,
      })
    }
    const r = (base, amp, off) => base + amp * Math.sin((mes + off) * 1.7 + fator(0, 0.02, off))
    linha("FATURAMENTO", fatMeta, r(0.985, 0.05, 0), r(1.01, 0.03, 1))
    linha("CUSTOS", custoMeta, r(1.035, 0.04, 2), r(1.02, 0.03, 3))
    linha("RECEITA_LIQUIDA", rlMeta, r(0.94, 0.07, 4), r(0.97, 0.05, 5))
  }
}
seedAno(2025, 12)
seedAno(2026, 8) // realizado ate Agosto/2026

// ------------------------------------------------------------------
// Calculo (mensal + YTD + desvio)
// ------------------------------------------------------------------
function resumo(meta, realizado, rev) {
  const desvio = realizado == null ? null : realizado - meta
  const desvioPct = realizado == null || !meta ? null : desvio / meta
  return { meta, realizado, rev, desvio, desvio_pct: desvioPct }
}

function montarResposta(ano, mesRefPedido) {
  const doAno = dados.filter((d) => d.ANO === ano)
  const mesesFechados = doAno
    .filter((d) => d.REALIZADO != null)
    .reduce((mx, d) => Math.max(mx, d.MES), 0)
  const ref =
    mesRefPedido && mesRefPedido >= 1 && mesRefPedido <= 12
      ? mesRefPedido
      : mesesFechados || 12

  const indicadores = INDICADORES.map((indicador) => {
    const porMes = {}
    for (let m = 1; m <= 12; m++) {
      porMes[m] =
        doAno.find((d) => d.MES === m && d.INDICADOR === indicador) || {
          ANO: ano,
          MES: m,
          INDICADOR: indicador,
          META: 0,
          REALIZADO: null,
          REV: null,
        }
    }

    let metaAc = 0
    let realAc = 0
    let revAc = 0
    let temReal = false
    const meses = []
    for (let m = 1; m <= 12; m++) {
      const L = porMes[m]
      const meta = Number(L.META) || 0
      const realizado = L.REALIZADO == null ? null : Number(L.REALIZADO)
      const rev = L.REV == null ? null : Number(L.REV)

      metaAc += meta
      if (realizado != null) {
        realAc += realizado
        temReal = true
      }
      revAc += rev != null ? rev : realizado != null ? realizado : meta

      const realYtd = temReal ? realAc : null
      const desvioYtd = realYtd == null ? null : realYtd - metaAc
      meses.push({
        mes: m,
        meta,
        realizado,
        rev,
        meta_ytd: metaAc,
        realizado_ytd: realYtd,
        rev_ytd: revAc,
        desvio: realizado == null ? null : realizado - meta,
        desvio_pct: realizado == null || !meta ? null : (realizado - meta) / meta,
        desvio_ytd: desvioYtd,
        desvio_ytd_pct: realYtd == null || !metaAc ? null : desvioYtd / metaAc,
      })
    }

    const mRef = meses[ref - 1]
    return {
      indicador,
      label: LABEL[indicador],
      meses,
      mensal: resumo(mRef.meta, mRef.realizado, mRef.rev),
      ytd: resumo(mRef.meta_ytd, mRef.realizado_ytd, mRef.rev_ytd),
      ano_total: {
        meta: meses[11].meta_ytd,
        realizado: temReal ? realAc : null,
        rev: meses[11].rev_ytd,
      },
    }
  })

  return { ano, mes_ref: ref, meses_fechados: mesesFechados, indicadores }
}

// ------------------------------------------------------------------
// Upsert de uma celula (ano/mes/indicador)
// ------------------------------------------------------------------
function upsert(ano, mes, indicador, campos, usuario) {
  let linha = dados.find((d) => d.ANO === ano && d.MES === mes && d.INDICADOR === indicador)
  const criada = !linha
  if (!linha) {
    linha = {
      ID: ++seqId,
      ANO: ano,
      MES: mes,
      INDICADOR: indicador,
      META: 0,
      REALIZADO: null,
      REV: null,
      MOEDA: "BRL",
      OBSERVACAO: null,
      CREATED_AT: new Date().toISOString(),
      CREATED_BY: usuario || "dev.local",
      UPDATED_AT: null,
      UPDATED_BY: null,
    }
    dados.push(linha)
  }
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v))
  if ("meta" in campos && campos.meta !== undefined) linha.META = num(campos.meta) ?? 0
  if ("realizado" in campos) linha.REALIZADO = num(campos.realizado)
  if ("rev" in campos) linha.REV = num(campos.rev)
  if ("observacao" in campos) linha.OBSERVACAO = campos.observacao || null
  linha.UPDATED_AT = new Date().toISOString()
  linha.UPDATED_BY = usuario || "dev.local"
  return { linha, criada }
}

function registrar(router) {
  // Anos disponiveis (+ ano corrente, sempre presente pro seletor)
  router.get("/api/resultado-financeiro/anos", (req, res) => {
    const anos = new Set(dados.map((d) => d.ANO))
    anos.add(new Date().getFullYear())
    enviarJson(res, 200, [...anos].sort((a, b) => b - a))
  })

  // Acompanhamento completo de um ano
  router.get("/api/resultado-financeiro", (req, res, ctx) => {
    const ano = Number(ctx.query.get("ano")) || new Date().getFullYear()
    const mesRef = ctx.query.get("mes_ref") ? Number(ctx.query.get("mes_ref")) : null
    enviarJson(res, 200, montarResposta(ano, mesRef))
  })

  // Upsert de uma celula
  router.put("/api/resultado-financeiro", async (req, res, ctx) => {
    const b = ctx.body || {}
    const ano = Number(b.ano)
    const mes = Number(b.mes)
    const indicador = normalizarIndicador(b.indicador)
    if (!ano || mes < 1 || mes > 12) return erroDetalhe(res, 400, "ano e mes (1..12) sao obrigatorios")
    if (!indicador) return erroDetalhe(res, 400, `indicador invalido (use ${INDICADORES.join(" / ")})`)
    const { linha, criada } = upsert(ano, mes, indicador, b, b.usuario)
    enviarJson(res, 200, { success: true, criada, item: linha, dados: montarResposta(ano, null) })
  })

  // Importacao em lote (planilha modelo preenchida)
  router.post("/api/resultado-financeiro/importar", async (req, res, ctx) => {
    const b = ctx.body || {}
    const anoPadrao = Number(b.ano) || null
    const linhas = Array.isArray(b.linhas) ? b.linhas : []
    if (!linhas.length) return erroDetalhe(res, 400, "nenhuma linha para importar")

    let criados = 0
    let atualizados = 0
    const ignorados = []
    const anosTocados = new Set()
    for (let i = 0; i < linhas.length; i++) {
      const r = linhas[i] || {}
      const ano = Number(r.ano) || anoPadrao
      const mes = Number(r.mes)
      const indicador = normalizarIndicador(r.indicador)
      if (!ano || mes < 1 || mes > 12 || !indicador) {
        ignorados.push({ linha: i + 1, motivo: "ano/mes/indicador invalidos", valor: r })
        continue
      }
      const campos = {}
      if (r.meta !== undefined && r.meta !== null && r.meta !== "") campos.meta = r.meta
      if ("realizado" in r) campos.realizado = r.realizado
      if ("rev" in r) campos.rev = r.rev
      if (!Object.keys(campos).length) {
        ignorados.push({ linha: i + 1, motivo: "sem valores (meta/realizado/rev)", valor: r })
        continue
      }
      const { criada } = upsert(ano, mes, indicador, campos, b.usuario)
      anosTocados.add(ano)
      if (criada) criados++
      else atualizados++
    }

    const anoResposta = anoPadrao || [...anosTocados][0] || new Date().getFullYear()
    enviarJson(res, 200, {
      success: true,
      criados,
      atualizados,
      ignorados,
      total: linhas.length,
      dados: montarResposta(anoResposta, null),
    })
  })
}

module.exports = { registrar }
