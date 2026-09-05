"use strict"

// Rede de distribuição (trechos de média e baixa tensão) e a análise de
// "postes na rota não faturados". Espelha
// sql/PORTAL_COMPARTILHAMENTO_TRECHO_REDE.sql e routers/trecho_rede.py.
//
// Ideia: montar o grafo (nós = barramentos, arestas = trechos MT/BT) e,
// para cada nó SEM ocupação, ver se ele está no caminho da rede entre
// dois nós ocupados (do mesmo provedor, no modo forte). Se está, a fibra
// provavelmente passa por ele e ele deveria estar sendo faturado.

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

const ENTIDADES = ["TRECHO DE MT", "TRECHO DE BT"]

// operadora id -> chave estável (CNPJ) e razão social
const _opPorChave = new Map()
for (const op of db.operadoras) {
  _opPorChave.set(op.CNPJ || op.RAZAO_SOCIAL, { id: op.ID, razao: op.RAZAO_SOCIAL })
}
function _chaveDaOperadora(id) {
  const op = db.operadoras.find((o) => o.ID === Number(id))
  return op ? op.CNPJ || op.RAZAO_SOCIAL : null
}

// provedores (chave -> razão) declarados num barramento, via POSTE_OCUPACAO
function _provedoresDoNo(barr) {
  const m = new Map()
  for (const p of db.provedoresDoBarramento(barr)) {
    const k = p.CNPJ || p.RAZAO_SOCIAL
    if (k) m.set(k, p.RAZAO_SOCIAL || p.CNPJ)
  }
  return m
}
function _temOcupacaoNaoIdentificada(barr) {
  return db.redeNoPorBarramento.has(barr)
    ? db.ocupacoes.some((o) => o.BARRAMENTO === barr && !o._idOperadora)
    : false
}

// bbox opcional: mantém o trecho se qualquer uma das pontas cai na caixa
// (assim o desenho não "corta" trechos que atravessam a borda do viewport).
function _trechoNaCaixa(t, cx) {
  if (!cx) return true
  const dentro = (x, y) => x >= cx.min_x && x <= cx.max_x && y >= cx.min_y && y <= cx.max_y
  return (
    dentro(t.LONGITUDE_INICIAL, t.LATITUDE_INICIAL) || dentro(t.LONGITUDE_FINAL, t.LATITUDE_FINAL)
  )
}

function _trechosNoEscopo({ municipio, alimentador, entidade, caixa }) {
  const ent = entidade && ENTIDADES.includes(entidade) ? entidade : null
  return db.redeTrechos.filter(
    (t) =>
      t.ATIVO === "S" &&
      (!municipio || t.MUNICIPIO === municipio) &&
      (!alimentador || t.ALIMENTADOR === alimentador) &&
      (!ent || t.ENTIDADE === ent) &&
      _trechoNaCaixa(t, caixa),
  )
}

function _lerCaixa(query) {
  const n = (k) => {
    const bruto = query.get(k)
    if (bruto === null || bruto === "") return null
    const v = Number(bruto)
    return Number.isFinite(v) ? v : null
  }
  const min_x = n("min_x")
  const max_x = n("max_x")
  const min_y = n("min_y")
  const max_y = n("max_y")
  if ([min_x, max_x, min_y, max_y].some((v) => v === null)) return null
  return { min_x, max_x, min_y, max_y }
}

// Monta lista de adjacência + info de nó a partir de uma lista de trechos.
function _montarGrafo(trechos) {
  const adj = new Map()
  const no = new Map()
  const addNo = (barr, x, y, mun, alim, ent) => {
    if (!no.has(barr)) no.set(barr, { BARRAMENTO: barr, X: x, Y: y, MUNICIPIO: mun, ALIMENTADOR: alim, ENTIDADE: ent })
  }
  for (const t of trechos) {
    addNo(t.BARRAMENTO_INICIAL, t.LONGITUDE_INICIAL, t.LATITUDE_INICIAL, t.MUNICIPIO, t.ALIMENTADOR, t.ENTIDADE)
    addNo(t.BARRAMENTO_FINAL, t.LONGITUDE_FINAL, t.LATITUDE_FINAL, t.MUNICIPIO, t.ALIMENTADOR, t.ENTIDADE)
    if (!adj.has(t.BARRAMENTO_INICIAL)) adj.set(t.BARRAMENTO_INICIAL, [])
    if (!adj.has(t.BARRAMENTO_FINAL)) adj.set(t.BARRAMENTO_FINAL, [])
    const meta = { alim: t.ALIMENTADOR, ent: t.ENTIDADE, m: t.EXTENSAO_M || 0, id: t.ID_TRECHO }
    adj.get(t.BARRAMENTO_INICIAL).push({ to: t.BARRAMENTO_FINAL, ...meta })
    adj.get(t.BARRAMENTO_FINAL).push({ to: t.BARRAMENTO_INICIAL, ...meta })
  }
  return { adj, no }
}

