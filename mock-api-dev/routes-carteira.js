"use strict"

// Carteira de Serviço das Equipes de Campo.
// Espelha sql/PORTAL_COMPARTILHAMENTO_CARTEIRA.sql.
//
// O gerador monta o roteiro (diário/semanal/mensal) das equipes:
//  - modo MANUAL: usa a lista de barramentos escolhida no mapa/lista
//  - modo AUTOMATICA: aplica uma ESTRATEGIA de priorização sobre a Base de
//    Postes Coelba (usando o sinal "tem provedor" das ocupações)
// e depois faz a otimização de rota (a equipe consome um município antes de
// ir pro próximo; ordem dos postes no dia = vizinho mais próximo).

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

// --- catálogo de estratégias (com legenda explicativa) ---
const ESTRATEGIAS = [
  {
    CODIGO: "VAO_ENTRE_PROVEDORES",
    NOME: "Vão sem provedor entre postes com provedor",
    DESCRICAO:
      "Seleciona postes SEM provedor cercados por postes COM provedor num raio de rua. Num corredor de postes, se entre dois com provedor há um sem, há forte indício de ocupação não cadastrada. É a lógica de maior evidência.",
    PARAMETROS: "raio_m (60), min_vizinhos_com_provedor (2), limiar_fracao (0.5)",
  },
  {
    CODIGO: "CORREDOR_MISTO",
    NOME: "Corredores com postes com e sem provedor",
    DESCRICAO:
      "Agrupa os postes em trechos de ~150 m e prioriza os SEM provedor que estão em trechos onde também há postes COM provedor — provável expansão de rede de um ISP sem declarar todos os pontos.",
    PARAMETROS: "celula_m (150)",
  },
  {
    CODIGO: "LOCALIDADE_ALTA_ADESAO",
    NOME: "Localidades de alta adesão com bolsões sem provedor",
    DESCRICAO:
      "Ranqueia as localidades pela proporção de postes COM provedor (adesão alta = mercado maduro) e, dentro delas, seleciona os que ainda estão SEM provedor — candidatos a cadastro pendente.",
    PARAMETROS: "min_adesao (0.4)",
  },
  {
    CODIGO: "DENSIDADE_SEM_PROVEDOR",
    NOME: "Concentração de postes sem provedor perto de área atendida",
    DESCRICAO:
      "Encontra aglomerados de postes SEM provedor próximos (célula vizinha) de postes COM provedor. Aponta mercado potencial contíguo à rede existente.",
    PARAMETROS: "celula_m (200)",
  },
  {
    CODIGO: "AMOSTRAGEM_LOCALIDADE",
    NOME: "Amostragem simples por município/localidade",
    DESCRICAO:
      "Sem priorização: pega N postes SEM provedor por dia nos municípios/localidades escolhidos, na ordem do cadastro. Útil para varredura ampla.",
    PARAMETROS: "nenhum",
  },
  {
    CODIGO: "TODOS_SEM_PROVEDOR",
    NOME: "Todos os postes sem provedor da área",
    DESCRICAO:
      "Sem amostragem: inclui todos os postes SEM provedor dos municípios/localidades escolhidos, limitado pela capacidade das equipes no período.",
    PARAMETROS: "nenhum",
  },
]
const CODIGOS_ESTRATEGIA = new Set(ESTRATEGIAS.map((e) => e.CODIGO))
const FREQUENCIAS = { DIARIA: 1, SEMANAL: 5, MENSAL: 22 }

// ------------------------------------------------------------------
// Utilidades geográficas
// ------------------------------------------------------------------
function metros(a, b) {
  const dLat = (a.lat - b.lat) * 111000
  const dLng = (a.lng - b.lng) * 108000 // ~lat -13
  return Math.sqrt(dLat * dLat + dLng * dLng)
}
function centro(postes) {
  const n = postes.length || 1
  return {
    lat: postes.reduce((s, p) => s + p.NU_LATITUDE, 0) / n,
    lng: postes.reduce((s, p) => s + p.NU_LONGITUDE, 0) / n,
  }
}
function pt(p) {
  return { lat: p.NU_LATITUDE, lng: p.NU_LONGITUDE }
}
function chaveCelula(p, celulaGraus) {
  return `${Math.floor(p.NU_LATITUDE / celulaGraus)}:${Math.floor(p.NU_LONGITUDE / celulaGraus)}`
}

function diasUteis(dataInicioISO, frequencia) {
  const n = FREQUENCIAS[frequencia] || FREQUENCIAS.SEMANAL
  const cur = new Date(`${dataInicioISO}T00:00:00`)
  const dias = []
  let guarda = 0
  while (dias.length < n && guarda++ < 90) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) dias.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dias
}

