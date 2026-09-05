"use strict"

// "Banco de dados" fictício em memória. Reinicia zerado a cada vez que o
// servidor sobe. Nomes de campos em UPPER_SNAKE_CASE seguem exatamente as
// colunas devolvidas pelo backend real (checado lendo routers/postes.py,
// routers/entrantes.py e routers/processos.py), pra o frontend renderizar
// sem precisar de nenhum ajuste quando o dia vier de apontar pro HANA real.

function agora() {
  return new Date().toISOString()
}

function aleatorio(min, max) {
  return min + Math.random() * (max - min)
}

// Data (só a parte YYYY-MM-DD) a partir de hoje + offsetDias (pode ser negativo).
function dataDeHoje(offsetDias) {
  const data = new Date()
  data.setDate(data.getDate() + offsetDias)
  return data.toISOString().slice(0, 10)
}

// =====================================================
// Postes / Ocupações / Operadoras (Mapa de Postes)
// =====================================================

const CENTRO = { lng: -38.5014, lat: -12.9822 } // Salvador/BA

const operadoras = [
  { ID: 1, RAZAO_SOCIAL: "Telecom Bahia Fibra Ltda", CNPJ: "12.345.678/0001-90" },
  { ID: 2, RAZAO_SOCIAL: "NetSul Conectividade S.A.", CNPJ: "23.456.789/0001-01" },
  { ID: 3, RAZAO_SOCIAL: "Conecta Norte Telecom Ltda", CNPJ: "34.567.890/0001-12" },
  { ID: 4, RAZAO_SOCIAL: "Fibra Total Comunicações S.A.", CNPJ: "45.678.901/0001-23" },
  { ID: 5, RAZAO_SOCIAL: "Rede Ágil Internet Ltda", CNPJ: "56.789.012/0001-34" },
]

const postes = []
const ocupacoes = []
let proximoIdOcupacao = 1

const TOTAL_POSTES = 260
for (let i = 1; i <= TOTAL_POSTES; i++) {
  const barramento = `PST-${String(i).padStart(5, "0")}`
  const x = Number((CENTRO.lng + aleatorio(-0.09, 0.09)).toFixed(6))
  const y = Number((CENTRO.lat + aleatorio(-0.07, 0.07)).toFixed(6))
  const identificado = Math.random() < 0.42

  postes.push({
    BARRAMENTO: barramento,
    X: x,
    Y: y,
    TEM_OCUPACAO_IDENTIFICADA: identificado ? "S" : "N",
  })

  if (identificado) {
    const qtd = 1 + Math.floor(Math.random() * 2)
    for (let j = 0; j < qtd; j++) {
      const operadora = operadoras[Math.floor(Math.random() * operadoras.length)]
      ocupacoes.push({
        ID: proximoIdOcupacao++,
        BARRAMENTO: barramento,
        BOARD_NAME: `Caixa ${String.fromCharCode(65 + j)} - ${10 + Math.floor(Math.random() * 80)}FO`,
        ORGANIZATION_NAME: operadora.RAZAO_SOCIAL,
        CNPJ: operadora.CNPJ,
        RAZAO_SOCIAL: operadora.RAZAO_SOCIAL,
        _idOperadora: operadora.ID,
      })
    }
  } else if (Math.random() < 0.15) {
    // Ocupação existe mas a organização não bate com nenhuma operadora cadastrada.
    ocupacoes.push({
      ID: proximoIdOcupacao++,
      BARRAMENTO: barramento,
      BOARD_NAME: `Caixa X - ${10 + Math.floor(Math.random() * 80)}FO`,
      ORGANIZATION_NAME: null,
      CNPJ: null,
      RAZAO_SOCIAL: null,
      _idOperadora: null,
    })
  }
}

// Capacidade estrutural (pontos de fixação disponíveis para terceiros) e
// quantos pontos estão ocupados hoje - base do indicador de saturação do
// parque. PONTOS_OCUPADOS nunca fica abaixo do nº de ocupações mapeadas e
// pode passar da capacidade (poste em sobrecarga).
for (const poste of postes) {
  const nOcupacoes = ocupacoes.filter((o) => o.BARRAMENTO === poste.BARRAMENTO).length
  poste.CAPACIDADE = 3 + Math.floor(Math.random() * 4) // 3..6
  poste.PONTOS_OCUPADOS = Math.max(nOcupacoes, Math.round(poste.CAPACIDADE * aleatorio(0.15, 1.25)))
}

// =====================================================
// Base de Postes Coelba (cadastro de ativos - espelha
// sql/PORTAL_COMPARTILHAMENTO_BASE_POSTE.sql). E a base MESTRE: muito
// maior que `postes` (que e so o parque com ocupacao mapeada). Aqui geramos
// alguns milhares distribuidos por municipio/localidade; ~15% reaproveitam
// um DE_BARRAMENTO que ja tem ocupacao com operadora (= "com provedor").
// =====================================================
const MUNICIPIOS_BASE = [
  { nome: "SALVADOR", centro: { lat: -12.98, lng: -38.48 } },
  { nome: "FEIRA DE SANTANA", centro: { lat: -12.27, lng: -38.96 } },
  { nome: "CAMACARI", centro: { lat: -12.70, lng: -38.32 } },
  { nome: "PORTO SEGURO", centro: { lat: -16.45, lng: -39.09 } },
  { nome: "ILHEUS", centro: { lat: -14.79, lng: -39.05 } },
]
const NOMES_LOCALIDADE = [
  "Centro", "Parque Industrial", "Zona Norte", "Litoral", "Distrito Rural",
  "Bairro Novo", "Cidade Alta", "Beira Rio",
]

const basePostes = []
const baseLocalidades = []
let nuLocalidadeSeq = 30900000
let nuPgSeq = 100000000

// Barramentos que ja tem operadora resolvida (via `ocupacoes`). Postes da
// base "com provedor" reusam um deles - assim o vinculo e real e a lista
// de provedores no mapa funciona.
const barramentosComOperadora = [...new Set(ocupacoes.filter((o) => o._idOperadora).map((o) => o.BARRAMENTO))]
let idxBarramentoComOp = 0
function proximoBarramentoComOp() {
  return barramentosComOperadora.length
    ? barramentosComOperadora[idxBarramentoComOp++ % barramentosComOperadora.length]
    : `PST-${String(90000 + idxBarramentoComOp++).padStart(5, "0")}`
}

// Postes gerados ao longo de "ruas" (segmentos), com espacamento de ~35 m e
// um perfil de atendimento por rua. Isso cria corredores contiguos com e
// sem provedor (e vaos isolados dentro de ruas atendidas) - necessario para
// as estrategias espaciais do gerador de carteira fazerem sentido.
const PERFIL_PROB = { ALTA: 0.82, MISTA: 0.45, BAIXA: 0.07 }
const PERFIS = ["ALTA", "ALTA", "MISTA", "BAIXA"]
const ESPACO_POSTE_M = 35

for (const mun of MUNICIPIOS_BASE) {
  const qtdLoc = 4 + Math.floor(Math.random() * 3) // 4..6 localidades
  for (let l = 0; l < qtdLoc; l++) {
    const nuLocalidadeId = (nuLocalidadeSeq += 1000)
    const nome = `${NOMES_LOCALIDADE[l % NOMES_LOCALIDADE.length]} ${l + 1}`
    const centroLoc = {
      lat: mun.centro.lat + aleatorio(-0.05, 0.05),
      lng: mun.centro.lng + aleatorio(-0.05, 0.05),
    }
    baseLocalidades.push({ NU_LOCALIDADE_ID: nuLocalidadeId, LOCALIDADE: nome, MUNICIPIO: mun.nome, _centro: centroLoc })

    const nRuas = 12 + Math.floor(Math.random() * 9) // 12..20 ruas
    for (let r = 0; r < nRuas; r++) {
      const bearing = Math.random() * Math.PI * 2
      const comprimentoM = 140 + Math.random() * 320 // 140..460 m
      const ini = {
        lat: centroLoc.lat + aleatorio(-0.02, 0.02),
        lng: centroLoc.lng + aleatorio(-0.02, 0.02),
      }
      const dLatTot = (comprimentoM / 111000) * Math.sin(bearing)
      const dLngTot = (comprimentoM / 108000) * Math.cos(bearing)
      const perfil = PERFIS[Math.floor(Math.random() * PERFIS.length)]
      const probProv = PERFIL_PROB[perfil]
      const nPostes = Math.max(3, Math.round(comprimentoM / ESPACO_POSTE_M))

      for (let k = 0; k < nPostes; k++) {
        const t = nPostes > 1 ? k / (nPostes - 1) : 0
        const jitterLat = aleatorio(-0.00004, 0.00004)
        const jitterLng = aleatorio(-0.00004, 0.00004)
        const temProv = Math.random() < probProv
        const deBarramento = temProv
          ? proximoBarramentoComOp()
          : `${Math.random() < 0.5 ? "T" : "L"}${String(100000 + Math.floor(Math.random() * 899999))}`
        basePostes.push({
          NU_PG_ID: ++nuPgSeq,
          NU_LOCALIDADE_ID: nuLocalidadeId,
          LOCALIDADE: nome,
          DE_BARRAMENTO: deBarramento,
          MUNICIPIO: mun.nome,
          UF: "BA",
          NU_LATITUDE: Number((ini.lat + dLatTot * t + jitterLat).toFixed(8)),
          NU_LONGITUDE: Number((ini.lng + dLngTot * t + jitterLng).toFixed(8)),
          DATA_ATUALIZACAO: new Date(Date.now() - Math.floor(Math.random() * 180) * 86400000).toISOString(),
          CARGA_ID: "CARGA-2026-001",
          ATIVO: "S",
        })
      }
    }
  }
}

// Índice: barramento -> tem operadora resolvida?
const barramentosResolvidos = new Set(barramentosComOperadora)
function basePosteTemProvedor(deBarramento) {
  return barramentosResolvidos.has(deBarramento)
}

