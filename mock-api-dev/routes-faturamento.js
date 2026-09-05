"use strict"

// Mock do Faturamento (receita de compartilhamento por contrato/município).
// Espelha os endpoints de portal-api/routers/dashboards.py (/api/faturamento/*),
// que ate agora nao tinham contraparte no mock — a tela
// app/(app)/comercial/faturamento e a visao geral do Comercial dependem
// disso pra funcionar rodando local.
//
// Uma unica lista sintetica de "faturas" (uma linha por contrato de
// faturamento) alimenta todos os endpoints; os agregados sao calculados
// na hora, com os mesmos filtros da versao real (municipio, lote,
// cliente, status_contrato, flag_judicial, indice_reajuste).

const db = require("./db")
const { enviarJson } = require("./util")

const MUNICIPIOS = ["SALVADOR", "FEIRA DE SANTANA", "CAMACARI", "LAURO DE FREITAS", "ILHEUS", "PORTO SEGURO", "VITORIA DA CONQUISTA", "JUAZEIRO"]
const LOTES = ["LOTE 01", "LOTE 02", "LOTE 03", "LOTE 04"]
const INDICES = ["IPCA", "IGPM", "INPC"]
const STATUS = ["ATIVO", "ATIVO", "ATIVO", "ATIVO", "ATIVO", "SUSPENSO", "ENCERRADO"]

function rnd(min, max) {
  return min + Math.random() * (max - min)
}
function inteiro(min, max) {
  return Math.floor(rnd(min, max + 1))
}
function pick(arr, i) {
  return arr[i % arr.length]
}
function soDigitos(v) {
  return String(v || "").replace(/\D/g, "")
}

// --- clientes: reaproveita provedores do db + alguns sinteticos ---
const clientesBase = [
  ...db.provedores.map((p) => ({ cnpj: p.CNPJ, razao: p.RAZAO_SOCIAL })),
  { cnpj: "72.100.200/0001-30", razao: "Bahia Fibra Telecom Ltda" },
  { cnpj: "73.200.300/0001-41", razao: "Recôncavo Net Provedor" },
  { cnpj: "74.300.400/0001-52", razao: "Litoral Sul Conecta S.A." },
  { cnpj: "75.400.500/0001-63", razao: "Sertão Digital EIRELI" },
  { cnpj: "76.500.600/0001-74", razao: "Costa Dourada Telecom" },
]

const HOJE = new Date()
const faturas = []
let seq = 0
for (const cli of clientesBase) {
  const qtdContratos = inteiro(1, 4)
  for (let c = 0; c < qtdContratos; c++) {
    seq++
    const postes = inteiro(20, 900)
    const valorUnitario = Number(rnd(2.8, 6.5).toFixed(2))
    const receita = Number((postes * valorUnitario * rnd(11, 13)).toFixed(2)) // ~1 ano
    const judicial = Math.random() < 0.15 ? "JUDICIAL" : ""
    const venc = new Date(HOJE)
    venc.setDate(venc.getDate() + inteiro(-60, 400))
    faturas.push({
      NUMERO_CONTRATO: `CT-${String(2023 + (seq % 3))}-${String(1000 + seq)}`,
      CNPJ: cli.cnpj,
      RAZAO_SOCIAL: cli.razao,
      MUNICIPIO: pick(MUNICIPIOS, seq + c),
      LOTE: pick(LOTES, seq),
      INDICE_REAJUSTE_PADRAO: pick(INDICES, seq + c),
      STATUS_CONTRATO_PADRAO: pick(STATUS, seq * 2 + c),
      FLAG_JUDICIAL: judicial,
      POSTES: postes,
      VALOR_UNITARIO: valorUnitario,
      RECEITA: receita,
      DATA_VENCIMENTO: venc.toISOString().slice(0, 10),
    })
  }
}