function linkGmaps(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
function linkWaze(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
}

// ------------------------------------------------------------------
// Filtro de escopo (município / localidade)
// ------------------------------------------------------------------
function postesNoEscopo(municipios, localidades) {
  const muns = new Set((municipios || []).map((m) => String(m).toUpperCase()))
  const locs = new Set((localidades || []).map(Number))
  return db.basePostes.filter((p) => {
    if (locs.size) return locs.has(p.NU_LOCALIDADE_ID)
    if (muns.size) return muns.has(String(p.MUNICIPIO).toUpperCase())
    return true
  })
}

// ------------------------------------------------------------------
// Estratégias -> [{ poste, score, motivo }]
// ------------------------------------------------------------------
function aplicarEstrategia(estrategia, postes, params = {}) {
  const temProv = (p) => db.basePosteTemProvedor(p.DE_BARRAMENTO)
  const sem = postes.filter((p) => !temProv(p))
  const com = postes.filter(temProv)

  if (estrategia === "VAO_ENTRE_PROVEDORES") {
    const raio = Number(params.raio_m) || 60
    const minViz = Number(params.min_vizinhos_com_provedor) || 2
    const limiar = Number(params.limiar_fracao) || 0.5
    const out = []
    for (const p of sem) {
      const pp = pt(p)
      let c = 0
      let t = 0
      for (const q of postes) {
        if (q === p) continue
        if (metros(pp, pt(q)) <= raio) {
          t++
          if (temProv(q)) c++
        }
      }
      if (t > 0 && c >= minViz && c / t >= limiar) {
        out.push({
          poste: p,
          score: Number((c / t + 0.1 * Math.min(c, 5)).toFixed(4)),
          motivo: `${c} de ${t} vizinhos (raio ${raio} m) têm provedor`,
        })
      }
    }
    return out.sort((a, b) => b.score - a.score)
  }

  if (estrategia === "CORREDOR_MISTO" || estrategia === "DENSIDADE_SEM_PROVEDOR") {
    const celulaM = Number(params.celula_m) || (estrategia === "CORREDOR_MISTO" ? 150 : 200)
    const celulaGraus = celulaM / 111000
    const mapa = new Map() // chave -> { com:[], sem:[] }
    for (const p of postes) {
      const k = chaveCelula(p, celulaGraus)
      const cel = mapa.get(k) || { com: [], sem: [] }
      ;(temProv(p) ? cel.com : cel.sem).push(p)
      mapa.set(k, cel)
    }
    const out = []
    if (estrategia === "CORREDOR_MISTO") {
      for (const cel of mapa.values()) {
        if (cel.com.length && cel.sem.length) {
          const score = Number((Math.min(cel.com.length, 5) / 5 + 0.2).toFixed(4))
          for (const p of cel.sem) {
            out.push({ poste: p, score, motivo: `trecho com ${cel.com.length} com provedor e ${cel.sem.length} sem` })
          }
        }
      }
    } else {
      const temComVizinha = (k) => {
        const [i, j] = k.split(":").map(Number)
        for (let di = -1; di <= 1; di++)
          for (let dj = -1; dj <= 1; dj++) {
            const viz = mapa.get(`${i + di}:${j + dj}`)
            if (viz && viz.com.length) return true
          }
        return false
      }
      for (const [k, cel] of mapa) {
        if (cel.sem.length && temComVizinha(k)) {
          const score = Number((Math.min(cel.sem.length, 10) / 10 + 0.1).toFixed(4))
          for (const p of cel.sem) {
            out.push({ poste: p, score, motivo: `${cel.sem.length} sem provedor próximos a área atendida` })
          }
        }
      }
    }
    return out.sort((a, b) => b.score - a.score)
  }

  if (estrategia === "LOCALIDADE_ALTA_ADESAO") {
    const minAdesao = Number(params.min_adesao) || 0.4
    const porLoc = new Map()
    for (const p of postes) {
      const l = porLoc.get(p.NU_LOCALIDADE_ID) || { total: 0, com: 0, nome: p.LOCALIDADE }
      l.total++
      if (temProv(p)) l.com++
      porLoc.set(p.NU_LOCALIDADE_ID, l)
    }
    const out = []
    for (const p of sem) {
      const l = porLoc.get(p.NU_LOCALIDADE_ID)
      const adesao = l && l.total ? l.com / l.total : 0
      if (adesao >= minAdesao) {
        out.push({
          poste: p,
          score: Number(adesao.toFixed(4)),
          motivo: `localidade "${l.nome}" com ${Math.round(adesao * 100)}% de adesão`,
        })
      }
    }
    return out.sort((a, b) => b.score - a.score)
  }

  // AMOSTRAGEM_LOCALIDADE | TODOS_SEM_PROVEDOR
  return sem.map((p) => ({ poste: p, score: 0.5, motivo: "poste sem provedor na área" }))
}

// ------------------------------------------------------------------
// Otimização de rota: distribui os postes em equipes -> municípios -> dias
// ------------------------------------------------------------------
// Divide uma lista de postes em `n` faixas GEOGRAFICAS contiguas (ordena
// pelo eixo de maior dispersao e corta). Mantem postes vizinhos juntos.
function fatiarPorGeografia(lista, n) {
  if (n <= 1) return [lista]
  const lats = lista.map((s) => s.poste.NU_LATITUDE)
  const lngs = lista.map((s) => s.poste.NU_LONGITUDE)
  const rangeLat = Math.max(...lats) - Math.min(...lats)
  const rangeLng = Math.max(...lngs) - Math.min(...lngs)
  const ordenada = [...lista].sort((a, b) =>
    rangeLng >= rangeLat
      ? a.poste.NU_LONGITUDE - b.poste.NU_LONGITUDE
      : a.poste.NU_LATITUDE - b.poste.NU_LATITUDE,
  )
  const tam = Math.ceil(ordenada.length / n)
  const fatias = []
  for (let i = 0; i < n; i++) {
    const f = ordenada.slice(i * tam, (i + 1) * tam)
    if (f.length) fatias.push(f)
  }
  return fatias
}

function alocarRota(selecionados, equipes, qtdPorDia, dias, nomeEps, raioMaximoM = 0) {
  const capEquipe = qtdPorDia * dias.length

  // agrupa por município (preservando a ordem por score)
  const porMun = new Map()
  for (const s of selecionados) {
    const m = s.poste.MUNICIPIO
    if (!porMun.has(m)) porMun.set(m, [])
    porMun.get(m).push(s)
  }
  const municipios = [...porMun.entries()]
    .map(([nome, lista]) => ({ nome, lista, centro: centro(lista.map((s) => s.poste)) }))
    .sort((a, b) => b.lista.length - a.lista.length)

  // Distribuição: cada município é atendido por até `maxEquipesPorMun` equipes
  // (as de base mais próxima). Município grande é fatiado em pedaços contíguos
  // entre essas equipes; município pequeno fica com uma equipe só. Assim
  // nenhuma equipe fica pulando de município.
  const buckets = equipes.map((e) => ({ equipe: e, cap: capEquipe, municipios: [] }))
  const maxEquipesPorMun = Math.max(1, Math.ceil(equipes.length / Math.max(1, municipios.length)))
  const livres = [...buckets]
  for (const mun of municipios) {
    if (!livres.length) break
    livres.sort(
      (a, b) =>
        metros({ lat: a.equipe.LATITUDE_BASE, lng: a.equipe.LONGITUDE_BASE }, mun.centro) -
        metros({ lat: b.equipe.LATITUDE_BASE, lng: b.equipe.LONGITUDE_BASE }, mun.centro),
    )
    const nEquipes = Math.min(
      livres.length,
      maxEquipesPorMun,
      Math.max(1, Math.ceil(mun.lista.length / capEquipe)),
    )
    const escolhidas = livres.splice(0, nEquipes)
    // faixas geográficas -> cada faixa para a equipe de base mais próxima
    const fatias = fatiarPorGeografia(mun.lista, escolhidas.length)
    const equipesPend = [...escolhidas]
    for (const fatia of fatias) {
      const c = centro(fatia.map((s) => s.poste))
      equipesPend.sort(
        (a, b) =>
          metros({ lat: a.equipe.LATITUDE_BASE, lng: a.equipe.LONGITUDE_BASE }, c) -
          metros({ lat: b.equipe.LATITUDE_BASE, lng: b.equipe.LONGITUDE_BASE }, c),
      )
      const b = equipesPend.shift()
      const corte = fatia.slice(0, capEquipe)
      b.municipios.push({ nome: mun.nome, centro: centro(corte.map((s) => s.poste)), lista: corte })
      b.cap -= corte.length
    }
  }
  // municípios que sobraram (sem equipe livre) vão para as menos carregadas,
  // também em fatia geográfica contígua
  for (let mi = 0; mi < municipios.length; mi++) {
    const mun = municipios[mi]
    const jaAtendido = buckets.some((b) => b.municipios.some((m) => m.nome === mun.nome))
    if (jaAtendido) continue
    const [listaGeo] = fatiarPorGeografia(mun.lista, 1)
    const ordenada =
      listaGeo.length > 1
        ? [...listaGeo].sort((a, b) => a.poste.NU_LONGITUDE - b.poste.NU_LONGITUDE)
        : listaGeo
    let idx = 0
    while (idx < ordenada.length) {
      buckets.sort((a, b) => b.cap - a.cap)
      const alvo = buckets[0]
      if (alvo.cap <= 0) break
      const n = Math.min(alvo.cap, ordenada.length - idx)
      const fatia = ordenada.slice(idx, idx + n)
      alvo.municipios.push({ nome: mun.nome, centro: centro(fatia.map((s) => s.poste)), lista: fatia })
      alvo.cap -= n
      idx += n
    }
  }

  const os = []
  let seq = 0
  for (const b of buckets) {
    // ordena os municípios da equipe por vizinho-mais-próximo a partir da base
    let atual = { lat: b.equipe.LATITUDE_BASE, lng: b.equipe.LONGITUDE_BASE }
    const restantes = [...b.municipios]
    const ordemMun = []
    while (restantes.length) {
      restantes.sort((x, y) => metros(atual, x.centro) - metros(atual, y.centro))
      const prox = restantes.shift()
      ordemMun.push(prox)
      atual = prox.centro
    }

    let diaIdx = 0
    let restanteNoDia = qtdPorDia
    let ultimo = { lat: b.equipe.LATITUDE_BASE, lng: b.equipe.LONGITUDE_BASE }
    // Âncora da SEMANA da equipe (centroide corrido dos postes já alocados).
    // Com raio máximo, nenhum poste da semana fica além desse raio da âncora,
    // pra não jogar a equipe pra longe no meio da semana.
    const ancora = { somaLat: 0, somaLng: 0, n: 0 }
    const dentroDoRaio = (poste) => {
      if (!raioMaximoM || ancora.n === 0) return true
      const c = { lat: ancora.somaLat / ancora.n, lng: ancora.somaLng / ancora.n }
      return metros(c, pt(poste)) <= raioMaximoM
    }

    for (const mun of ordemMun) {
      // postes do município ordenados por vizinho mais próximo (greedy TSP)
      const pend = [...mun.lista]
      while (pend.length) {
        if (diaIdx >= dias.length) break
        const candidatos = pend.filter((x) => dentroDoRaio(x.poste))
        if (!candidatos.length) break // nada nesse município cabe no raio da semana da equipe
        candidatos.sort((x, y) => metros(ultimo, pt(x.poste)) - metros(ultimo, pt(y.poste)))
        const s = candidatos[0]
        pend.splice(pend.indexOf(s), 1)
        const p = s.poste
        const provedores = db.provedoresDoBarramento(p.DE_BARRAMENTO)
        os.push({
          SEQ: ++seq,
          NU_PG_ID: p.NU_PG_ID,
          DE_BARRAMENTO: p.DE_BARRAMENTO,
          MUNICIPIO: p.MUNICIPIO,
          LOCALIDADE: p.LOCALIDADE,
          LATITUDE: p.NU_LATITUDE,
          LONGITUDE: p.NU_LONGITUDE,
          TEM_PROVEDOR: db.basePosteTemProvedor(p.DE_BARRAMENTO) ? "S" : "N",
          QTD_PROVEDORES: provedores.length,
          PROVEDORES: provedores,
          ID_EQUIPE: b.equipe.ID_EQUIPE,
          NOME_EQUIPE: b.equipe.NOME,
          EPS: nomeEps,
          DATA_PREVISTA: dias[diaIdx],
          DIA_INDICE: diaIdx + 1,
          ORDEM_NO_DIA: qtdPorDia - restanteNoDia + 1,
          ESTRATEGIA: s.estrategia || null,
          SCORE: s.score ?? null,
          MOTIVO: s.motivo || null,
          STATUS: "PLANEJADA",
          LINK_GMAPS: linkGmaps(p.NU_LATITUDE, p.NU_LONGITUDE),
          LINK_WAZE: linkWaze(p.NU_LATITUDE, p.NU_LONGITUDE),
        })
        ancora.somaLat += p.NU_LATITUDE
        ancora.somaLng += p.NU_LONGITUDE
        ancora.n++
        ultimo = pt(p)
        if (--restanteNoDia === 0) {
          diaIdx++
          restanteNoDia = qtdPorDia
        }
      }
      if (diaIdx >= dias.length) break
    }
  }
  return os
}

// ------------------------------------------------------------------
// Monta a carteira (preview ou gravação)
// ------------------------------------------------------------------
function montarCarteira(corpo) {
  const frequencia = FREQUENCIAS[corpo.frequencia] ? corpo.frequencia : "SEMANAL"
  const dataInicio = (corpo.data_inicio || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const dias = diasUteis(dataInicio, frequencia)
  const dataFim = dias[dias.length - 1]
  const modo = corpo.modo === "MANUAL" ? "MANUAL" : "AUTOMATICA"
  const qtdPorDia = Math.max(1, Number(corpo.qtd_postes_dia) || 12)
  const raioMaximoKm = Math.max(0, Number(corpo.raio_maximo_km) || 0)

  const idsEquipes = (corpo.ids_equipes || []).map(Number)
  let equipes = db.equipesCampo.filter((e) => e.ATIVO === "S" && idsEquipes.includes(e.ID_EQUIPE))
  if (corpo.id_eps && !equipes.length) {
    equipes = db.equipesCampo.filter((e) => e.ATIVO === "S" && e.ID_EPS === Number(corpo.id_eps))
  }
  if (!equipes.length) return { erro: "Selecione ao menos uma equipe (ou uma EPS com equipes)." }
  const nomeEps = (db.eps.find((e) => e.ID_EPS === Number(corpo.id_eps)) || {}).NOME || equipes[0].EPS || "-"

  // seleção de postes
  let selecionados
  if (modo === "MANUAL") {
    const alvo = new Set(corpo.barramentos || [])
    selecionados = db.basePostes
      .filter((p) => alvo.has(p.DE_BARRAMENTO))
      .map((p) => ({ poste: p, score: 1, motivo: "seleção manual", estrategia: "MANUAL" }))
    if (!selecionados.length) return { erro: "Nenhum poste na seleção manual." }
  } else {
    const estrategia = CODIGOS_ESTRATEGIA.has(corpo.estrategia) ? corpo.estrategia : "VAO_ENTRE_PROVEDORES"
    const escopo = postesNoEscopo(corpo.municipios, corpo.localidades)
    if (!escopo.length) return { erro: "Nenhum poste no escopo (município/localidade)." }
    selecionados = aplicarEstrategia(estrategia, escopo, corpo.params || {}).map((s) => ({ ...s, estrategia }))
    if (!selecionados.length) {
      return { erro: `A estratégia "${estrategia}" não encontrou postes com o critério nesta área.` }
    }
  }

  const os = alocarRota(selecionados, equipes, qtdPorDia, dias, nomeEps, raioMaximoKm * 1000)
  const naoAlocados = Math.max(0, selecionados.length - os.length)

  const cabecalho = {
    TITULO:
      corpo.titulo ||
      `Carteira ${frequencia.toLowerCase()} - ${dataInicio}${modo === "AUTOMATICA" ? ` (${corpo.estrategia || "VAO_ENTRE_PROVEDORES"})` : ""}`,
    FREQUENCIA: frequencia,
    DATA_INICIO: dataInicio,
    DATA_FIM: dataFim,
    MODO: modo,
    ESTRATEGIA: modo === "AUTOMATICA" ? corpo.estrategia || "VAO_ENTRE_PROVEDORES" : null,
    ID_EPS: corpo.id_eps ? Number(corpo.id_eps) : null,
    EPS: nomeEps,
    QTD_POSTES_DIA: qtdPorDia,
    QTD_OS: os.length,
    QTD_EQUIPES: equipes.length,
    STATUS: "RASCUNHO",
  }

  // agrupamentos p/ a tela
  const porDia = dias.map((d, i) => {
    const doDia = os.filter((o) => o.DATA_PREVISTA === d)
    return {
      dia_indice: i + 1,
      data: d,
      qtd: doDia.length,
      municipios: [...new Set(doDia.map((o) => o.MUNICIPIO))],
      equipes: [...new Set(doDia.map((o) => o.NOME_EQUIPE))],
    }
  })
  const porEquipe = equipes.map((e) => {
    const daEquipe = os.filter((o) => o.ID_EQUIPE === e.ID_EQUIPE)
    return {
      id_equipe: e.ID_EQUIPE,
      nome: e.NOME,
      encarregado: e.ENCARREGADO,
      qtd: daEquipe.length,
      municipios: [...new Set(daEquipe.map((o) => o.MUNICIPIO))],
    }
  })
  const resumo = {
    qtd_os: os.length,
    qtd_dias: dias.length,
    qtd_equipes: equipes.length,
    qtd_municipios: new Set(os.map((o) => o.MUNICIPIO)).size,
    sem_provedor: os.filter((o) => o.TEM_PROVEDOR === "N").length,
    com_provedor: os.filter((o) => o.TEM_PROVEDOR === "S").length,
    candidatos_estrategia: selecionados.length,
    capacidade: qtdPorDia * dias.length * equipes.length,
    nao_alocados: naoAlocados,
    raio_maximo_km: raioMaximoKm || null,
  }

  return { cabecalho, os, resumo, por_dia: porDia, por_equipe: porEquipe }
}

// ------------------------------------------------------------------
// Estado em memória
// ------------------------------------------------------------------
let seqCarteira = 0
let seqCarteiraOS = 0
const carteiras = []
const carteiraOS = []

// ------------------------------------------------------------------
// Duplicidade: postes desta carteira que já estão em outra carteira
// já registrada na base (qualquer status). `excluirId` = a própria
// carteira, quando estamos regerando.
// ------------------------------------------------------------------
function conflitosDuplicidade(osLista, excluirId) {
  const alvo = new Set(osLista.map((o) => o.DE_BARRAMENTO))
  const porCarteira = new Map() // id -> Set<barramento>
  for (const o of carteiraOS) {
    if (excluirId != null && o.ID_CARTEIRA === Number(excluirId)) continue
    if (!alvo.has(o.DE_BARRAMENTO)) continue
    if (!porCarteira.has(o.ID_CARTEIRA)) porCarteira.set(o.ID_CARTEIRA, new Set())
    porCarteira.get(o.ID_CARTEIRA).add(o.DE_BARRAMENTO)
  }
  const repetidos = new Set()
  const lista = []
  for (const [idc, set] of porCarteira) {
    const c = carteiras.find((x) => x.ID_CARTEIRA === idc)
    if (!c) continue
    set.forEach((b) => repetidos.add(b))
    lista.push({
      id_carteira: idc,
      titulo: c.TITULO,
      status: c.STATUS,
      data_inicio: c.DATA_INICIO,
      data_fim: c.DATA_FIM,
      qtd_postes: set.size,
    })
  }
  lista.sort((a, b) => String(b.data_inicio).localeCompare(String(a.data_inicio)))
  return {
    tem_conflito: repetidos.size > 0,
    total_postes: repetidos.size,
    total_carteiras: lista.length,
    carteiras: lista,
    ultima: lista[0] || null,
  }
}

function registrar(router) {
  router.get("/api/carteira/estrategias", (req, res) => enviarJson(res, 200, ESTRATEGIAS))

  router.get("/api/carteira/eps", (req, res) =>
    enviarJson(res, 200, db.eps.filter((e) => e.ATIVO === "S")),
  )

  // Area de atuacao das EPS: relacao EPS -> MUNICIPIO. Filtros opcionais
  // (?id_eps=1 e/ou ?municipios=A,B). O gerador escolhe a EPS e restringe
  // os municipios a area dela.
  router.get("/api/carteira/eps-atuacao", (req, res, ctx) => {
    const idEps = ctx.query.get("id_eps") ? Number(ctx.query.get("id_eps")) : null
    const municipios = new Set(
      (ctx.query.get("municipios") || "")
        .split(",")
        .map((m) => m.trim().toUpperCase())
        .filter(Boolean),
    )
    const epsAtivas = new Set(db.eps.filter((e) => e.ATIVO === "S").map((e) => e.ID_EPS))
    const nomeEps = new Map(db.eps.map((e) => [e.ID_EPS, e.NOME]))
    const lista = db.epsAtuacao
      .filter((a) => a.ATIVO === "S" && epsAtivas.has(a.ID_EPS))
      .filter((a) => !idEps || a.ID_EPS === idEps)
      .filter((a) => !municipios.size || municipios.has(String(a.MUNICIPIO).toUpperCase()))
      .map((a) => ({ ID_EPS: a.ID_EPS, NOME: nomeEps.get(a.ID_EPS) || `EPS ${a.ID_EPS}`, MUNICIPIO: a.MUNICIPIO }))
      .sort((a, b) => a.NOME.localeCompare(b.NOME) || a.MUNICIPIO.localeCompare(b.MUNICIPIO))
    enviarJson(res, 200, lista)
  })

  router.get("/api/carteira/equipes", (req, res, ctx) => {
    const idEps = ctx.query.get("eps")
    let lista = db.equipesCampo.filter((e) => e.ATIVO === "S")
    if (idEps) lista = lista.filter((e) => e.ID_EPS === Number(idEps))
    enviarJson(res, 200, lista)
  })

  router.get("/api/carteira/areas", (req, res) => {
    const porMun = {}
    for (const p of db.basePostes) {
      const m = (porMun[p.MUNICIPIO] ||= { MUNICIPIO: p.MUNICIPIO, TOTAL: 0, SEM_PROVEDOR: 0, _loc: {} })
      m.TOTAL++
      const semProv = !db.basePosteTemProvedor(p.DE_BARRAMENTO)
      if (semProv) m.SEM_PROVEDOR++
      const l = (m._loc[p.NU_LOCALIDADE_ID] ||= {
        NU_LOCALIDADE_ID: p.NU_LOCALIDADE_ID,
        LOCALIDADE: p.LOCALIDADE,
        TOTAL: 0,
        SEM_PROVEDOR: 0,
      })
      l.TOTAL++
      if (semProv) l.SEM_PROVEDOR++
    }
    const lista = Object.values(porMun)
      .map(({ _loc, ...m }) => ({ ...m, localidades: Object.values(_loc).sort((a, b) => a.LOCALIDADE.localeCompare(b.LOCALIDADE)) }))
      .sort((a, b) => b.SEM_PROVEDOR - a.SEM_PROVEDOR)
    enviarJson(res, 200, lista)
  })

  router.post("/api/carteira/preview", async (req, res, ctx) => {
    const corpo = ctx.body || {}
    const r = montarCarteira(corpo)
    if (r.erro) return erroDetalhe(res, 400, r.erro)
    enviarJson(res, 200, {
      carteira: r.cabecalho,
      os: r.os,
      resumo: r.resumo,
      por_dia: r.por_dia,
      por_equipe: r.por_equipe,
      duplicidade: conflitosDuplicidade(r.os, corpo.id_carteira),
    })
  })

  function paramsJson(corpo) {
    return JSON.stringify({
      municipios: corpo.municipios || [],
      localidades: corpo.localidades || [],
      params: corpo.params || {},
      ids_equipes: corpo.ids_equipes || [],
      barramentos: corpo.barramentos || [],
      raio_maximo_km: Math.max(0, Number(corpo.raio_maximo_km) || 0) || null,
    })
  }

  router.post("/api/carteira/gerar", async (req, res, ctx) => {
    const corpo = ctx.body || {}
    const r = montarCarteira(corpo)
    if (r.erro) return erroDetalhe(res, 400, r.erro)

    const dup = conflitosDuplicidade(r.os, null)
    if (dup.tem_conflito && corpo.forcar !== true) {
      return enviarJson(res, 409, {
        erro_duplicidade: true,
        detail: `${dup.total_postes} poste(s) já estão em ${dup.total_carteiras} outra(s) carteira(s).`,
        duplicidade: dup,
      })
    }

    const id = ++seqCarteira
    const carteira = {
      ID_CARTEIRA: id,
      ...r.cabecalho,
      PARAMETROS_JSON: paramsJson(corpo),
      CREATED_AT: new Date().toISOString(),
      CREATED_BY: corpo.usuario || "dev.local",
      UPDATED_AT: new Date().toISOString(),
    }
    carteiras.push(carteira)
    for (const o of r.os) {
      carteiraOS.push({ ID_CARTEIRA_OS: ++seqCarteiraOS, ID_CARTEIRA: id, CREATED_AT: carteira.CREATED_AT, ...o })
    }
    enviarJson(res, 201, {
      success: true,
      id_carteira: id,
      carteira,
      resumo: r.resumo,
      por_dia: r.por_dia,
      por_equipe: r.por_equipe,
      duplicidade: dup,
    })
  })

  // Regera uma carteira RASCUNHO com novos critérios (mesmo ID, troca as OS).
  router.post("/api/carteira/:id/regerar", async (req, res, ctx) => {
    const id = Number(ctx.params.id)
    const carteira = carteiras.find((c) => c.ID_CARTEIRA === id)
    if (!carteira) return erroDetalhe(res, 404, "Carteira não encontrada")
    if (carteira.STATUS !== "RASCUNHO") {
      return erroDetalhe(res, 409, "Só é possível regerar uma carteira em rascunho.")
    }
    const corpo = ctx.body || {}
    const r = montarCarteira(corpo)
    if (r.erro) return erroDetalhe(res, 400, r.erro)

    const dup = conflitosDuplicidade(r.os, id)
    if (dup.tem_conflito && corpo.forcar !== true) {
      return enviarJson(res, 409, {
        erro_duplicidade: true,
        detail: `${dup.total_postes} poste(s) já estão em ${dup.total_carteiras} outra(s) carteira(s).`,
        duplicidade: dup,
      })
    }

    Object.assign(carteira, r.cabecalho, {
      ID_CARTEIRA: id,
      STATUS: "RASCUNHO",
      PARAMETROS_JSON: paramsJson(corpo),
      UPDATED_AT: new Date().toISOString(),
    })
    for (let i = carteiraOS.length - 1; i >= 0; i--) {
      if (carteiraOS[i].ID_CARTEIRA === id) carteiraOS.splice(i, 1)
    }
    for (const o of r.os) {
      carteiraOS.push({ ID_CARTEIRA_OS: ++seqCarteiraOS, ID_CARTEIRA: id, CREATED_AT: carteira.CREATED_AT, ...o })
    }
    enviarJson(res, 200, {
      success: true,
      id_carteira: id,
      carteira,
      resumo: r.resumo,
      por_dia: r.por_dia,
      por_equipe: r.por_equipe,
      duplicidade: dup,
    })
  })

  router.get("/api/carteira", (req, res) => {
    const lista = [...carteiras]
      .sort((a, b) => String(b.CREATED_AT).localeCompare(String(a.CREATED_AT)))
      .map((c) => ({ ...c }))
    enviarJson(res, 200, lista)
  })

  router.get("/api/carteira/:id", (req, res, ctx) => {
    const carteira = carteiras.find((c) => c.ID_CARTEIRA === Number(ctx.params.id))
    if (!carteira) return erroDetalhe(res, 404, "Carteira não encontrada")
    const os = carteiraOS
      .filter((o) => o.ID_CARTEIRA === carteira.ID_CARTEIRA)
      .sort((a, b) => a.SEQ - b.SEQ)
    const dias = [...new Set(os.map((o) => o.DATA_PREVISTA))].sort()
    const equipes = [...new Set(os.map((o) => o.NOME_EQUIPE))]
    enviarJson(res, 200, {
      carteira,
      os,
      resumo: {
        qtd_os: os.length,
        qtd_dias: dias.length,
        qtd_equipes: equipes.length,
        qtd_municipios: new Set(os.map((o) => o.MUNICIPIO)).size,
        sem_provedor: os.filter((o) => o.TEM_PROVEDOR === "N").length,
        com_provedor: os.filter((o) => o.TEM_PROVEDOR === "S").length,
      },
      por_dia: dias.map((d, i) => {
        const doDia = os.filter((o) => o.DATA_PREVISTA === d)
        return {
          dia_indice: i + 1,
          data: d,
          qtd: doDia.length,
          municipios: [...new Set(doDia.map((o) => o.MUNICIPIO))],
          equipes: [...new Set(doDia.map((o) => o.NOME_EQUIPE))],
        }
      }),
      por_equipe: equipes.map((nome) => {
        const daEquipe = os.filter((o) => o.NOME_EQUIPE === nome)
        return { nome, qtd: daEquipe.length, municipios: [...new Set(daEquipe.map((o) => o.MUNICIPIO))] }
      }),
    })
  })

  router.patch("/api/carteira/:id/status", async (req, res, ctx) => {
    const carteira = carteiras.find((c) => c.ID_CARTEIRA === Number(ctx.params.id))
    if (!carteira) return erroDetalhe(res, 404, "Carteira não encontrada")
    const novo = (ctx.body || {}).status
    if (!["RASCUNHO", "PUBLICADA", "CONCLUIDA", "CANCELADA"].includes(novo)) {
      return erroDetalhe(res, 400, "status inválido")
    }
    carteira.STATUS = novo
    carteira.UPDATED_AT = new Date().toISOString()
    enviarJson(res, 200, { success: true, status: novo })
  })

  router.delete("/api/carteira/:id", async (req, res, ctx) => {
    const id = Number(ctx.params.id)
    const idx = carteiras.findIndex((c) => c.ID_CARTEIRA === id)
    if (idx === -1) return erroDetalhe(res, 404, "Carteira não encontrada")
    carteiras.splice(idx, 1)
    for (let i = carteiraOS.length - 1; i >= 0; i--) {
      if (carteiraOS[i].ID_CARTEIRA === id) carteiraOS.splice(i, 1)
    }
    enviarJson(res, 200, { success: true, id_carteira: id })
  })
}

module.exports = { registrar }