// Provedores (operadoras distintas) conectados naquele barramento, via
// POSTE_OCUPACAO. Usado no Mapa de Postes e no gerador de Carteira.
function provedoresDoBarramento(deBarramento) {
  const vistos = new Set()
  const lista = []
  for (const o of ocupacoes) {
    if (o.BARRAMENTO !== deBarramento || !o._idOperadora) continue
    const chave = o.CNPJ || o.RAZAO_SOCIAL || String(o._idOperadora)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    lista.push({ RAZAO_SOCIAL: o.RAZAO_SOCIAL || o.ORGANIZATION_NAME || null, CNPJ: o.CNPJ || null })
  }
  return lista
}

// =====================================================
// Rede de distribuição (trechos de média e baixa tensão)
// espelha sql/PORTAL_COMPARTILHAMENTO_TRECHO_REDE.sql.
//
// Gera uma rede fictícia coerente: cada alimentador tem um TRONCO de MT
// e RAMAIS de BT pendurados nele, com postes a ~40 m. Alguns ramais
// recebem fibra de uma operadora com "buracos" de propósito (poste no
// meio do corredor sem ocupação) - é o alvo da análise de não faturados.
// =====================================================
function _mts(a, b) {
  const dLat = (a.Y - b.Y) * 111000
  const dLng = (a.X - b.X) * 108000
  return Math.hypot(dLat, dLng)
}

const redeTrechos = []
const redeNos = [] // { BARRAMENTO, X, Y, MUNICIPIO, ALIMENTADOR, ENTIDADE }
const redeNoPorBarramento = new Map()
let _seqTrecho = 700000
let _seqNoRede = 0

const M_EM_GRAU_LAT = 1 / 111000
const M_EM_GRAU_LNG = 1 / 108000

const _ALIMENTADORES = [
  { cod: "SDR-07Z1", municipio: "SALVADOR", centro: { lng: -38.505, lat: -12.985 } },
  { cod: "SDR-12Z3", municipio: "SALVADOR", centro: { lng: -38.472, lat: -12.955 } },
  { cod: "LDF-03Z1", municipio: "LAURO DE FREITAS", centro: { lng: -38.33, lat: -12.9 } },
  { cod: "LDF-08Z2", municipio: "LAURO DE FREITAS", centro: { lng: -38.35, lat: -12.86 } },
  { cod: "CAM-01Z1", municipio: "CAMACARI", centro: { lng: -38.32, lat: -12.7 } },
  { cod: "SMF-05Z1", municipio: "SIMOES FILHO", centro: { lng: -38.4, lat: -12.78 } },
]

function _novoNoRede(x, y, municipio, alimentador, entidade) {
  const barr = `RDE-${String(++_seqNoRede).padStart(5, "0")}`
  const no = { BARRAMENTO: barr, X: Number(x.toFixed(6)), Y: Number(y.toFixed(6)), MUNICIPIO: municipio, ALIMENTADOR: alimentador, ENTIDADE: entidade }
  redeNos.push(no)
  redeNoPorBarramento.set(barr, no)
  return no
}

function _pushTrechoRede(a, b, entidade) {
  const ext = _mts(a, b)
  redeTrechos.push({
    ID_TRECHO: ++_seqTrecho,
    MUNICIPIO: a.MUNICIPIO,
    ID_TBT: 14000000 + _seqTrecho,
    PG_INICIAL: 21000000 + Number(a.BARRAMENTO.slice(-5)),
    PG_FINAL: 21000000 + Number(b.BARRAMENTO.slice(-5)),
    BARRAMENTO_INICIAL: a.BARRAMENTO,
    LONGITUDE_INICIAL: a.X,
    LATITUDE_INICIAL: a.Y,
    BARRAMENTO_FINAL: b.BARRAMENTO,
    LONGITUDE_FINAL: b.X,
    LATITUDE_FINAL: b.Y,
    ALIMENTADOR: a.ALIMENTADOR,
    EXTENSAO_M: Number(ext.toFixed(2)),
    ENTIDADE: entidade,
    ATIVO: "S",
  })
}

function _ocuparNoRede(barr, op) {
  if (ocupacoes.some((o) => o.BARRAMENTO === barr && o._idOperadora === op.ID)) return
  ocupacoes.push({
    ID: proximoIdOcupacao++,
    BARRAMENTO: barr,
    BOARD_NAME: "Caixa Fibra - 24FO",
    ORGANIZATION_NAME: op.RAZAO_SOCIAL,
    CNPJ: op.CNPJ,
    RAZAO_SOCIAL: op.RAZAO_SOCIAL,
    _idOperadora: op.ID,
  })
}

const _cenariosNaoFaturado = [] // pra conferência no console

_ALIMENTADORES.forEach((alim, ai) => {
  const espMT = 90 // ~90 m entre postes de MT (tronco)
  const espBT = 40 // ~40 m entre postes de BT (ramal)
  const nTronco = 8 + (ai % 3) // 8..10 postes de tronco
  const rumoTronco = (ai * 1.1) % (Math.PI * 2)

  // tronco de MT
  const tronco = []
  let px = alim.centro.lng
  let py = alim.centro.lat
  for (let i = 0; i < nTronco; i++) {
    const no = _novoNoRede(px, py, alim.municipio, alim.cod, "TRECHO DE MT")
    tronco.push(no)
    if (i > 0) _pushTrechoRede(tronco[i - 1], no, "TRECHO DE MT")
    px += Math.cos(rumoTronco) * espMT * M_EM_GRAU_LNG
    py += Math.sin(rumoTronco) * espMT * M_EM_GRAU_LAT
  }

  // ramais de BT pendurados no tronco
  const opsDoAlim = [operadoras[ai % operadoras.length], operadoras[(ai + 2) % operadoras.length]]
  let ramalIdx = 0
  for (let t = 1; t < tronco.length - 1; t++) {
    const nRamais = 1 + (t % 2) // 1 ou 2 ramais por poste do tronco
    for (let r = 0; r < nRamais; r++) {
      ramalIdx++
      const rumo = rumoTronco + (r === 0 ? Math.PI / 2 : -Math.PI / 2) + aleatorio(-0.3, 0.3)
      const nPostes = 5 + Math.floor(Math.random() * 7) // 5..11 postes no ramal
      let ax = tronco[t].X
      let ay = tronco[t].Y
      let anterior = tronco[t]
      const doRamal = []
      for (let k = 0; k < nPostes; k++) {
        ax += Math.cos(rumo) * espBT * M_EM_GRAU_LNG
        ay += Math.sin(rumo) * espBT * M_EM_GRAU_LAT
        const no = _novoNoRede(ax, ay, alim.municipio, alim.cod, "TRECHO DE BT")
        _pushTrechoRede(anterior, no, "TRECHO DE BT")
        anterior = no
        doRamal.push(no)
      }

      // Fibra de uma operadora ocupando parte do ramal, com "buraco":
      // ocupa do poste 0 ao N, pula 1-2 no meio, retoma. Os pulados são
      // os "deveria estar faturado e não está".
      const op = opsDoAlim[ramalIdx % opsDoAlim.length]
      const comFibra = ramalIdx % 3 !== 0 // ~2/3 dos ramais têm fibra
      if (comFibra && doRamal.length >= 4) {
        const buracoIni = 1 + Math.floor(Math.random() * (doRamal.length - 3))
        const buracoLen = 1 + (ramalIdx % 2) // 1 ou 2 postes no buraco
        doRamal.forEach((no, idx) => {
          const dentroBuraco = idx >= buracoIni && idx < buracoIni + buracoLen
          if (!dentroBuraco) _ocuparNoRede(no.BARRAMENTO, op)
          else
            _cenariosNaoFaturado.push({
              barramento: no.BARRAMENTO,
              alimentador: alim.cod,
              operadora: op.RAZAO_SOCIAL,
            })
        })
      }
    }
  }
})

// alguns nós com organização "desconhecida" (possível provedor clandestino
// sem operadora cadastrada) espalhados pela rede
for (let i = 0; i < 8; i++) {
  const no = redeNos[Math.floor(Math.random() * redeNos.length)]
  if (!no || ocupacoes.some((o) => o.BARRAMENTO === no.BARRAMENTO)) continue
  ocupacoes.push({
    ID: proximoIdOcupacao++,
    BARRAMENTO: no.BARRAMENTO,
    BOARD_NAME: "Caixa X - 12FO",
    ORGANIZATION_NAME: null,
    CNPJ: null,
    RAZAO_SOCIAL: null,
    _idOperadora: null,
  })
}

// =====================================================
// EPS (Empresa Prestadora de Serviço) e equipes de campo
// (espelha sql/PORTAL_COMPARTILHAMENTO_CARTEIRA.sql). Alimentam o
// gerador de Carteira de Serviço.
// =====================================================
const eps = [
  { ID_EPS: 1, NOME: "CADIC", CNPJ: "10.111.222/0001-33", TIPO_SERVICO: "AMBOS", ATIVO: "S" },
  { ID_EPS: 2, NOME: "ELEKTRA", CNPJ: "20.222.333/0001-44", TIPO_SERVICO: "AMBOS", ATIVO: "S" },
  { ID_EPS: 3, NOME: "ORC", CNPJ: "30.333.444/0001-55", TIPO_SERVICO: "AMBOS", ATIVO: "S" },
  { ID_EPS: 4, NOME: "DINAMO", CNPJ: "40.444.555/0001-66", TIPO_SERVICO: "AMBOS", ATIVO: "S" },
]