// --- filtros (mesma semântica de montar_filtros_faturamento) ---
function aplicarFiltros(q) {
  const like = (chave) => (q.get(chave) || "").trim().toLowerCase()
  const eq = (chave) => (q.get(chave) || "").trim().toUpperCase()
  const fMun = like("municipio")
  const fLote = like("lote")
  const fCli = like("cliente")
  const fStatus = eq("status_contrato")
  const fJud = eq("flag_judicial")
  const fInd = eq("indice_reajuste")
  return faturas.filter((f) => {
    if (fMun && !f.MUNICIPIO.toLowerCase().includes(fMun)) return false
    if (fLote && !f.LOTE.toLowerCase().includes(fLote)) return false
    if (fCli && !f.RAZAO_SOCIAL.toLowerCase().includes(fCli)) return false
    if (fStatus && f.STATUS_CONTRATO_PADRAO.toUpperCase() !== fStatus) return false
    if (fJud && (f.FLAG_JUDICIAL || "").toUpperCase() !== fJud) return false
    if (fInd && f.INDICE_REAJUSTE_PADRAO.toUpperCase() !== fInd) return false
    return true
  })
}

function agrupar(lista, chave) {
  const mapa = new Map()
  for (const f of lista) {
    const k = chave(f)
    const g = mapa.get(k) || { k, contratos: 0, postes: 0, receita: 0, valorUnitSoma: 0 }
    g.contratos++
    g.postes += f.POSTES
    g.receita += f.RECEITA
    g.valorUnitSoma += f.VALOR_UNITARIO
    mapa.set(k, g)
  }
  return [...mapa.values()]
}