function analisar(corpo) {
  const municipio = (corpo.municipio || "").trim()
  if (!municipio) return { erro: "Informe o município." }
  const alimentador = (corpo.alimentador || "").trim() || null
  const entidade = corpo.entidade && ENTIDADES.includes(corpo.entidade) ? corpo.entidade : null
  const modo = corpo.modo === "CORREDOR" ? "CORREDOR" : "MESMO_PROVEDOR"
  const maxTrechos = Math.min(10, Math.max(2, Number(corpo.max_trechos) || 4))
  const maxLado = maxTrechos - 1
  const exigirMesmoAlim = corpo.exigir_mesmo_alimentador !== false
  const maxMetrosVao = Math.max(50, Number(corpo.max_metros_vao) || 500)
  const minScore = Math.max(0, Number(corpo.min_score) || 1)
  const chaveOperadora = corpo.id_operadora ? _chaveDaOperadora(corpo.id_operadora) : null

  const trechos = _trechosNoEscopo({ municipio, alimentador, entidade })
  const { adj, no } = _montarGrafo(trechos)

  const provPorNo = new Map()
  for (const barr of no.keys()) provPorNo.set(barr, _provedoresDoNo(barr))
  const ocupado = (barr) => (provPorNo.get(barr) ? provPorNo.get(barr).size : 0) > 0

  const corredorBarrs = new Set()
  const postes = []

  let processados = 0
  for (const [g, info] of no) {
    if (ocupado(g)) continue
    if (++processados > 8000) break

    // BFS a partir de g, só atravessando nós SEM ocupação; ao encontrar um
    // nó ocupado, registra e não expande além dele.
    const alcance = []
    const visitado = new Set([g])
    let fila = [{ barr: g, dist: 0, first: null, alims: new Set(), metros: 0 }]
    while (fila.length) {
      const prox = []
      for (const cur of fila) {
        if (cur.dist >= maxLado) continue
        for (const e of adj.get(cur.barr) || []) {
          if (visitado.has(e.to)) continue
          visitado.add(e.to)
          const first = cur.first || e.to
          const alims = new Set(cur.alims)
          alims.add(e.alim)
          const metros = cur.metros + e.m
          if (ocupado(e.to)) {
            alcance.push({ barr: e.to, dist: cur.dist + 1, first, alims, metros })
          } else {
            prox.push({ barr: e.to, dist: cur.dist + 1, first, alims, metros })
          }
        }
      }
      fila = prox
    }
    if (alcance.length < 2) continue

    const evidencias = []
    for (let i = 0; i < alcance.length; i++) {
      for (let j = i + 1; j < alcance.length; j++) {
        const A = alcance[i]
        const C = alcance[j]
        if (A.first === C.first) continue // mesmo lado: g não está "entre" eles
        const hops = A.dist + C.dist
        if (hops > maxTrechos) continue
        const metros = Number((A.metros + C.metros).toFixed(1))
        if (metros > maxMetrosVao) continue
        const alims = new Set([...A.alims, ...C.alims])
        const mesmoAlim = alims.size === 1
        if (exigirMesmoAlim && !mesmoAlim) continue

        let provs
        if (modo === "MESMO_PROVEDOR") {
          const pa = provPorNo.get(A.barr)
          const pc = provPorNo.get(C.barr)
          provs = [...pa.keys()].filter((k) => pc.has(k))
          if (chaveOperadora && !provs.includes(chaveOperadora)) continue
          if (!provs.length) continue
          if (chaveOperadora) provs = [chaveOperadora]
        } else {
          provs = [...new Set([...provPorNo.get(A.barr).keys(), ...provPorNo.get(C.barr).keys()])]
          if (chaveOperadora && !provs.includes(chaveOperadora)) continue
        }

        evidencias.push({
          poste_a: A.barr,
          poste_c: C.barr,
          trechos: hops,
          metros,
          alimentador: [...A.alims][0] || null,
          mesmo_alimentador: mesmoAlim,
          provedores: provs.map((k) => ({
            chave: k,
            razao: provPorNo.get(A.barr).get(k) || provPorNo.get(C.barr).get(k) || k,
          })),
        })
      }
    }
    if (!evidencias.length) continue

    const provsImplicados = new Map()
    for (const ev of evidencias) for (const p of ev.provedores) provsImplicados.set(p.chave, p.razao)

    const ocupNaoId = _temOcupacaoNaoIdentificada(g)
    let score = 0
    score += 3 * provsImplicados.size
    score += Math.min(evidencias.length, 4)
    score += ocupNaoId ? 1 : 2 // ninguém declarado é mais suspeito que "org sem operadora"
    if (evidencias.every((e) => e.mesmo_alimentador)) score += 2
    if ((info.ENTIDADE || "") === "TRECHO DE BT") score += 1
    const menorVao = Math.min(...evidencias.map((e) => e.metros))
    if (menorVao > 400) score -= 2
    const menosHops = Math.min(...evidencias.map((e) => e.trechos))
    if (menosHops >= 5) score -= 1
    score = Math.max(0, score)
    if (score < minScore) continue

    corredorBarrs.add(g)
    for (const ev of evidencias) {
      corredorBarrs.add(ev.poste_a)
      corredorBarrs.add(ev.poste_c)
    }

    postes.push({
      BARRAMENTO: g,
      X: info.X,
      Y: info.Y,
      MUNICIPIO: info.MUNICIPIO,
      ALIMENTADOR: info.ALIMENTADOR,
      ENTIDADE: info.ENTIDADE,
      SCORE: score,
      GRAU: (adj.get(g) || []).length,
      SEM_OCUPACAO: !ocupNaoId,
      provedores: [...provsImplicados.entries()].map(([chave, razao]) => ({ chave, razao })),
      evidencias: evidencias.sort((a, b) => a.trechos - b.trechos).slice(0, 8),
    })
  }

  postes.sort((a, b) => b.SCORE - a.SCORE || a.evidencias.length - b.evidencias.length)
  const top = postes.slice(0, 300)

  const segmentos = trechos.slice(0, 4000).map((t) => ({
    ax: t.LONGITUDE_INICIAL,
    ay: t.LATITUDE_INICIAL,
    bx: t.LONGITUDE_FINAL,
    by: t.LATITUDE_FINAL,
    entidade: t.ENTIDADE,
    alimentador: t.ALIMENTADOR,
    implicado: corredorBarrs.has(t.BARRAMENTO_INICIAL) && corredorBarrs.has(t.BARRAMENTO_FINAL),
  }))

  const provedoresImplicados = new Set()
  for (const p of top) for (const pr of p.provedores) provedoresImplicados.add(pr.razao)

  return {
    parametros: {
      municipio,
      alimentador,
      entidade: entidade || "AMBOS",
      modo,
      max_trechos: maxTrechos,
      exigir_mesmo_alimentador: exigirMesmoAlim,
      max_metros_vao: maxMetrosVao,
      min_score: minScore,
      id_operadora: corpo.id_operadora ? Number(corpo.id_operadora) : null,
    },
    resumo: {
      trechos_no_escopo: trechos.length,
      nos: no.size,
      nos_sem_ocupacao: [...no.keys()].filter((b) => !ocupado(b)).length,
      postes_sinalizados: top.length,
      provedores_implicados: provedoresImplicados.size,
    },
    postes: top,
    segmentos,
  }
}