const equipesCampo = []
let seqEquipeCampo = 0
{
  // 2-3 equipes por EPS, com município-base entre os da Base de Postes.
  const munBase = MUNICIPIOS_BASE.map((m) => ({ nome: m.nome, ...m.centro }))
  eps.forEach((e, idxEps) => {
    const qtd = 2 + (idxEps % 2)
    for (let k = 0; k < qtd; k++) {
      const base = munBase[(idxEps + k) % munBase.length]
      equipesCampo.push({
        ID_EQUIPE: ++seqEquipeCampo,
        ID_EPS: e.ID_EPS,
        NOME: `Turma ${String.fromCharCode(65 + seqEquipeCampo - 1)}`,
        ENCARREGADO: `Encarregado ${String(seqEquipeCampo).padStart(2, "0")}`,
        MUNICIPIO_BASE: base.nome,
        LATITUDE_BASE: Number(base.lat.toFixed(8)),
        LONGITUDE_BASE: Number(base.lng.toFixed(8)),
        TIPO: e.TIPO_SERVICO === "REMOCAO" ? "REMOCAO" : "FISCALIZACAO",
        ATIVO: "S",
      })
    }
  })
}

// Area de atuacao das EPS (tabela de suporte): relaciona cada EPS aos
// municipios onde atende. Espelha sql/PORTAL_COMPARTILHAMENTO_EPS_ATUACAO.sql.
// E a fonte de "qual EPS atende cada municipio" no gerador de carteira -
// o usuario escolhe a EPS e os municipios se restringem a area dela.
const EPS_MUNICIPIOS = {
  1: ["SALVADOR", "CAMACARI"],              // CADIC
  2: ["SALVADOR", "FEIRA DE SANTANA"],      // ELEKTRA
  3: ["CAMACARI", "PORTO SEGURO"],          // ORC
  4: ["ILHEUS", "PORTO SEGURO"],            // DINAMO
}
const epsAtuacao = []
{
  let seq = 0
  for (const [idEps, muns] of Object.entries(EPS_MUNICIPIOS)) {
    for (const mun of muns) {
      epsAtuacao.push({ ID: ++seq, ID_EPS: Number(idEps), MUNICIPIO: mun, ATIVO: "S" })
    }
  }
}

let proximoIdAcao = 1
const acoes = []

function novaAcao({ tipo, titulo, responsavel, prazo, status, qtdPostes, bounds, observacao, criadoPor, barramentos }) {
  const id = proximoIdAcao++
  const carimbo = agora()
  acoes.push({
    ID_ACAO: id,
    TIPO: tipo,
    TITULO: titulo,
    RESPONSAVEL: responsavel,
    PRAZO: prazo,
    STATUS: status,
    QTD_POSTES: qtdPostes,
    MIN_X: bounds ? bounds.min_x : null,
    MAX_X: bounds ? bounds.max_x : null,
    MIN_Y: bounds ? bounds.min_y : null,
    MAX_Y: bounds ? bounds.max_y : null,
    OBSERVACAO: observacao ?? null,
    CREATED_AT: carimbo,
    CREATED_BY: criadoPor ?? "dev.local",
    UPDATED_AT: carimbo,
    _barramentos: barramentos ?? [],
  })
  return id
}

function barramentosDentroDe(bounds) {
  return postes
    .filter((p) => p.X >= bounds.min_x && p.X <= bounds.max_x && p.Y >= bounds.min_y && p.Y <= bounds.max_y)
    .map((p) => p.BARRAMENTO)
}

function barramentosAleatorios(qtd) {
  return postes.slice(0, qtd).map((p) => p.BARRAMENTO)
}

const boundsPituba = { min_x: -38.46, max_x: -38.43, min_y: -13.01, max_y: -12.98 }
const boundsBarra = { min_x: -38.53, max_x: -38.5, min_y: -13.02, max_y: -12.99 }

novaAcao({
  tipo: "FISCALIZACAO",
  titulo: "Fiscalização setor Pituba",
  responsavel: "maria.souza",
  prazo: "2026-09-05",
  status: "ABERTA",
  qtdPostes: barramentosDentroDe(boundsPituba).length,
  bounds: boundsPituba,
  barramentos: barramentosDentroDe(boundsPituba),
})
novaAcao({
  tipo: "ORDENAMENTO",
  titulo: "Ordenamento Barra",
  responsavel: "joao.lima",
  prazo: "2026-09-15",
  status: "ABERTA",
  qtdPostes: barramentosDentroDe(boundsBarra).length,
  bounds: boundsBarra,
  barramentos: barramentosDentroDe(boundsBarra),
})
novaAcao({
  tipo: "FISCALIZACAO",
  titulo: "Fiscalização Rio Vermelho",
  responsavel: "maria.souza",
  prazo: "2026-07-20",
  status: "CONCLUIDA",
  qtdPostes: 20,
  bounds: null,
  barramentos: barramentosAleatorios(20),
})
novaAcao({
  tipo: "ORDENAMENTO",
  titulo: "Ordenamento Itapuã",
  responsavel: null,
  prazo: "2026-08-01",
  status: "CANCELADA",
  qtdPostes: 5,
  bounds: null,
  barramentos: barramentosAleatorios(5),
})

const analistas = [
  { LOGIN: "maria.souza", NOME: "Maria Souza" },
  { LOGIN: "joao.lima", NOME: "João Lima" },
  { LOGIN: "dev.local", NOME: "Usuário de Desenvolvimento" },
]

// =====================================================
// Etapas do fluxo de processo (catálogo fixo, igual pros 4 processos)
// =====================================================

const etapas = [
  { ID_ETAPA: 1, NOME_ETAPA: "ANALISE CADASTRAL", ORDEM_FLUXO: 1, SLA_DIAS: 5, ETAPA_CRITICA: "S", OBRIGA_DOCUMENTO: "N" },
  { ID_ETAPA: 2, NOME_ETAPA: "DOCUMENTACAO", ORDEM_FLUXO: 2, SLA_DIAS: 10, ETAPA_CRITICA: "S", OBRIGA_DOCUMENTO: "S" },
  { ID_ETAPA: 3, NOME_ETAPA: "APROVACAO", ORDEM_FLUXO: 3, SLA_DIAS: 5, ETAPA_CRITICA: "S", OBRIGA_DOCUMENTO: "N" },
  { ID_ETAPA: 4, NOME_ETAPA: "CONTRATACAO", ORDEM_FLUXO: 4, SLA_DIAS: 15, ETAPA_CRITICA: "N", OBRIGA_DOCUMENTO: "N" },
]

const TIPOS_DOCUMENTO_OBRIGATORIOS = [
  "CARTAO_CNPJ",
  "INSCRICAO_ESTADUAL",
  "INSCRICAO_MUNICIPAL",
  "CONTRATO_SOCIAL",
  "TERMO_OCUPACAO",
  "RG_CPF",
  "DECLARACAO_ANATEL",
  "FICHA_CADASTRAL",
]