function registrar(router) {
  router.get("/api/faturamento/resumo", (req, res, ctx) => {
    const l = aplicarFiltros(ctx.query)
    const receitaTotal = l.reduce((s, f) => s + f.RECEITA, 0)
    const postes = l.reduce((s, f) => s + f.POSTES, 0)
    const receitaJudicial = l.filter((f) => (f.FLAG_JUDICIAL || "").toUpperCase() === "JUDICIAL").reduce((s, f) => s + f.RECEITA, 0)
    const clientes = new Set(l.map((f) => soDigitos(f.CNPJ))).size
    const valorUnitMedio = l.length ? l.reduce((s, f) => s + f.VALOR_UNITARIO, 0) / l.length : 0
    enviarJson(res, 200, {
      receita_total: Number(receitaTotal.toFixed(2)),
      postes: Math.round(postes),
      receita_poste: postes > 0 ? Number((receitaTotal / postes).toFixed(2)) : 0,
      contratos: l.length,
      contratos_ativos: l.filter((f) => f.STATUS_CONTRATO_PADRAO.toUpperCase() === "ATIVO").length,
      clientes,
      valor_unitario: Number(valorUnitMedio.toFixed(2)),
      receita_media_contrato: l.length ? Number((receitaTotal / l.length).toFixed(2)) : 0,
      receita_judicial: Number(receitaJudicial.toFixed(2)),
      percentual_judicial: receitaTotal > 0 ? Number(((receitaJudicial / receitaTotal) * 100).toFixed(2)) : 0,
    })
  })

  router.get("/api/faturamento/municipios", (req, res, ctx) => {
    const lista = agrupar(aplicarFiltros(ctx.query), (f) => f.MUNICIPIO)
      .map((g) => ({ municipio: g.k, contratos: g.contratos, postes: Math.round(g.postes), receita: Number(g.receita.toFixed(2)) }))
      .sort((a, b) => b.receita - a.receita)
    enviarJson(res, 200, lista)
  })

  router.get("/api/faturamento/lotes", (req, res, ctx) => {
    const lista = agrupar(aplicarFiltros(ctx.query), (f) => f.LOTE)
      .map((g) => ({ lote: g.k, contratos: g.contratos, postes: Math.round(g.postes), receita: Number(g.receita.toFixed(2)) }))
      .sort((a, b) => b.receita - a.receita)
    enviarJson(res, 200, lista)
  })

  router.get("/api/faturamento/judicial", (req, res, ctx) => {
    const lista = agrupar(aplicarFiltros(ctx.query), (f) => ((f.FLAG_JUDICIAL || "").toUpperCase() === "JUDICIAL" ? "JUDICIAL" : "NÃO JUDICIAL"))
      .map((g) => ({ flag: g.k, contratos: g.contratos, postes: Math.round(g.postes), receita: Number(g.receita.toFixed(2)) }))
    enviarJson(res, 200, lista)
  })

  router.get("/api/faturamento/clientes", (req, res, ctx) => {
    const l = aplicarFiltros(ctx.query)
    const porCnpj = new Map()
    for (const f of l) {
      const g = porCnpj.get(f.CNPJ) || { cliente: f.RAZAO_SOCIAL, cnpj: f.CNPJ, contratos: 0, postes: 0, receita: 0, vu: 0 }
      g.contratos++
      g.postes += f.POSTES
      g.receita += f.RECEITA
      g.vu += f.VALOR_UNITARIO
      porCnpj.set(f.CNPJ, g)
    }
    const lista = [...porCnpj.values()]
      .map((g) => ({
        cliente: g.cliente,
        cnpj: g.cnpj,
        contratos: g.contratos,
        postes: Math.round(g.postes),
        receita: Number(g.receita.toFixed(2)),
        valor_unitario_medio: Number((g.vu / g.contratos).toFixed(2)),
      }))
      .sort((a, b) => b.receita - a.receita)
    enviarJson(res, 200, lista)
  })

  router.get("/api/faturamento/curva-abc", (req, res, ctx) => {
    const l = aplicarFiltros(ctx.query)
    const porCnpj = new Map()
    for (const f of l) {
      const g = porCnpj.get(f.CNPJ) || { cliente: f.RAZAO_SOCIAL, cnpj: f.CNPJ, contratos: 0, postes: 0, receita: 0 }
      g.contratos++
      g.postes += f.POSTES
      g.receita += f.RECEITA
      porCnpj.set(f.CNPJ, g)
    }
    const ordenado = [...porCnpj.values()].sort((a, b) => b.receita - a.receita)
    const total = ordenado.reduce((s, g) => s + g.receita, 0) || 1
    let acumulado = 0
    const resultado = ordenado.map((g, i) => {
      const percentual = (g.receita / total) * 100
      acumulado += percentual
      const classe = acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C"
      return {
        posicao: i + 1,
        cliente: g.cliente,
        cnpj: g.cnpj,
        contratos: g.contratos,
        postes: Math.round(g.postes),
        receita: Number(g.receita.toFixed(2)),
        percentual: Number(percentual.toFixed(2)),
        percentual_acumulado: Number(acumulado.toFixed(2)),
        classe_abc: classe,
      }
    })
    enviarJson(res, 200, resultado)
  })

  router.get("/api/faturamento/reajustes", (req, res, ctx) => {
    const lista = agrupar(aplicarFiltros(ctx.query), (f) => f.INDICE_REAJUSTE_PADRAO)
      .map((g) => ({
        indice: g.k,
        contratos: g.contratos,
        postes: Math.round(g.postes),
        receita: Number(g.receita.toFixed(2)),
        valor_unitario_medio: Number((g.valorUnitSoma / g.contratos).toFixed(2)),
      }))
      .sort((a, b) => b.receita - a.receita)
    enviarJson(res, 200, lista)
  })

  router.get("/api/faturamento/contratos-vencendo", (req, res, ctx) => {
    const dias = Number(ctx.query.get("dias") || 90)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const lista = aplicarFiltros(ctx.query)
      .map((f) => {
        const venc = new Date(`${f.DATA_VENCIMENTO}T00:00:00`)
        const diasParaVencer = Math.round((venc.getTime() - hoje.getTime()) / 86400000)
        return { f, diasParaVencer }
      })
      .filter(({ diasParaVencer }) => diasParaVencer >= 0 && diasParaVencer <= dias)
      .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
      .map(({ f, diasParaVencer }) => ({
        cliente: f.RAZAO_SOCIAL,
        cnpj: f.CNPJ,
        contrato: f.NUMERO_CONTRATO,
        lote: f.LOTE,
        municipio: f.MUNICIPIO,
        data_vencimento: f.DATA_VENCIMENTO,
        status_contrato: f.STATUS_CONTRATO_PADRAO,
        flag_judicial: f.FLAG_JUDICIAL,
        postes: f.POSTES,
        valor_unitario: f.VALOR_UNITARIO,
        receita: f.RECEITA,
        dias_para_vencer: diasParaVencer,
      }))
    enviarJson(res, 200, lista)
  })
}

module.exports = { registrar }