function registrar(router) {
  router.get("/api/trecho-rede/resumo", (req, res) => {
    const t = db.redeTrechos.filter((x) => x.ATIVO === "S")
    const mt = t.filter((x) => x.ENTIDADE === "TRECHO DE MT")
    const bt = t.filter((x) => x.ENTIDADE === "TRECHO DE BT")
    const km = (arr) => Number((arr.reduce((s, x) => s + (x.EXTENSAO_M || 0), 0) / 1000).toFixed(1))
    enviarJson(res, 200, {
      trechos: t.length,
      trechos_mt: mt.length,
      trechos_bt: bt.length,
      km_total: km(t),
      km_mt: km(mt),
      km_bt: km(bt),
      municipios: new Set(t.map((x) => x.MUNICIPIO)).size,
      alimentadores: new Set(t.map((x) => x.ALIMENTADOR)).size,
      nos: db.redeNos.length,
    })
  })

  router.get("/api/trecho-rede/municipios", (req, res) => {
    const agg = new Map()
    for (const t of db.redeTrechos) {
      if (t.ATIVO !== "S" || !t.MUNICIPIO) continue
      let m = agg.get(t.MUNICIPIO)
      if (!m) {
        m = { MUNICIPIO: t.MUNICIPIO, TRECHOS: 0, min_x: Infinity, max_x: -Infinity, min_y: Infinity, max_y: -Infinity }
        agg.set(t.MUNICIPIO, m)
      }
      m.TRECHOS++
      for (const [x, y] of [
        [t.LONGITUDE_INICIAL, t.LATITUDE_INICIAL],
        [t.LONGITUDE_FINAL, t.LATITUDE_FINAL],
      ]) {
        m.min_x = Math.min(m.min_x, x)
        m.max_x = Math.max(m.max_x, x)
        m.min_y = Math.min(m.min_y, y)
        m.max_y = Math.max(m.max_y, y)
      }
    }
    const lista = [...agg.values()].sort(
      (a, b) => b.TRECHOS - a.TRECHOS || a.MUNICIPIO.localeCompare(b.MUNICIPIO),
    )
    enviarJson(res, 200, lista)
  })

  router.get("/api/trecho-rede/alimentadores", (req, res, ctx) => {
    const municipio = (ctx.query.get("municipio") || "").trim()
    const cont = new Map()
    for (const t of db.redeTrechos) {
      if (t.ATIVO !== "S") continue
      if (municipio && t.MUNICIPIO !== municipio) continue
      cont.set(t.ALIMENTADOR, (cont.get(t.ALIMENTADOR) || 0) + 1)
    }
    const lista = [...cont.entries()]
      .map(([ALIMENTADOR, TRECHOS]) => ({ ALIMENTADOR, TRECHOS }))
      .sort((a, b) => a.ALIMENTADOR.localeCompare(b.ALIMENTADOR))
    enviarJson(res, 200, lista)
  })

  // Trechos (linhas) no escopo + caixa do viewport, para desenhar a rede aos
  // poucos (mesma lógica do /api/postes/mapa): só o que cabe na área visível,
  // com teto e flag `truncado` pro front pedir mais zoom.
  router.get("/api/trecho-rede/mapa", (req, res, ctx) => {
    const municipio = (ctx.query.get("municipio") || "").trim()
    if (!municipio) return erroDetalhe(res, 400, "Informe o município.")
    const alimentador = (ctx.query.get("alimentador") || "").trim() || null
    const entidade = ctx.query.get("entidade")
    const caixa = _lerCaixa(ctx.query)
    const TETO = 5000
    const trechos = _trechosNoEscopo({ municipio, alimentador, entidade, caixa })
    const truncado = trechos.length > TETO
    const usados = truncado ? trechos.slice(0, TETO) : trechos
    enviarJson(res, 200, {
      total: trechos.length,
      truncado,
      segmentos: usados.map((t) => ({
        ax: t.LONGITUDE_INICIAL,
        ay: t.LATITUDE_INICIAL,
        bx: t.LONGITUDE_FINAL,
        by: t.LATITUDE_FINAL,
        entidade: t.ENTIDADE,
        alimentador: t.ALIMENTADOR,
        implicado: false,
      })),
    })
  })

  router.post("/api/trecho-rede/analise", async (req, res, ctx) => {
    const r = analisar(ctx.body || {})
    if (r.erro) return erroDetalhe(res, 400, r.erro)
    enviarJson(res, 200, r)
  })
}

module.exports = { registrar }