function normalizarNomeEtapa(nome) {
  return (nome || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
}

function etapaPorId(idEtapa) {
  return etapas.find((e) => e.ID_ETAPA === idEtapa)
}

function etapaPorOrdem(ordem) {
  return etapas.find((e) => e.ORDEM_FLUXO === ordem)
}

// =====================================================
// Novos Entrantes
// =====================================================

let proximoIdEntrada = 1
const entrantes = []
let proximoIdHistorico = 1
const historicoEntrada = []

function novaEntrada(campos) {
  const id = proximoIdEntrada++
  const carimbo = agora()
  const entrada = {
    ID_ENTRADA: id,
    ID_FORMS: `FORM-${1000 + id}`,
    STATUS_ENTRADA: "NOVO",
    MOTIVO_DESCARTE: null,
    DATA_RECEBIMENTO: carimbo,
    DATA_IMPORTACAO: carimbo,
    ID_PROCESSO: null,
    ID_PROVEDOR: null,
    RAZAO_SOCIAL: null,
    NOME_FANTASIA: null,
    CNPJ: null,
    LOGRADOURO: "Av. Fictícia",
    NUMERO_ENDERECO: "100",
    BAIRRO: "Centro",
    CEP: "40000-000",
    MUNICIPIO: "Salvador",
    UF: "BA",
    EMAIL_CONTATO: null,
    TELEFONE_CONTATO: null,
    INSCRICAO_MUNICIPAL: "0000001",
    INSCRICAO_ESTADUAL: "000.000.00-1",
    PROCESSO_SEI_ANATEL: null,
    POSSUI_GEOS: "N",
    POSSUI_OS_GEOS: "N",
    NOME_RESPONSAVEL: null,
    CPF_RESPONSAVEL: "000.000.000-00",
    RG_RESPONSAVEL: "0000000000",
    EMAIL_RESPONSAVEL: null,
    TELEFONE_RESPONSAVEL: null,
    REDE_FIBRA: "S",
    ATENDE_DIS_NOR_056: "S",
    QTD_MUNICIPIOS: 1,
    MUNICIPIOS_ATUACAO: "Salvador",
    QTD_POSTES: 50,
    INFORMACOES_ADICIONAIS: null,
    ACEITE_DECLARACAO: "S",
    CREATED_AT: carimbo,
    CREATED_BY: "importacao-forms",
    UPDATED_AT: carimbo,
    UPDATED_BY: null,
    DELETED_AT: null,
    DELETED_BY: null,
    ATIVO: "S",
    CLASSIFICACAO: null,
    PRIORIDADE: "MEDIA",
    POTENCIAL_RECEITA: null,
    OBSERVACOES: null,
    RESPONSAVEL_ANALISE: null,
    PRAZO_ANALISE: null,
    DATA_ATRIBUICAO: null,
    ...campos,
  }
  entrantes.push(entrada)
  return entrada
}

function registrarHistoricoEntrada(idEntrada, statusAnterior, statusNovo, observacao) {
  historicoEntrada.push({
    ID_HISTORICO: proximoIdHistorico++,
    ID_ENTRADA: idEntrada,
    STATUS_ANTERIOR: statusAnterior,
    STATUS_NOVO: statusNovo,
    USUARIO: "dev.local",
    OBSERVACAO: observacao ?? null,
    DATA_EVENTO: agora(),
  })
}

// Interações de contato com o entrante (e-mail encaminhado, ligação, WhatsApp,
// reunião...). Aparecem junto das transições de estágio na timeline do entrante.
let proximoIdInteracao = 1
const interacoesEntrada = []
const CANAIS_INTERACAO = ["EMAIL", "LIGACAO", "WHATSAPP", "REUNIAO", "PRESENCIAL", "OUTRO"]
const SENTIDOS_INTERACAO = ["ENVIADO", "RECEBIDO"]

function registrarInteracaoEntrada(idEntrada, dados = {}) {
  const registro = {
    ID_INTERACAO: proximoIdInteracao++,
    ID_ENTRADA: Number(idEntrada),
    CANAL: CANAIS_INTERACAO.includes(dados.canal) ? dados.canal : "OUTRO",
    SENTIDO: SENTIDOS_INTERACAO.includes(dados.sentido) ? dados.sentido : "ENVIADO",
    CONTATO: dados.contato ?? null,
    ASSUNTO: dados.assunto ?? null,
    OBSERVACAO: dados.observacao ?? null,
    USUARIO: dados.usuario || "dev.local",
    DATA_INTERACAO: dados.data || agora(),
  }
  interacoesEntrada.push(registro)
  return registro
}

// =====================================================
// Provedores
// =====================================================

let proximoIdProvedor = 1
const provedores = []

function novoProvedor({ cnpj, razaoSocial, nomeFantasia, responsavel, email, telefone, municipio, uf }) {
  const id = proximoIdProvedor++
  const provedor = {
    ID_PROVEDOR: id,
    CNPJ: cnpj,
    RAZAO_SOCIAL: razaoSocial,
    NOME_FANTASIA: nomeFantasia,
    RESPONSAVEL: responsavel,
    EMAIL: email,
    TELEFONE: telefone,
    MUNICIPIO: municipio ?? null,
    UF: uf ?? null,
    STATUS_CADASTRO: "ATIVO",
    CREATED_AT: agora(),
  }
  provedores.push(provedor)
  return provedor
}

function provedorPorCnpj(cnpj) {
  return provedores.find((p) => p.CNPJ === cnpj)
}

// Postes/ocupações deste provedor no Mapa de Postes - PROVEDOR (jornada
// comercial) e as operadoras do mapa são conceitos independentes no mock
// (assim como no HANA real), ligados aqui só pelo CNPJ.
function postesDoProvedor(idProvedor) {
  const provedor = provedores.find((p) => p.ID_PROVEDOR === idProvedor)
  if (!provedor) return null

  const soDigitos = (valor) => String(valor || "").replace(/\D/g, "")
  const cnpjProvedor = soDigitos(provedor.CNPJ)
  if (!cnpjProvedor) return []

  return ocupacoes
    .filter((o) => soDigitos(o.CNPJ) === cnpjProvedor)
    .map((o) => {
      const poste = postes.find((p) => p.BARRAMENTO === o.BARRAMENTO)
      return {
        BARRAMENTO: o.BARRAMENTO,
        BOARD_NAME: o.BOARD_NAME,
        X: poste ? poste.X : null,
        Y: poste ? poste.Y : null,
      }
    })
}

// =====================================================
// Processos / Jornada / sub-registros por etapa
// =====================================================

let proximoIdProcesso = 1
const processos = []
let proximoIdJornada = 1
const jornadas = []
let proximoIdDocumento = 1
const documentos = []
let proximoIdAnalise = 1
const analisesCadastrais = []
let proximoIdParecer = 1
const pareceres = []
let proximoIdContratacao = 1
const contratacoes = []
let proximoIdContato = 1
const contatos = []

function jornadaEmAndamento(idProcesso) {
  return jornadas.find((j) => j.ID_PROCESSO === idProcesso && j.STATUS_ETAPA === "EM_ANDAMENTO" && j.ATIVO === "S")
}

function novaLinhaJornada(idProcesso, etapa) {
  const carimbo = agora()
  const linha = {
    ID_JORNADA: proximoIdJornada++,
    ID_PROCESSO: idProcesso,
    ID_ETAPA: etapa.ID_ETAPA,
    NOME_ETAPA: etapa.NOME_ETAPA,
    ORDEM_FLUXO: etapa.ORDEM_FLUXO,
    STATUS_ETAPA: "EM_ANDAMENTO",
    RESPONSAVEL_ATUAL: "dev.local",
    RESPONSAVEL_ETAPA: null,
    PRAZO_ETAPA: null,
    DATA_ATRIBUICAO_ETAPA: null,
    AREA_RESPONSAVEL: null,
    DATA_ENTRADA_ETAPA: carimbo,
    DATA_PREVISTA_CONCLUSAO: null,
    DATA_CONCLUSAO_ETAPA: null,
    SLA_DIAS: etapa.SLA_DIAS,
    DIAS_CONSUMIDOS: 0,
    DIAS_ATRASO: 0,
    OBSERVACAO: null,
    MOTIVO_RETORNO: null,
    COR_SLA: "VERDE",
    FLAG_PENDENCIA: "N",
    FLAG_DOCUMENTO_PENDENTE: "N",
    FLAG_BLOQUEADO: "N",
    ATIVO: "S",
  }
  jornadas.push(linha)
  return linha
}

function novoProcesso({ provedor, municipio, regional, prioridade }) {
  const id = proximoIdProcesso++
  const ano = new Date().getFullYear()
  const carimbo = agora()
  const processo = {
    ID_PROCESSO: id,
    ID_PROVEDOR: provedor.ID_PROVEDOR,
    NUMERO_PROTOCOLO: `${ano}-${String(id).padStart(6, "0")}`,
    TIPO_PROCESSO: "REGULARIZACAO_CADASTRAL",
    STATUS_ATUAL: "ABERTO",
    ETAPA_ATUAL: etapas[0].ID_ETAPA,
    MUNICIPIO: municipio ?? provedor.MUNICIPIO ?? "Salvador",
    REGIONAL: regional ?? "Metropolitana",
    PRIORIDADE: prioridade ?? "MEDIA",
    DT_ABERTURA: carimbo,
    DT_PREVISAO_CONCLUSAO: null,
    DT_CONCLUSAO: null,
    CNPJ: provedor.CNPJ,
    RAZAO_SOCIAL: provedor.RAZAO_SOCIAL,
    NOME_FANTASIA: provedor.NOME_FANTASIA,
    RESPONSAVEL: provedor.RESPONSAVEL,
    EMAIL: provedor.EMAIL,
    TELEFONE: provedor.TELEFONE,
    RESPONSAVEL_CONTATO: null,
    PRAZO_CONTATO: null,
    DATA_ATRIBUICAO_CONTATO: null,
  }
  processos.push(processo)
  novaLinhaJornada(id, etapas[0])
  return processo
}

function inserirSubRegistroConclusao(processo, etapa) {
  const nome = normalizarNomeEtapa(etapa.NOME_ETAPA)
  const carimbo = agora()

  if (nome === "ANALISE_CADASTRAL") {
    analisesCadastrais.push({
      ID_ANALISE: proximoIdAnalise++,
      ID_PROCESSO: processo.ID_PROCESSO,
      ID_ETAPA: etapa.ID_ETAPA,
      DADOS_CONFERIDOS: "S",
      CNPJ_VALIDADO: "S",
      RESPONSAVEL_VALIDADO: "S",
      CONTATO_CONFIRMADO: "S",
      USUARIO_REGISTRO: "dev.local",
      DATA_REGISTRO: carimbo,
    })
  } else if (nome === "DOCUMENTACAO") {
    TIPOS_DOCUMENTO_OBRIGATORIOS.forEach((tipo) => {
      documentos.push({
        ID_DOCUMENTO: proximoIdDocumento++,
        ID_PROCESSO: processo.ID_PROCESSO,
        ID_ETAPA: etapa.ID_ETAPA,
        NOME_ETAPA: etapa.NOME_ETAPA,
        TIPO_DOCUMENTO: tipo,
        NOME_ARQUIVO: `${tipo.toLowerCase()}.pdf`,
        TIPO_ARQUIVO: "application/pdf",
        CAMINHO_ARQUIVO: `/fixtures/${tipo.toLowerCase()}.pdf`,
        TAMANHO_BYTES: 102400,
        STATUS_DOCUMENTO: "ENVIADO",
        OBSERVACAO: null,
        DATA_UPLOAD: carimbo,
        USUARIO_UPLOAD: "dev.local",
        ATIVO: "S",
      })
    })
  } else if (nome === "APROVACAO") {
    pareceres.push({
      ID_PARECER: proximoIdParecer++,
      ID_PROCESSO: processo.ID_PROCESSO,
      ID_ETAPA: etapa.ID_ETAPA,
      RESULTADO: "APROVADO",
      OBSERVACAO: "Documentação em conformidade.",
      USUARIO_REGISTRO: "dev.local",
      DATA_REGISTRO: carimbo,
    })
  } else if (nome === "CONTRATACAO") {
    contratacoes.push({
      ID_CONTRATACAO: proximoIdContratacao++,
      ID_PROCESSO: processo.ID_PROCESSO,
      NUMERO_PN: `PN-${processo.ID_PROCESSO}`,
      NUMERO_CONTRATO: `CTR-${processo.ID_PROCESSO}`,
      DATA_ASSINATURA: carimbo,
      URL_CONTRATO: `https://sharepoint.fake/contratos/${processo.NUMERO_PROTOCOLO}.pdf`,
      USUARIO_REGISTRO: "dev.local",
      DATA_REGISTRO: carimbo,
    })
  }
}

// Efeito real de "avançar etapa" (usado tanto pela rota de verdade quanto
// pela geração de dados fictícios, pra manter os dois consistentes).
function executarAvancoEtapa(idProcesso) {
  const processo = processos.find((p) => p.ID_PROCESSO === idProcesso)
  const atual = jornadaEmAndamento(idProcesso)
  const etapaAtual = etapaPorId(processo.ETAPA_ATUAL)
  const carimbo = agora()

  atual.STATUS_ETAPA = "CONCLUIDO"
  atual.DATA_CONCLUSAO_ETAPA = carimbo

  const proximaEtapa = etapaPorOrdem(etapaAtual.ORDEM_FLUXO + 1)
  const nomeAnterior = etapaAtual.NOME_ETAPA

  if (!proximaEtapa) {
    processo.STATUS_ATUAL = "CONCLUIDO"
    processo.DT_CONCLUSAO = carimbo
    return { etapaAnterior: nomeAnterior, novaEtapa: null, statusProcesso: "CONCLUIDO" }
  }

  novaLinhaJornada(idProcesso, proximaEtapa)
  processo.ETAPA_ATUAL = proximaEtapa.ID_ETAPA
  processo.STATUS_ATUAL = "EM_ANDAMENTO"

  return { etapaAnterior: nomeAnterior, novaEtapa: proximaEtapa.NOME_ETAPA, statusProcesso: "EM_ANDAMENTO" }
}

function executarCancelamento(idProcesso, motivo) {
  const processo = processos.find((p) => p.ID_PROCESSO === idProcesso)
  const atual = jornadaEmAndamento(idProcesso)
  if (atual) {
    atual.STATUS_ETAPA = "CANCELADO"
    atual.MOTIVO_RETORNO = motivo
    atual.DATA_CONCLUSAO_ETAPA = agora()
  }
  processo.STATUS_ATUAL = "CANCELADO"
  processo.DT_CONCLUSAO = agora()
}

function executarRetorno(idProcesso, motivo) {
  const processo = processos.find((p) => p.ID_PROCESSO === idProcesso)
  const atual = jornadaEmAndamento(idProcesso)
  const etapaAtual = etapaPorId(processo.ETAPA_ATUAL)
  const anterior = etapaPorOrdem(etapaAtual.ORDEM_FLUXO - 1)

  atual.STATUS_ETAPA = "DEVOLVIDO"
  atual.MOTIVO_RETORNO = motivo
  atual.DATA_CONCLUSAO_ETAPA = agora()

  novaLinhaJornada(idProcesso, anterior)
  processo.ETAPA_ATUAL = anterior.ID_ETAPA
  processo.STATUS_ATUAL = "EM_ANDAMENTO"

  return { etapaAnterior: etapaAtual.NOME_ETAPA, novaEtapa: anterior.NOME_ETAPA, statusProcesso: "EM_ANDAMENTO" }
}

// ---- Criação de sub-registros por etapa via API (usadas pelas rotas de
// verdade quando o usuário preenche os modais de Análise Cadastral,
// Documentação, Parecer e Contratação).

function adicionarDocumento({ idProcesso, idEtapa, tipoDocumento, nomeArquivo, tipoArquivo, caminhoArquivo, tamanhoBytes, observacao, usuarioUpload }) {
  const etapa = etapaPorId(idEtapa)
  const doc = {
    ID_DOCUMENTO: proximoIdDocumento++,
    ID_PROCESSO: idProcesso,
    ID_ETAPA: idEtapa,
    NOME_ETAPA: etapa ? etapa.NOME_ETAPA : null,
    TIPO_DOCUMENTO: tipoDocumento ?? null,
    NOME_ARQUIVO: nomeArquivo,
    TIPO_ARQUIVO: tipoArquivo ?? null,
    CAMINHO_ARQUIVO: caminhoArquivo,
    TAMANHO_BYTES: tamanhoBytes ?? null,
    STATUS_DOCUMENTO: "ENVIADO",
    OBSERVACAO: observacao ?? null,
    DATA_UPLOAD: agora(),
    USUARIO_UPLOAD: usuarioUpload ?? "dev.local",
    ATIVO: "S",
  }
  documentos.push(doc)
  return doc
}

function adicionarAnaliseCadastral({ idProcesso, idEtapa, dadosConferidos, cnpjValidado, responsavelValidado, contatoConfirmado, usuarioRegistro }) {
  const registro = {
    ID_ANALISE: proximoIdAnalise++,
    ID_PROCESSO: idProcesso,
    ID_ETAPA: idEtapa,
    DADOS_CONFERIDOS: dadosConferidos ? "S" : "N",
    CNPJ_VALIDADO: cnpjValidado ? "S" : "N",
    RESPONSAVEL_VALIDADO: responsavelValidado ? "S" : "N",
    CONTATO_CONFIRMADO: contatoConfirmado ? "S" : "N",
    USUARIO_REGISTRO: usuarioRegistro ?? "dev.local",
    DATA_REGISTRO: agora(),
  }
  analisesCadastrais.push(registro)
  return registro
}

function adicionarParecer({ idProcesso, idEtapa, resultado, observacao, usuarioRegistro }) {
  const registro = {
    ID_PARECER: proximoIdParecer++,
    ID_PROCESSO: idProcesso,
    ID_ETAPA: idEtapa,
    RESULTADO: resultado,
    OBSERVACAO: observacao ?? null,
    USUARIO_REGISTRO: usuarioRegistro ?? "dev.local",
    DATA_REGISTRO: agora(),
  }
  pareceres.push(registro)
  return registro
}

function adicionarContratacao({ idProcesso, numeroPn, numeroContrato, dataAssinatura, urlContrato, usuarioRegistro }) {
  const registro = {
    ID_CONTRATACAO: proximoIdContratacao++,
    ID_PROCESSO: idProcesso,
    NUMERO_PN: numeroPn,
    NUMERO_CONTRATO: numeroContrato,
    DATA_ASSINATURA: dataAssinatura ?? null,
    URL_CONTRATO: urlContrato,
    USUARIO_REGISTRO: usuarioRegistro ?? "dev.local",
    DATA_REGISTRO: agora(),
  }
  contratacoes.push(registro)
  return registro
}

function adicionarContato({ idProcesso, dataContato, meioContato, pessoaContato, observacao, resultado }) {
  const resultadoFinal = resultado || "AGUARDANDO"
  const registro = {
    ID_CONTATO: proximoIdContato++,
    ID_PROCESSO: idProcesso,
    DATA_CONTATO: dataContato,
    MEIO_CONTATO: meioContato ?? null,
    PESSOA_CONTATO: pessoaContato ?? null,
    OBSERVACAO: observacao,
    RESULTADO: resultadoFinal,
    USUARIO_REGISTRO: "dev.local",
    DATA_REGISTRO: agora(),
    DATA_RESULTADO: resultadoFinal !== "AGUARDANDO" ? agora() : null,
  }
  contatos.push(registro)
  return registro
}

function ultimoRegistro(lista, idProcesso, idEtapa) {
  const candidatos = lista.filter((r) => r.ID_PROCESSO === idProcesso && (idEtapa === undefined || r.ID_ETAPA === idEtapa))
  if (!candidatos.length) return null
  return candidatos.reduce((mais_recente, atual) => (atual.DATA_REGISTRO > mais_recente.DATA_REGISTRO ? atual : mais_recente))
}

// Avança `vezes` etapas de uma tacada só, preenchendo os sub-registros das
// etapas concluídas (pra ficarem coerentes) e deixando a etapa em que o
// processo fica em aberto SEM sub-registro, de propósito, pra dar pra
// testar o fluxo de "Executar Etapa" nela.
function seedAvancar(idProcesso, vezes) {
  for (let i = 0; i < vezes; i++) {
    const processo = processos.find((p) => p.ID_PROCESSO === idProcesso)
    const etapaAtual = etapaPorId(processo.ETAPA_ATUAL)
    inserirSubRegistroConclusao(processo, etapaAtual)
    executarAvancoEtapa(idProcesso)
  }
}

// ---- Seed: provedores/processos "avulsos" (sem passar pela tela de Novos
// Entrantes), pra tela de Processos já nascer com variedade de status/etapa.

const provedorP2 = novoProvedor({
  cnpj: "66.777.888/0001-99",
  razaoSocial: "Costa Norte Telecom Ltda",
  nomeFantasia: "Costa Norte Telecom",
  responsavel: "Carlos Andrade",
  email: "carlos.andrade@costanorte.fake",
  telefone: "(71) 3333-1002",
  municipio: "Camaçari",
  uf: "BA",
})
const processoP2 = novoProcesso({ provedor: provedorP2, municipio: "Camaçari" })
seedAvancar(processoP2.ID_PROCESSO, 1) // parado no início da etapa DOCUMENTACAO, sem doc ainda

const provedorP3 = novoProvedor({
  cnpj: "77.888.999/0001-00",
  razaoSocial: "Sul Bahia Redes Ltda",
  nomeFantasia: "Sul Bahia Redes",
  responsavel: "Fernanda Lima",
  email: "fernanda.lima@sulbahiaredes.fake",
  telefone: "(73) 3333-1003",
  municipio: "Ilhéus",
  uf: "BA",
})
const processoP3 = novoProcesso({ provedor: provedorP3, municipio: "Ilhéus" })
seedAvancar(processoP3.ID_PROCESSO, 2) // parado no início da etapa APROVACAO, sem parecer ainda

const provedorP4 = novoProvedor({
  cnpj: "88.999.000/0001-11",
  razaoSocial: "Grande Vitória Telecomunicações Ltda",
  nomeFantasia: "GV Telecom",
  responsavel: "Ricardo Nunes",
  email: "ricardo.nunes@gvtelecom.fake",
  telefone: "(77) 3333-1004",
  municipio: "Vitória da Conquista",
  uf: "BA",
})
const processoP4 = novoProcesso({ provedor: provedorP4, municipio: "Vitória da Conquista" })
seedAvancar(processoP4.ID_PROCESSO, 3) // parado no início da etapa CONTRATACAO, sem contrato ainda

const provedorP5 = novoProvedor({
  cnpj: "99.000.111/0001-22",
  razaoSocial: "Sertão Digital Provedor Ltda",
  nomeFantasia: "Sertão Digital",
  responsavel: "Patrícia Gomes",
  email: "patricia.gomes@sertaodigital.fake",
  telefone: "(75) 3333-1005",
  municipio: "Juazeiro",
  uf: "BA",
})
const processoP5 = novoProcesso({ provedor: provedorP5, municipio: "Juazeiro" })
seedAvancar(processoP5.ID_PROCESSO, 4) // concluído (passou pelas 4 etapas)

// Marca alguns postes já existentes como ocupados pelo Sertão Digital (mesmo
// CNPJ do provedor acima), só pra a integração Contratos -> Mapa de Postes
// (solicitar Remoção ligada a postes reais) ter dado de verdade pra mostrar.
const OPERADORA_SERTAO_DIGITAL = {
  ID: operadoras.length + 1,
  RAZAO_SOCIAL: provedorP5.RAZAO_SOCIAL,
  CNPJ: provedorP5.CNPJ,
}
operadoras.push(OPERADORA_SERTAO_DIGITAL)
postes.slice(0, 4).forEach((poste) => {
  poste.TEM_OCUPACAO_IDENTIFICADA = "S"
  ocupacoes.push({
    ID: proximoIdOcupacao++,
    BARRAMENTO: poste.BARRAMENTO,
    BOARD_NAME: `Caixa Sertão Digital - ${10 + Math.floor(Math.random() * 80)}FO`,
    ORGANIZATION_NAME: OPERADORA_SERTAO_DIGITAL.RAZAO_SOCIAL,
    CNPJ: OPERADORA_SERTAO_DIGITAL.CNPJ,
    RAZAO_SOCIAL: OPERADORA_SERTAO_DIGITAL.RAZAO_SOCIAL,
    _idOperadora: OPERADORA_SERTAO_DIGITAL.ID,
  })
  // Mantém a saturação coerente com a ocupação recém-adicionada.
  poste.PONTOS_OCUPADOS = Math.max(
    poste.PONTOS_OCUPADOS,
    ocupacoes.filter((o) => o.BARRAMENTO === poste.BARRAMENTO).length
  )
})

const provedorP6 = novoProvedor({
  cnpj: "10.111.222/0001-33",
  razaoSocial: "Bahia Sul Comunicações EIRELI",
  nomeFantasia: "Bahia Sul Comunicações",
  responsavel: "Eduardo Castro",
  email: "eduardo.castro@bahiasul.fake",
  telefone: "(73) 3333-1006",
  municipio: "Itabuna",
  uf: "BA",
})
const processoP6 = novoProcesso({ provedor: provedorP6, municipio: "Itabuna" })
executarCancelamento(processoP6.ID_PROCESSO, "Provedor desistiu da regularização.")

// ---- Seed: Novos Entrantes, um em cada status, encadeando com
// provedor/processo quando aplicável, pra dar pra testar a jornada completa
// (entrante -> provedor -> processo) a partir da tela de Novos Entrantes.

novaEntrada({
  RAZAO_SOCIAL: "Internet Rápida Vitória da Conquista Ltda",
  NOME_FANTASIA: "Internet Rápida VC",
  CNPJ: "11.222.333/0001-44",
  MUNICIPIO: "Vitória da Conquista",
  EMAIL_CONTATO: "contato@internetrapidavc.fake",
  TELEFONE_CONTATO: "(77) 3333-2001",
  NOME_RESPONSAVEL: "Bruno Farias",
  EMAIL_RESPONSAVEL: "bruno.farias@internetrapidavc.fake",
  TELEFONE_RESPONSAVEL: "(77) 99999-2001",
  STATUS_ENTRADA: "NOVO",
})

const entranteAnalisado = novaEntrada({
  RAZAO_SOCIAL: "Conecta Feira Telecom Ltda",
  NOME_FANTASIA: "Conecta Feira",
  CNPJ: "22.333.444/0001-55",
  MUNICIPIO: "Feira de Santana",
  EMAIL_CONTATO: "contato@conectafeira.fake",
  TELEFONE_CONTATO: "(75) 3333-2002",
  NOME_RESPONSAVEL: "Simone Rocha",
  EMAIL_RESPONSAVEL: "simone.rocha@conectafeira.fake",
  TELEFONE_RESPONSAVEL: "(75) 99999-2002",
  STATUS_ENTRADA: "ANALISADO",
  RESPONSAVEL_ANALISE: "dev.local",
  PRAZO_ANALISE: null,
  DATA_ATRIBUICAO: agora(),
})
registrarHistoricoEntrada(entranteAnalisado.ID_ENTRADA, "NOVO", "ANALISADO", null)

const entranteComProvedor = novaEntrada({
  RAZAO_SOCIAL: "Bahia Net Serviços de Internet Ltda",
  NOME_FANTASIA: "Bahia Net",
  CNPJ: "33.444.555/0001-66",
  MUNICIPIO: "Lauro de Freitas",
  EMAIL_CONTATO: "contato@bahianet.fake",
  TELEFONE_CONTATO: "(71) 3333-2003",
  NOME_RESPONSAVEL: "Alexandre Melo",
  EMAIL_RESPONSAVEL: "alexandre.melo@bahianet.fake",
  TELEFONE_RESPONSAVEL: "(71) 99999-2003",
  STATUS_ENTRADA: "PROVEDOR_CRIADO",
})
registrarHistoricoEntrada(entranteComProvedor.ID_ENTRADA, "NOVO", "ANALISADO", null)
registrarHistoricoEntrada(entranteComProvedor.ID_ENTRADA, "ANALISADO", "PROVEDOR_CRIADO", null)
novoProvedor({
  cnpj: entranteComProvedor.CNPJ,
  razaoSocial: entranteComProvedor.RAZAO_SOCIAL,
  nomeFantasia: entranteComProvedor.NOME_FANTASIA,
  responsavel: entranteComProvedor.NOME_RESPONSAVEL,
  email: entranteComProvedor.EMAIL_CONTATO,
  telefone: entranteComProvedor.TELEFONE_CONTATO,
  municipio: entranteComProvedor.MUNICIPIO,
  uf: entranteComProvedor.UF,
})

const entranteComProcesso = novaEntrada({
  RAZAO_SOCIAL: "Litoral Fibra Telecomunicações S.A.",
  NOME_FANTASIA: "Litoral Fibra",
  CNPJ: "44.555.666/0001-77",
  MUNICIPIO: "Porto Seguro",
  EMAIL_CONTATO: "contato@litoralfibra.fake",
  TELEFONE_CONTATO: "(73) 3333-2004",
  NOME_RESPONSAVEL: "Juliana Prado",
  EMAIL_RESPONSAVEL: "juliana.prado@litoralfibra.fake",
  TELEFONE_RESPONSAVEL: "(73) 99999-2004",
  STATUS_ENTRADA: "PROCESSO_CRIADO",
})
registrarHistoricoEntrada(entranteComProcesso.ID_ENTRADA, "NOVO", "ANALISADO", null)
registrarHistoricoEntrada(entranteComProcesso.ID_ENTRADA, "ANALISADO", "PROVEDOR_CRIADO", null)
registrarHistoricoEntrada(entranteComProcesso.ID_ENTRADA, "PROVEDOR_CRIADO", "PROCESSO_CRIADO", null)
const provedorDoEntrante = novoProvedor({
  cnpj: entranteComProcesso.CNPJ,
  razaoSocial: entranteComProcesso.RAZAO_SOCIAL,
  nomeFantasia: entranteComProcesso.NOME_FANTASIA,
  responsavel: entranteComProcesso.NOME_RESPONSAVEL,
  email: entranteComProcesso.EMAIL_CONTATO,
  telefone: entranteComProcesso.TELEFONE_CONTATO,
  municipio: entranteComProcesso.MUNICIPIO,
  uf: entranteComProcesso.UF,
})
const processoDoEntrante = novoProcesso({ provedor: provedorDoEntrante, municipio: entranteComProcesso.MUNICIPIO })
entranteComProcesso.ID_PROVEDOR = provedorDoEntrante.ID_PROVEDOR
entranteComProcesso.ID_PROCESSO = processoDoEntrante.ID_PROCESSO

const entranteDescartado = novaEntrada({
  RAZAO_SOCIAL: "Provedor Irregular ME",
  NOME_FANTASIA: null,
  CNPJ: "55.666.777/0001-88",
  MUNICIPIO: "Salvador",
  EMAIL_CONTATO: "contato@provedorirregular.fake",
  TELEFONE_CONTATO: "(71) 3333-2005",
  NOME_RESPONSAVEL: "Desconhecido",
  STATUS_ENTRADA: "DESCARTADO",
  MOTIVO_DESCARTE: "CNPJ inválido ou duplicado na base.",
})
registrarHistoricoEntrada(entranteDescartado.ID_ENTRADA, "NOVO", "DESCARTADO", entranteDescartado.MOTIVO_DESCARTE)

// =====================================================
// Carteira de Análise: mais itens na fila + histórico de prazos
// =====================================================
// Os 3 entrantes acima que já saíram da fila (viraram provedor/processo ou
// foram descartados) ganham aqui um PRAZO_ANALISE retroativo, pra
// GET /api/novos-entrantes/sla-analise ter itens avaliados de verdade
// (comparando a data do evento de resolução, já registrada no histórico,
// contra esse prazo).
entranteComProvedor.RESPONSAVEL_ANALISE = "maria.souza"
entranteComProvedor.PRAZO_ANALISE = dataDeHoje(1) // resolvido hoje, prazo era amanhã -> dentro do prazo
entranteComProvedor.DATA_ATRIBUICAO = agora()

entranteComProcesso.RESPONSAVEL_ANALISE = "joao.lima"
entranteComProcesso.PRAZO_ANALISE = dataDeHoje(-3) // resolvido hoje, prazo já tinha passado -> fora do prazo
entranteComProcesso.DATA_ATRIBUICAO = agora()

entranteDescartado.RESPONSAVEL_ANALISE = "maria.souza"
entranteDescartado.PRAZO_ANALISE = dataDeHoje(0) // resolvido hoje, prazo era hoje -> dentro do prazo
entranteDescartado.DATA_ATRIBUICAO = agora()

// O entrante ANALISADO original ganha responsável/prazo (fica "vencendo em breve").
entranteAnalisado.RESPONSAVEL_ANALISE = "maria.souza"
entranteAnalisado.PRAZO_ANALISE = dataDeHoje(2)
entranteAnalisado.DATA_ATRIBUICAO = agora()

// Interações de contato de exemplo, pra timeline do entrante já nascer povoada.
const isoHaDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
registrarInteracaoEntrada(entranteComProvedor.ID_ENTRADA, {
  canal: "EMAIL", sentido: "ENVIADO", contato: entranteComProvedor.EMAIL_CONTATO,
  assunto: "Encaminhamento da lista de documentos",
  observacao: "E-mail encaminhado ao provedor com a relação de documentos obrigatórios.",
  data: isoHaDias(6),
})
registrarInteracaoEntrada(entranteComProvedor.ID_ENTRADA, {
  canal: "LIGACAO", sentido: "ENVIADO", contato: entranteComProvedor.TELEFONE_CONTATO,
  assunto: "Confirmação de recebimento",
  observacao: "Ligação para confirmar que o provedor recebeu o e-mail e tirar dúvidas.",
  data: isoHaDias(4),
})
registrarInteracaoEntrada(entranteAnalisado.ID_ENTRADA, {
  canal: "WHATSAPP", sentido: "RECEBIDO", contato: entranteAnalisado.TELEFONE_CONTATO,
  assunto: "Dúvida sobre municípios de atuação",
  observacao: "Provedor perguntou pelo WhatsApp como preencher a lista de municípios.",
  data: isoHaDias(2),
})

// Mais 3 entrantes só pra fila (Novo/Analisado) ficar rica: um sem
// responsável e sem prazo, um atrasado, um vencendo em breve.
novaEntrada({
  RAZAO_SOCIAL: "Sudoeste Conecta Provedor Ltda",
  NOME_FANTASIA: "Sudoeste Conecta",
  CNPJ: "60.111.222/0001-40",
  MUNICIPIO: "Barreiras",
  EMAIL_CONTATO: "contato@sudoesteconecta.fake",
  TELEFONE_CONTATO: "(77) 3333-2006",
  NOME_RESPONSAVEL: "Camila Reis",
  EMAIL_RESPONSAVEL: "camila.reis@sudoesteconecta.fake",
  TELEFONE_RESPONSAVEL: "(77) 99999-2006",
  STATUS_ENTRADA: "NOVO",
})

novaEntrada({
  RAZAO_SOCIAL: "Chapada Internet Provedor Ltda",
  NOME_FANTASIA: "Chapada Internet",
  CNPJ: "61.222.333/0001-51",
  MUNICIPIO: "Barreiras",
  EMAIL_CONTATO: "contato@chapadainternet.fake",
  TELEFONE_CONTATO: "(77) 3333-2007",
  NOME_RESPONSAVEL: "Diego Farias",
  EMAIL_RESPONSAVEL: "diego.farias@chapadainternet.fake",
  TELEFONE_RESPONSAVEL: "(77) 99999-2007",
  STATUS_ENTRADA: "NOVO",
  RESPONSAVEL_ANALISE: "joao.lima",
  PRAZO_ANALISE: dataDeHoje(-2),
  DATA_ATRIBUICAO: agora(),
})

const entranteFilaC = novaEntrada({
  RAZAO_SOCIAL: "Recôncavo Fibra Provedor Ltda",
  NOME_FANTASIA: "Recôncavo Fibra",
  CNPJ: "62.333.444/0001-62",
  MUNICIPIO: "Santo Amaro",
  EMAIL_CONTATO: "contato@reconcavofibra.fake",
  TELEFONE_CONTATO: "(75) 3333-2008",
  NOME_RESPONSAVEL: "Patrícia Alves",
  EMAIL_RESPONSAVEL: "patricia.alves@reconcavofibra.fake",
  TELEFONE_RESPONSAVEL: "(75) 99999-2008",
  STATUS_ENTRADA: "ANALISADO",
  RESPONSAVEL_ANALISE: "maria.souza",
  PRAZO_ANALISE: dataDeHoje(4),
  DATA_ATRIBUICAO: agora(),
})
registrarHistoricoEntrada(entranteFilaC.ID_ENTRADA, "NOVO", "ANALISADO", null)

// Mais 2 processos avulsos, pra dar variedade extra às etapas 1 e 2 da
// carteira (Análise Cadastral e Documentação já tinham só 1 item cada).
const provedorP7 = novoProvedor({
  cnpj: "63.444.555/0001-73",
  razaoSocial: "Cerrado Telecom Provedor Ltda",
  nomeFantasia: "Cerrado Telecom",
  responsavel: "Marcos Vieira",
  email: "marcos.vieira@cerradotelecom.fake",
  telefone: "(77) 3333-1007",
  municipio: "Barreiras",
  uf: "BA",
})
novoProcesso({ provedor: provedorP7, municipio: "Barreiras" })

const provedorP8 = novoProvedor({
  cnpj: "64.555.666/0001-84",
  razaoSocial: "Baixio Redes Provedor Ltda",
  nomeFantasia: "Baixio Redes",
  responsavel: "Renata Souza",
  email: "renata.souza@baixioredes.fake",
  telefone: "(74) 3333-1008",
  municipio: "Senhor do Bonfim",
  uf: "BA",
})
const processoP8 = novoProcesso({ provedor: provedorP8, municipio: "Senhor do Bonfim" })
seedAvancar(processoP8.ID_PROCESSO, 1)

// Distribui PRAZO_ETAPA (e responsável, pra metade das linhas) por toda
// jornada já existente — tanto as etapas já concluídas (alimenta
// GET /api/processos/sla-etapa) quanto as em andamento (alimenta os
// indicadores "Atrasados" / "Vencendo em breve" da fila, que são
// calculados no frontend a partir do prazo bruto).
jornadas.forEach((linha, indice) => {
  const padrao = indice % 3
  const desvio = padrao === 0 ? -3 : padrao === 1 ? 0 : 5
  linha.PRAZO_ETAPA = dataDeHoje(desvio)
  if (indice % 2 === 0) {
    linha.RESPONSAVEL_ETAPA = indice % 4 === 0 ? "maria.souza" : "joao.lima"
    linha.DATA_ATRIBUICAO_ETAPA = agora()
  }
})

// Idem para o contato com o provedor (RESPONSAVEL_CONTATO/PRAZO_CONTATO
// vivem direto no processo, não na jornada) e alguns registros de contato
// já resolvidos, pra alimentar sla-contato e metricas-contato.
const processosAtivos = processos.filter((p) => !["CONCLUIDO", "CANCELADO"].includes(p.STATUS_ATUAL))
processosAtivos.forEach((processo, indice) => {
  const padrao = indice % 3
  const desvio = padrao === 0 ? -4 : padrao === 1 ? 1 : 8
  processo.PRAZO_CONTATO = dataDeHoje(desvio)
  if (indice % 2 === 0) {
    processo.RESPONSAVEL_CONTATO = indice % 4 === 0 ? "maria.souza" : "dev.local"
    processo.DATA_ATRIBUICAO_CONTATO = agora()
  }
})

if (processosAtivos[0]) {
  adicionarContato({
    idProcesso: processosAtivos[0].ID_PROCESSO,
    dataContato: dataDeHoje(-5),
    meioContato: "TELEFONE",
    pessoaContato: processosAtivos[0].RESPONSAVEL,
    observacao: "Contato inicial para alinhar documentação pendente.",
    resultado: "RESPONDIDO",
  })
}
if (processosAtivos[1]) {
  adicionarContato({
    idProcesso: processosAtivos[1].ID_PROCESSO,
    dataContato: dataDeHoje(-6),
    meioContato: "EMAIL",
    pessoaContato: processosAtivos[1].RESPONSAVEL,
    observacao: "Tentativa de contato sem retorno do provedor.",
    resultado: "SEM_RESPOSTA",
  })
}
if (processosAtivos[2]) {
  adicionarContato({
    idProcesso: processosAtivos[2].ID_PROCESSO,
    dataContato: dataDeHoje(-1),
    meioContato: "WHATSAPP",
    pessoaContato: processosAtivos[2].RESPONSAVEL,
    observacao: "Aguardando confirmação de recebimento da mensagem.",
    resultado: "AGUARDANDO",
  })
}
// Os demais processos ativos ficam de propósito sem nenhum contato
// registrado ainda, pra dar pra testar o estado "Sem contato registrado".

// =====================================================
// Contratos: provedores que já concluíram a jornada + solicitação de ação
// (Técnico / Negociação / Comercial). Espelha routers/provedores.py do
// backend real — mesmo catálogo de tipos, mesmos nomes de campo.
// =====================================================

const CATALOGO_TIPOS_ACAO = {
  REMOCAO: { label: "Solicitar remoção", time: "TECNICO" },
  NOTIFICACAO: { label: "Encaminhar notificação ao provedor", time: "COMERCIAL" },
  COBRANCA: { label: "Solicitar cobrança", time: "NEGOCIACAO" },
  DESFAZER_CONTRATO: { label: "Solicitar desfazimento do contrato", time: "COMERCIAL" },
  OUTRO: { label: "Outra solicitação", time: "COMERCIAL" },
}

let proximoIdSolicitacao = 1
const solicitacoes = []

function adicionarSolicitacaoAcao({ idProvedor, idProcesso, idAcaoPoste, tipoAcao, timeResponsavel, descricao, prioridade, solicitadoPor }) {
  const carimbo = agora()
  const solicitacao = {
    ID_SOLICITACAO: proximoIdSolicitacao++,
    ID_PROVEDOR: idProvedor,
    ID_PROCESSO: idProcesso ?? null,
    ID_ACAO_POSTE: idAcaoPoste ?? null,
    TIPO_ACAO: tipoAcao,
    TIME_RESPONSAVEL: timeResponsavel,
    DESCRICAO: descricao ?? null,
    PRIORIDADE: prioridade || "MEDIA",
    STATUS: "ABERTA",
    SOLICITADO_POR: solicitadoPor || "dev.local",
    DATA_SOLICITACAO: carimbo,
    RESPONSAVEL_EXECUCAO: null,
    DATA_CONCLUSAO: null,
    OBSERVACAO_CONCLUSAO: null,
    CREATED_AT: carimbo,
    UPDATED_AT: carimbo,
  }
  solicitacoes.push(solicitacao)
  return solicitacao
}

// Linha do tempo unificada do provedor (entrada original + jornada e
// contatos de todos os processos dele) — mesma lógica de
// GET /api/provedores/{id}/timeline no backend real.
function timelineDoProvedor(idProvedor) {
  const provedor = provedores.find((p) => p.ID_PROVEDOR === idProvedor)
  if (!provedor) return null

  const eventos = []
  const entrada = entrantes.find((e) => e.CNPJ === provedor.CNPJ)

  if (entrada) {
    historicoEntrada
      .filter((h) => h.ID_ENTRADA === entrada.ID_ENTRADA)
      .forEach((h) => {
        eventos.push({
          tipo: "ENTRADA",
          data: h.DATA_EVENTO,
          titulo: h.STATUS_ANTERIOR ? `${h.STATUS_ANTERIOR} → ${h.STATUS_NOVO}` : String(h.STATUS_NOVO),
          descricao: h.OBSERVACAO,
          usuario: h.USUARIO,
          id_processo: null,
        })
      })
  }

  processos
    .filter((p) => p.ID_PROVEDOR === idProvedor)
    .forEach((processo) => {
      jornadas
        .filter((j) => j.ID_PROCESSO === processo.ID_PROCESSO && j.ATIVO === "S")
        .forEach((j) => {
          eventos.push({
            tipo: "JORNADA",
            data: j.DATA_ENTRADA_ETAPA,
            titulo: `${processo.NUMERO_PROTOCOLO} - ${j.NOME_ETAPA} (${j.STATUS_ETAPA})`,
            descricao: j.MOTIVO_RETORNO || j.OBSERVACAO,
            usuario: j.RESPONSAVEL_ATUAL,
            id_processo: processo.ID_PROCESSO,
          })
        })

      contatos
        .filter((c) => c.ID_PROCESSO === processo.ID_PROCESSO)
        .forEach((c) => {
          let titulo = `${processo.NUMERO_PROTOCOLO} - Contato (${c.MEIO_CONTATO || "N/D"})`
          if (c.PESSOA_CONTATO) titulo += ` com ${c.PESSOA_CONTATO}`
          eventos.push({
            tipo: "CONTATO",
            data: c.DATA_CONTATO,
            titulo,
            descricao: c.OBSERVACAO,
            usuario: c.USUARIO_REGISTRO,
            id_processo: processo.ID_PROCESSO,
          })
        })
    })

  eventos.sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")))
  return eventos
}

// Mais 2 provedores/processos avulsos, já CONCLUÍDOS, pra tela de Contratos
// não nascer com só 1 item na lista.
const provedorP9 = novoProvedor({
  cnpj: "65.666.777/0001-95",
  razaoSocial: "Litoral Norte Provedor de Internet Ltda",
  nomeFantasia: "Litoral Norte Internet",
  responsavel: "Bruna Castro",
  email: "bruna.castro@litoralnorte.fake",
  telefone: "(71) 3333-1009",
  municipio: "Mata de São João",
  uf: "BA",
})
const processoP9 = novoProcesso({ provedor: provedorP9, municipio: "Mata de São João" })
seedAvancar(processoP9.ID_PROCESSO, 4)

const provedorP10 = novoProvedor({
  cnpj: "66.777.888/0001-06",
  razaoSocial: "Vale do Jiquiriçá Telecom Ltda",
  nomeFantasia: "Vale Telecom",
  responsavel: "Otávio Prado",
  email: "otavio.prado@valetelecom.fake",
  telefone: "(75) 3333-1010",
  municipio: "Amargosa",
  uf: "BA",
})
const processoP10 = novoProcesso({ provedor: provedorP10, municipio: "Amargosa" })
seedAvancar(processoP10.ID_PROCESSO, 4)

// Solicitações de exemplo pros provedores que já concluíram a jornada
// (P5 "Sertão Digital", P9 "Litoral Norte", P10 "Vale Telecom"), cobrindo
// os 4 status possíveis e times diferentes.
adicionarSolicitacaoAcao({
  idProvedor: provedorP5.ID_PROVEDOR,
  idProcesso: processoP5.ID_PROCESSO,
  tipoAcao: "COBRANCA",
  timeResponsavel: "NEGOCIACAO",
  descricao: "Provedor com fatura de compartilhamento em aberto há 45 dias.",
  prioridade: "ALTA",
})
solicitacoes[solicitacoes.length - 1].STATUS = "EM_ANDAMENTO"
solicitacoes[solicitacoes.length - 1].RESPONSAVEL_EXECUCAO = "joao.lima"

adicionarSolicitacaoAcao({
  idProvedor: provedorP5.ID_PROVEDOR,
  idProcesso: processoP5.ID_PROCESSO,
  tipoAcao: "NOTIFICACAO",
  timeResponsavel: "COMERCIAL",
  descricao: "Notificar reajuste anual de valores do contrato de compartilhamento.",
  prioridade: "MEDIA",
})
solicitacoes[solicitacoes.length - 1].STATUS = "CONCLUIDA"
solicitacoes[solicitacoes.length - 1].RESPONSAVEL_EXECUCAO = "maria.souza"
solicitacoes[solicitacoes.length - 1].DATA_CONCLUSAO = dataDeHoje(-2)
solicitacoes[solicitacoes.length - 1].OBSERVACAO_CONCLUSAO = "E-mail de notificação enviado e confirmado pelo provedor."

// Esta solicitação de Remoção nasce vinculada a uma Ação real do Mapa de
// Postes (mesma integração do POST /api/provedores/:id/acoes), pra o elo
// contrato -> ação -> execução de campo ter dado de ponta a ponta.
const acaoRemocaoP9 = novaAcao({
  tipo: "REMOCAO",
  titulo: `Remoção - ${provedorP9.RAZAO_SOCIAL}`,
  responsavel: null,
  prazo: null,
  status: "ABERTA",
  qtdPostes: 3,
  bounds: null,
  observacao: "Cabos abandonados em 3 postes na área central.",
  criadoPor: "dev.local",
  barramentos: barramentosAleatorios(3),
})
adicionarSolicitacaoAcao({
  idProvedor: provedorP9.ID_PROVEDOR,
  idProcesso: processoP9.ID_PROCESSO,
  idAcaoPoste: acaoRemocaoP9,
  tipoAcao: "REMOCAO",
  timeResponsavel: "TECNICO",
  descricao: "Solicitar remoção de cabos abandonados em 3 postes na área central.",
  prioridade: "ALTA",
})

adicionarSolicitacaoAcao({
  idProvedor: provedorP10.ID_PROVEDOR,
  idProcesso: processoP10.ID_PROCESSO,
  tipoAcao: "DESFAZER_CONTRATO",
  timeResponsavel: "COMERCIAL",
  descricao: "Provedor solicitou encerramento do contrato de compartilhamento.",
  prioridade: "MEDIA",
})
solicitacoes[solicitacoes.length - 1].STATUS = "CANCELADA"
solicitacoes[solicitacoes.length - 1].RESPONSAVEL_EXECUCAO = "dev.local"
solicitacoes[solicitacoes.length - 1].DATA_CONCLUSAO = dataDeHoje(-1)
solicitacoes[solicitacoes.length - 1].OBSERVACAO_CONCLUSAO = "Provedor desistiu do encerramento após negociação."

module.exports = {
  agora,
  // postes
  operadoras,
  postes,
  ocupacoes,
  acoes,
  novaAcao,
  analistas,
  // base de postes Coelba (cadastro de ativos)
  basePostes,
  baseLocalidades,
  basePosteTemProvedor,
  provedoresDoBarramento,
  // rede de distribuição (trechos MT/BT)
  redeTrechos,
  redeNos,
  redeNoPorBarramento,
  // EPS / equipes de campo (gerador de carteira)
  eps,
  equipesCampo,
  epsAtuacao,
  // etapas
  etapas,
  etapaPorId,
  etapaPorOrdem,
  normalizarNomeEtapa,
  TIPOS_DOCUMENTO_OBRIGATORIOS,
  // entrantes
  entrantes,
  historicoEntrada,
  interacoesEntrada,
  novaEntrada,
  registrarHistoricoEntrada,
  registrarInteracaoEntrada,
  // provedores
  provedores,
  novoProvedor,
  provedorPorCnpj,
  postesDoProvedor,
  // processos
  processos,
  jornadas,
  documentos,
  analisesCadastrais,
  pareceres,
  contratacoes,
  contatos,
  novoProcesso,
  jornadaEmAndamento,
  executarAvancoEtapa,
  executarCancelamento,
  executarRetorno,
  adicionarDocumento,
  adicionarAnaliseCadastral,
  adicionarParecer,
  adicionarContratacao,
  adicionarContato,
  ultimoRegistro,
  // contratos / solicitação de ação
  CATALOGO_TIPOS_ACAO,
  solicitacoes,
  adicionarSolicitacaoAcao,
  timelineDoProvedor,
}
