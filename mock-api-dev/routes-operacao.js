"use strict"

// Mock do módulo Operação (dashboards de campo). Antes deste arquivo, NENHUM
// endpoint de /operacao existia - as 6 telas do menu nasciam zeradas. Aqui um
// dataset fictício de registros de campo (fiscalização por técnico + remoção
// por turma) é gerado uma vez na subida do servidor, e todos os agregados
// (resumo, evolução, ranking, despesas, etc.) são derivados dele.
//
// Limitação conhecida: os filtros de período/EPS/município dos dashboards são
// ignorados aqui - o mock sempre devolve o dataset inteiro.

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

// ------------------------------------------------------------------
// Catálogos
// ------------------------------------------------------------------
const EMPRESAS_FISC = ["Alfa Engenharia", "Beta Vistorias", "Gamma Inspeções", "Delta Campo"]
const EPS_REMOCAO = ["ORCA Serviços", "Nordeste Redes", "Bahia Infra", "Litoral Montagens"]
const MUNICIPIOS = [
  "Salvador",
  "Feira de Santana",
  "Camaçari",
  "Vitória da Conquista",
  "Ilhéus",
  "Juazeiro",
  "Lauro de Freitas",
  "Barreiras",
]
const BAIRROS = ["Centro", "Pituba", "Barra", "São Cristóvão", "Cajazeiras", "Itapuã", "Brotas", "Liberdade"]
const SETORES = ["Setor Norte", "Setor Sul", "Setor Leste", "Setor Oeste"]
const SUPERINTENDENCIAS = ["Metropolitana", "Norte", "Sul", "Oeste"]
const TIPOS_OS_FISC = ["FISCALIZACAO", "VISTORIA", "AUDITORIA"]
const TIPOS_OS_REM = ["REMOCAO", "ORDENAMENTO", "MANUTENCAO"]
const STATUS_EXEC = ["CONCLUIDA", "EM_ANDAMENTO", "PARCIAL"]

const TECNICOS_OFICIAIS = Array.from({ length: 24 }, (_, i) => ({
  nome: `Técnico ${String(i + 1).padStart(2, "0")}`,
  empresa: EMPRESAS_FISC[i % EMPRESAS_FISC.length],
}))
const TURMAS_OFICIAIS = Array.from({ length: 16 }, (_, i) => ({
  equipe: `Turma ${String.fromCharCode(65 + (i % 8))}${i < 8 ? "" : "-2"}`,
  eps: EPS_REMOCAO[i % EPS_REMOCAO.length],
  responsavel: `Encarregado ${String(i + 1).padStart(2, "0")}`,
}))

// Valores unitários fictícios usados para transformar produção em despesa.
const VALOR_POSTE_FISC = 18.5
const VALOR_POSTE_REM = 12.0
const VALOR_CAIXA_REM = 45.0

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function aleatorio(min, max) {
  return min + Math.random() * (max - min)
}
function inteiro(min, max) {
  return Math.floor(aleatorio(min, max + 1))
}
function escolher(lista) {
  return lista[Math.floor(Math.random() * lista.length)]
}
function dataISO(offsetDias) {
  const d = new Date()
  d.setDate(d.getDate() - offsetDias)
  return d.toISOString().slice(0, 10)
}
function agora() {
  return new Date().toISOString()
}
function distintos(lista, chave) {
  return new Set(lista.map((item) => item[chave]).filter(Boolean)).size
}
function soma(lista, chave) {
  return lista.reduce((total, item) => total + Number(item[chave] || 0), 0)
}
function arred(valor, casas = 1) {
  const f = 10 ** casas
  return Math.round(valor * f) / f
}
function agrupar(lista, chave) {
  const mapa = new Map()
  for (const item of lista) {
    const k = item[chave] || "SEM INFORMAÇÃO"
    if (!mapa.has(k)) mapa.set(k, [])
    mapa.get(k).push(item)
  }
  return mapa
}

// Ações vindas do Mapa de Postes (db.acoes) que um registro de campo pode
// referenciar - é o elo entre "planejei no mapa" e "executei no campo".
const ACOES_FISCALIZACAO = db.acoes.filter((a) => a.TIPO === "FISCALIZACAO")
const ACOES_REMOCAO = db.acoes.filter((a) => ["REMOCAO", "ORDENAMENTO"].includes(a.TIPO))

function sortearAcao(acoesCompativeis, probabilidade) {
  if (!acoesCompativeis.length || Math.random() > probabilidade) return null
  return escolher(acoesCompativeis).ID_ACAO
}

// ------------------------------------------------------------------
// Dataset base
// ------------------------------------------------------------------
let proximoIdTecnico = 1
const registrosTecnico = []
for (let i = 0; i < 170; i++) {
  const tecnico = escolher(TECNICOS_OFICIAIS)
  const offset = inteiro(0, 44)
  const postes = inteiro(4, 38)
  const status = escolher(STATUS_EXEC)
  const qntdOs = inteiro(postes, postes + 12)
  const temOs = Math.random() > 0.08
  registrosTecnico.push({
    ID: proximoIdTecnico++,
    ID_ORIGEM: `FRM-T-${1000 + i}`,
    DATA_EXECUCAO: dataISO(offset),
    DATA_IMPORTACAO: dataISO(Math.max(0, offset - 1)),
    EMPRESA: tecnico.empresa,
    TIPO_OS: escolher(TIPOS_OS_FISC),
    NUMERO_OS: temOs ? `OS-${20000 + inteiro(0, 4000)}` : null,
    TECNICO: tecnico.nome,
    SETOR: escolher(SETORES),
    SUPERINTENDENCIA: escolher(SUPERINTENDENCIAS),
    MUNICIPIO: escolher(MUNICIPIOS),
    BAIRRO: escolher(BAIRROS),
    POSTES_EXECUTADOS: postes,
    OBSERVACAO: Math.random() > 0.3 ? "Fiscalização realizada sem pendências." : null,
    APOIO: Math.random() > 0.7 ? "Apoio de campo" : null,
    STATUS_APRESENTACAO: Math.random() > 0.12 ? "APRESENTADO" : "PENDENTE",
    USUARIO_IMPORTACAO: "importacao-forms",
    CHAVE_NEGOCIO: `T-${i}-${offset}`,
    HASH_NEGOCIO: `hash-t-${i}`,
    OS_POSTES_EXECUTADOS: postes,
    OS_QNTD_POSTES: qntdOs,
    ID_ACAO: sortearAcao(ACOES_FISCALIZACAO, 0.55),
    _status: status,
  })
}

let proximoIdTurma = 1
const registrosTurma = []
for (let i = 0; i < 190; i++) {
  const turma = escolher(TURMAS_OFICIAIS)
  const offset = inteiro(0, 44)
  const postes = inteiro(3, 28)
  const caixas = inteiro(0, 12)
  const cabos = inteiro(40, 780)
  const status = escolher(STATUS_EXEC)
  const qntdOs = inteiro(postes, postes + 10)
  const temOs = Math.random() > 0.06
  registrosTurma.push({
    ID: proximoIdTurma++,
    ID_ORIGEM: `FRM-E-${1000 + i}`,
    DATA_EXECUCAO: dataISO(offset),
    DATA_ENVIO: dataISO(Math.max(0, offset - 1)),
    DATA_IMPORTACAO: dataISO(Math.max(0, offset - 1)),
    EQUIPE: turma.equipe,
    RESPONSAVEL: turma.responsavel,
    EPS: turma.eps,
    TIPO_OS: escolher(TIPOS_OS_REM),
    NUMERO_OS: temOs ? `OS-${30000 + inteiro(0, 4000)}` : null,
    MUNICIPIO: escolher(MUNICIPIOS),
    BAIRRO: escolher(BAIRROS),
    POSTES_EXECUTADOS: postes,
    CABOS_REMOVIDOS: cabos,
    CAIXAS_REMOVIDAS: caixas,
    POSTE_FORA_OS: inteiro(0, 3),
    OBSERVACAO: Math.random() > 0.3 ? "Remoção concluída, material recolhido." : null,
    STATUS_APRESENTACAO: Math.random() > 0.15 ? "APRESENTADO" : "PENDENTE",
    USUARIO_IMPORTACAO: "importacao-forms",
    CHAVE_NEGOCIO: `E-${i}-${offset}`,
    OS_POSTES_EXECUTADOS: postes,
    OS_QNTD_POSTES: qntdOs,
    ID_ACAO: sortearAcao(ACOES_REMOCAO, 0.5),
    _status: status,
  })
}

function novaListaImportacoes(prefixo) {
  return Array.from({ length: 6 }, (_, i) => {
    const lidos = inteiro(20, 60)
    const rejeitados = i === 1 ? inteiro(1, 5) : 0
    return {
      ID: i + 1,
      NOME_ARQUIVO: `${prefixo}_${dataISO(30 - i * 5).replace(/-/g, "")}.csv`,
      DATA_IMPORTACAO: `${dataISO(30 - i * 5)}T09:${String(10 + i).padStart(2, "0")}:00.000Z`,
      USUARIO_IMPORTACAO: "dev.local",
      REGISTROS_LIDOS: lidos,
      REGISTROS_INSERIDOS: lidos - rejeitados,
      REGISTROS_ATUALIZADOS: inteiro(0, 8),
      REGISTROS_REJEITADOS: rejeitados,
      STATUS_IMPORTACAO: rejeitados ? "SUCESSO_PARCIAL" : "SUCESSO",
    }
  }).reverse()
}
const importacoesTecnico = novaListaImportacoes("FISCALIZACAO_TECNICOS")
const importacoesTurma = novaListaImportacoes("EXECUCAO_TURMAS")

// ------------------------------------------------------------------
// Agregados - Fiscalização (técnicos)
// ------------------------------------------------------------------
function resumoTecnico() {
  const lista = registrosTecnico
  const apresentados = distintos(
    lista.filter((r) => r.STATUS_APRESENTACAO === "APRESENTADO"),
    "TECNICO",
  )
  const postes = soma(lista, "POSTES_EXECUTADOS")
  const os = distintos(lista.filter((r) => r.NUMERO_OS), "NUMERO_OS")
  const execOs = soma(lista, "OS_POSTES_EXECUTADOS")
  const qtdOs = soma(lista, "OS_QNTD_POSTES")
  return {
    tecnicos_oficiais: TECNICOS_OFICIAIS.length,
    tecnicos_apresentados: apresentados,
    tecnicos_pendentes: Math.max(0, TECNICOS_OFICIAIS.length - apresentados),
    percentual_apresentacao: arred((apresentados / TECNICOS_OFICIAIS.length) * 100),
    os_fiscalizadas: os,
    postes_fiscalizados: postes,
    municipios_atendidos: distintos(lista, "MUNICIPIO"),
    empresas_ativas: distintos(lista, "EMPRESA"),
    registros: lista.length,
    sem_os: lista.filter((r) => !r.NUMERO_OS).length,
    sem_observacao: lista.filter((r) => !r.OBSERVACAO).length,
    concluidas: lista.filter((r) => r._status === "CONCLUIDA").length,
    em_andamento: lista.filter((r) => r._status === "EM_ANDAMENTO").length,
    parciais: lista.filter((r) => r._status === "PARCIAL").length,
    media_postes_tecnico: apresentados ? arred(postes / apresentados) : 0,
    media_postes_os: os ? arred(postes / os) : 0,
    percentual_execucao_os: qtdOs ? arred((execOs / qtdOs) * 100) : 0,
  }
}

function evolucaoTecnico() {
  const porDia = agrupar(registrosTecnico, "DATA_EXECUCAO")
  return Array.from(porDia.entries())
    .map(([dia, itens]) => ({
      dia,
      postes: soma(itens, "POSTES_EXECUTADOS"),
      os: distintos(itens.filter((r) => r.NUMERO_OS), "NUMERO_OS"),
      tecnicos: distintos(itens, "TECNICO"),
      registros: itens.length,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

function porChaveTecnico(chave, nomeCampo) {
  return Array.from(agrupar(registrosTecnico, chave).entries())
    .map(([valor, itens]) => ({
      [nomeCampo]: valor,
      tecnicos: distintos(itens, "TECNICO"),
      os: distintos(itens.filter((r) => r.NUMERO_OS), "NUMERO_OS"),
      postes: soma(itens, "POSTES_EXECUTADOS"),
      municipios: distintos(itens, "MUNICIPIO"),
      registros: itens.length,
    }))
    .sort((a, b) => b.postes - a.postes)
}

function statusTecnico() {
  return Array.from(agrupar(registrosTecnico, "_status").entries())
    .map(([status, itens]) => ({
      status,
      registros: itens.length,
      tecnicos: distintos(itens, "TECNICO"),
      os: distintos(itens.filter((r) => r.NUMERO_OS), "NUMERO_OS"),
      postes: soma(itens, "POSTES_EXECUTADOS"),
    }))
    .sort((a, b) => b.registros - a.registros)
}

function semInterno(lista) {
  return lista.map(({ _status, ...resto }) => resto)
}

// ------------------------------------------------------------------
// Agregados - Execução / Remoção (turmas)
// ------------------------------------------------------------------
function resumoOperacional() {
  const lista = registrosTurma
  const apresentadas = distintos(
    lista.filter((r) => r.STATUS_APRESENTACAO === "APRESENTADO"),
    "EQUIPE",
  )
  const execOs = soma(lista, "OS_POSTES_EXECUTADOS")
  const qtdOs = soma(lista, "OS_QNTD_POSTES")
  return {
    turmas_oficiais: TURMAS_OFICIAIS.length,
    turmas_apresentadas: apresentadas,
    turmas_pendentes: Math.max(0, TURMAS_OFICIAIS.length - apresentadas),
    percentual_apresentacao: arred((apresentadas / TURMAS_OFICIAIS.length) * 100),
    postes: soma(lista, "POSTES_EXECUTADOS"),
    cabos: soma(lista, "CABOS_REMOVIDOS"),
    caixas: soma(lista, "CAIXAS_REMOVIDAS"),
    municipios: distintos(lista, "MUNICIPIO"),
    manutencao: lista.filter((r) => r.TIPO_OS === "MANUTENCAO").length,
    folga: inteiro(2, 6),
    sem_atividade: Math.max(0, TURMAS_OFICIAIS.length - apresentadas),
    sem_os: lista.filter((r) => !r.NUMERO_OS).length,
    percentual_execucao_os: qtdOs ? arred((execOs / qtdOs) * 100) : 0,
  }
}

function evolucaoOperacional() {
  return Array.from(agrupar(registrosTurma, "DATA_EXECUCAO").entries())
    .map(([dia, itens]) => ({
      dia,
      postes: soma(itens, "POSTES_EXECUTADOS"),
      cabos: soma(itens, "CABOS_REMOVIDOS"),
      caixas: soma(itens, "CAIXAS_REMOVIDAS"),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

function evolucaoApresentacao() {
  return Array.from(agrupar(registrosTurma, "DATA_EXECUCAO").entries())
    .map(([dia, itens]) => {
      const apresentadas = distintos(
        itens.filter((r) => r.STATUS_APRESENTACAO === "APRESENTADO"),
        "EQUIPE",
      )
      return {
        dia,
        turmas_oficiais: TURMAS_OFICIAIS.length,
        turmas_apresentadas: apresentadas,
        percentual_apresentacao: arred((apresentadas / TURMAS_OFICIAIS.length) * 100),
      }
    })
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

function rankingEquipes() {
  return Array.from(agrupar(registrosTurma, "EQUIPE").entries())
    .map(([equipe, itens]) => ({
      equipe,
      eps: itens[0].EPS,
      postes: soma(itens, "POSTES_EXECUTADOS"),
      cabos: soma(itens, "CABOS_REMOVIDOS"),
      caixas: soma(itens, "CAIXAS_REMOVIDAS"),
      os: distintos(itens.filter((r) => r.NUMERO_OS), "NUMERO_OS"),
    }))
    .sort((a, b) => b.postes - a.postes)
    .map((item, indice) => ({ posicao: indice + 1, ...item }))
}

// ------------------------------------------------------------------
// Agregados - Despesas (deriva produção -> custo)
// ------------------------------------------------------------------
function linhasDespesa() {
  const fisc = registrosTecnico.map((r) => ({
    CATEGORIA: "FISCALIZACAO",
    _fonte: "FISCALIZACAO",
    DATA_EXECUCAO: r.DATA_EXECUCAO,
    EPS: r.EMPRESA,
    MUNICIPIO: r.MUNICIPIO,
    TIPO_OS: r.TIPO_OS,
    NUMERO_OS: r.NUMERO_OS,
    EXECUTOR: r.TECNICO,
    POSTES_EXECUTADOS: r.POSTES_EXECUTADOS,
    VALOR_BASE: VALOR_POSTE_FISC,
    VALOR_TOTAL: arred(r.POSTES_EXECUTADOS * VALOR_POSTE_FISC, 2),
  }))
  const rem = registrosTurma.map((r) => ({
    CATEGORIA: r.TIPO_OS,
    _fonte: "REMOCAO",
    DATA_EXECUCAO: r.DATA_EXECUCAO,
    EPS: r.EPS,
    MUNICIPIO: r.MUNICIPIO,
    TIPO_OS: r.TIPO_OS,
    NUMERO_OS: r.NUMERO_OS,
    EXECUTOR: r.EQUIPE,
    POSTES_EXECUTADOS: r.POSTES_EXECUTADOS,
    VALOR_BASE: VALOR_POSTE_REM,
    VALOR_TOTAL: arred(r.POSTES_EXECUTADOS * VALOR_POSTE_REM + r.CAIXAS_REMOVIDAS * VALOR_CAIXA_REM, 2),
  }))
  return [...fisc, ...rem]
}

function resumoDespesas() {
  const linhas = linhasDespesa()
  const fisc = linhas.filter((l) => l._fonte === "FISCALIZACAO")
  const rem = linhas.filter((l) => l._fonte === "REMOCAO")
  const valorTotal = arred(soma(linhas, "VALOR_TOTAL"), 2)
  const postes = soma(linhas, "POSTES_EXECUTADOS")
  return {
    valor_total: valorTotal,
    valor_fiscalizacao: arred(soma(fisc, "VALOR_TOTAL"), 2),
    valor_remocao: arred(soma(rem, "VALOR_TOTAL"), 2),
    postes_executados: postes,
    registros: linhas.length,
    total_eps: distintos(linhas, "EPS"),
    total_municipios: distintos(linhas, "MUNICIPIO"),
    total_os: distintos(linhas.filter((l) => l.NUMERO_OS), "NUMERO_OS"),
    ticket_medio: postes ? arred(valorTotal / postes, 2) : 0,
  }
}

function despesasPorMes() {
  const mapa = agrupar(
    linhasDespesa().map((l) => ({ ...l, _mes: String(l.DATA_EXECUCAO).slice(0, 7) })),
    "_mes",
  )
  return Array.from(mapa.entries())
    .map(([mes, itens]) => ({
      mes,
      valor_fiscalizacao: arred(soma(itens.filter((i) => i._fonte === "FISCALIZACAO"), "VALOR_TOTAL"), 2),
      valor_remocao: arred(soma(itens.filter((i) => i._fonte === "REMOCAO"), "VALOR_TOTAL"), 2),
      valor_total: arred(soma(itens, "VALOR_TOTAL"), 2),
      postes_executados: soma(itens, "POSTES_EXECUTADOS"),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

function despesasPorChave(chave, nomeCampo) {
  return Array.from(agrupar(linhasDespesa(), chave).entries())
    .map(([valor, itens]) => ({
      [nomeCampo]: valor,
      valor_total: arred(soma(itens, "VALOR_TOTAL"), 2),
      valor_fiscalizacao: arred(soma(itens.filter((i) => i._fonte === "FISCALIZACAO"), "VALOR_TOTAL"), 2),
      valor_remocao: arred(soma(itens.filter((i) => i._fonte === "REMOCAO"), "VALOR_TOTAL"), 2),
      postes_executados: soma(itens, "POSTES_EXECUTADOS"),
      registros: itens.length,
      total_eps: distintos(itens, "EPS"),
      total_municipios: distintos(itens, "MUNICIPIO"),
    }))
    .sort((a, b) => b.valor_total - a.valor_total)
}

function despesasDiarias(fonte) {
  const linhas = linhasDespesa().filter((l) => (fonte ? l._fonte === fonte : true))
  return Array.from(agrupar(linhas, "DATA_EXECUCAO").entries())
    .map(([dia, itens]) => ({
      dia,
      postes: soma(itens, "POSTES_EXECUTADOS"),
      valor_total: arred(soma(itens, "VALOR_TOTAL"), 2),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

function comparativoDiario() {
  return Array.from(agrupar(linhasDespesa(), "DATA_EXECUCAO").entries())
    .map(([dia, itens]) => ({
      dia,
      valor_fiscalizacao: arred(soma(itens.filter((i) => i._fonte === "FISCALIZACAO"), "VALOR_TOTAL"), 2),
      valor_remocao: arred(soma(itens.filter((i) => i._fonte === "REMOCAO"), "VALOR_TOTAL"), 2),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

// ------------------------------------------------------------------
// Consolidados dos cadastros
// ------------------------------------------------------------------
function consolidadoImportacoes(importacoes, extras) {
  return {
    TOTAL_IMPORTACOES: importacoes.length,
    REGISTROS_PROCESSADOS: soma(importacoes, "REGISTROS_INSERIDOS") + soma(importacoes, "REGISTROS_ATUALIZADOS"),
    TOTAL_REJEITADOS: soma(importacoes, "REGISTROS_REJEITADOS"),
    ULTIMA_IMPORTACAO: importacoes[0] ? importacoes[0].DATA_IMPORTACAO : null,
    ...extras,
  }
}

function atualizarRegistro(lista, id, corpo) {
  const registro = lista.find((r) => String(r.ID) === String(id))
  if (!registro) return null
  const campos = [
    "MUNICIPIO",
    "BAIRRO",
    "POSTES_EXECUTADOS",
    "CABOS_REMOVIDOS",
    "CAIXAS_REMOVIDAS",
    "OBSERVACAO",
    "STATUS_APRESENTACAO",
  ]
  for (const campo of campos) {
    if (corpo[campo] !== undefined) registro[campo] = corpo[campo]
  }
  registro.DATA_IMPORTACAO = registro.DATA_IMPORTACAO || dataISO(0)
  const { _status, ...limpo } = registro
  return limpo
}

// ------------------------------------------------------------------
// Elo com a esteira: execução de campo por Ação do Mapa de Postes
// ------------------------------------------------------------------
function registrosDaAcao(idAcao) {
  const alvo = Number(idAcao)
  const fisc = registrosTecnico.filter((r) => Number(r.ID_ACAO) === alvo)
  const rem = registrosTurma.filter((r) => Number(r.ID_ACAO) === alvo)
  return [
    ...fisc.map((r) => ({ ...r, ORIGEM: "FISCALIZACAO" })),
    ...rem.map((r) => ({ ...r, ORIGEM: "REMOCAO" })),
  ].sort((a, b) => String(b.DATA_EXECUCAO).localeCompare(String(a.DATA_EXECUCAO)))
}

function resumoExecucao(registros) {
  return {
    registros: registros.length,
    postes_executados: soma(registros, "POSTES_EXECUTADOS"),
    tecnicos_equipes: distintos(
      registros.map((r) => ({ quem: r.TECNICO || r.EQUIPE })),
      "quem",
    ),
    ultima_execucao: registros[0] ? registros[0].DATA_EXECUCAO : null,
  }
}

function resumoExecucaoTodasAcoes() {
  const idsComRegistro = new Set(
    [...registrosTecnico, ...registrosTurma].map((r) => r.ID_ACAO).filter((v) => v != null),
  )
  return Array.from(idsComRegistro).map((idAcao) => ({
    ID_ACAO: idAcao,
    ...resumoExecucao(registrosDaAcao(idAcao)),
  }))
}

// ------------------------------------------------------------------
// Rotas
// ------------------------------------------------------------------
function registrar(router) {
  // ---- Dashboard Técnico de Fiscalização ----
  router.get("/api/dashboard-tecnico/resumo", (req, res) => enviarJson(res, 200, resumoTecnico()))
  router.get("/api/dashboard-tecnico/evolucao", (req, res) => enviarJson(res, 200, evolucaoTecnico()))
  router.get("/api/dashboard-tecnico/empresas", (req, res) => enviarJson(res, 200, porChaveTecnico("EMPRESA", "empresa")))
  router.get("/api/dashboard-tecnico/municipios", (req, res) => enviarJson(res, 200, porChaveTecnico("MUNICIPIO", "municipio")))
  router.get("/api/dashboard-tecnico/tipos-os", (req, res) => enviarJson(res, 200, porChaveTecnico("TIPO_OS", "tipo_os")))
  router.get("/api/dashboard-tecnico/status", (req, res) => enviarJson(res, 200, statusTecnico()))
  router.get("/api/dashboard-tecnico/registros", (req, res) => enviarJson(res, 200, semInterno(registrosTecnico)))

  // ---- Dashboard Operacional (turmas de execução/remoção) ----
  router.get("/api/dashboard-operacional/resumo", (req, res) => enviarJson(res, 200, resumoOperacional()))
  router.get("/api/dashboard-operacional/evolucao", (req, res) => enviarJson(res, 200, evolucaoOperacional()))
  router.get("/api/dashboard-operacional/evolucao-apresentacao", (req, res) => enviarJson(res, 200, evolucaoApresentacao()))
  router.get("/api/dashboard-operacional/ranking", (req, res) => enviarJson(res, 200, rankingEquipes()))
  router.get("/api/execucao/registros-recentes", (req, res) => enviarJson(res, 200, semInterno(registrosTurma)))

  // ---- Elo com o Mapa de Postes: execução de campo por Ação ----
  // Resumo em lote (usado pela tela "Ações do Mapa" pra mostrar o quanto
  // de cada ação já foi a campo).
  router.get("/api/execucao/acoes-resumo", (req, res) => enviarJson(res, 200, resumoExecucaoTodasAcoes()))
  // Detalhe de uma ação: resumo + lista dos registros de campo que a executaram.
  router.get("/api/execucao/acao/:id", (req, res, ctx) => {
    const registros = registrosDaAcao(ctx.params.id)
    enviarJson(res, 200, { resumo: resumoExecucao(registros), registros: semInterno(registros) })
  })

  // ---- Despesas ----
  router.get("/api/despesas/resumo", (req, res) => enviarJson(res, 200, resumoDespesas()))
  router.get("/api/despesas/evolucao", (req, res) => enviarJson(res, 200, despesasPorMes()))
  router.get("/api/despesas/eps", (req, res) => enviarJson(res, 200, despesasPorChave("EPS", "eps")))
  router.get("/api/despesas/municipios", (req, res) => enviarJson(res, 200, despesasPorChave("MUNICIPIO", "municipio")))
  router.get("/api/despesas/categorias", (req, res) => enviarJson(res, 200, despesasPorChave("CATEGORIA", "categoria")))
  router.get("/api/despesas/fiscalizacao-diaria", (req, res) => enviarJson(res, 200, despesasDiarias("FISCALIZACAO")))
  router.get("/api/despesas/remocao-diaria", (req, res) => enviarJson(res, 200, despesasDiarias("REMOCAO")))
  router.get("/api/despesas/comparativo-diario", (req, res) => enviarJson(res, 200, comparativoDiario()))
  router.get("/api/despesas/detalhamento", (req, res) => {
    const linhas = linhasDespesa().map(({ _fonte, ...resto }) => resto)
    enviarJson(res, 200, linhas.slice(0, 400))
  })
  router.get("/api/despesas/filtros", (req, res) => {
    const linhas = linhasDespesa()
    const unicos = (chave) => Array.from(new Set(linhas.map((l) => l[chave]).filter(Boolean))).sort()
    enviarJson(res, 200, { eps: unicos("EPS"), municipios: unicos("MUNICIPIO"), categorias: unicos("CATEGORIA") })
  })

  // ---- Cadastro Técnico (importação) ----
  router.get("/api/tecnico/consolidado", (req, res) =>
    enviarJson(
      res,
      200,
      consolidadoImportacoes(importacoesTecnico, {
        TOTAL_OS: distintos(registrosTecnico.filter((r) => r.NUMERO_OS), "NUMERO_OS"),
        TOTAL_TECNICOS: distintos(registrosTecnico, "TECNICO"),
        TOTAL_POSTES_EXECUTADOS: soma(registrosTecnico, "POSTES_EXECUTADOS"),
      }),
    ),
  )
  router.get("/api/tecnico/importacoes", (req, res) => enviarJson(res, 200, importacoesTecnico))
  router.get("/api/tecnico/registros", (req, res) => enviarJson(res, 200, semInterno(registrosTecnico)))
  router.post("/api/tecnico/importar", async (req, res) => {
    const lidos = inteiro(25, 55)
    const rejeitados = inteiro(0, 3)
    const resultado = {
      registros_lidos: lidos,
      registros_inseridos: lidos - rejeitados,
      registros_atualizados: inteiro(0, 6),
      registros_rejeitados: rejeitados,
    }
    importacoesTecnico.unshift({
      ID: importacoesTecnico.length + 1,
      NOME_ARQUIVO: `FISCALIZACAO_TECNICOS_${dataISO(0).replace(/-/g, "")}.csv`,
      DATA_IMPORTACAO: agora(),
      USUARIO_IMPORTACAO: "dev.local",
      REGISTROS_LIDOS: lidos,
      REGISTROS_INSERIDOS: resultado.registros_inseridos,
      REGISTROS_ATUALIZADOS: resultado.registros_atualizados,
      REGISTROS_REJEITADOS: rejeitados,
      STATUS_IMPORTACAO: rejeitados ? "SUCESSO_PARCIAL" : "SUCESSO",
    })
    enviarJson(res, 200, resultado)
  })

  // ---- Cadastro Equipes / Turmas de Campo (importação) ----
  router.get("/api/turma-campo/consolidado", (req, res) =>
    enviarJson(res, 200, consolidadoImportacoes(importacoesTurma, {})),
  )
  router.get("/api/turma-campo/importacoes", (req, res) => enviarJson(res, 200, importacoesTurma))
  router.get("/api/turma-campo/registros", (req, res) => enviarJson(res, 200, semInterno(registrosTurma)))
  router.post("/api/turma-campo/importar", async (req, res) => {
    const lidos = inteiro(25, 55)
    const rejeitados = inteiro(0, 3)
    const resultado = {
      registros_lidos: lidos,
      registros_inseridos: lidos - rejeitados,
      registros_atualizados: inteiro(0, 6),
      registros_rejeitados: rejeitados,
    }
    importacoesTurma.unshift({
      ID: importacoesTurma.length + 1,
      NOME_ARQUIVO: `EXECUCAO_TURMAS_${dataISO(0).replace(/-/g, "")}.csv`,
      DATA_IMPORTACAO: agora(),
      USUARIO_IMPORTACAO: "dev.local",
      REGISTROS_LIDOS: lidos,
      REGISTROS_INSERIDOS: resultado.registros_inseridos,
      REGISTROS_ATUALIZADOS: resultado.registros_atualizados,
      REGISTROS_REJEITADOS: rejeitados,
      STATUS_IMPORTACAO: rejeitados ? "SUCESSO_PARCIAL" : "SUCESSO",
    })
    enviarJson(res, 200, resultado)
  })

  // ---- Edição de registro (usada pelos dashboards e cadastros) ----
  function rotaEditarRegistro(lista) {
    return async (req, res, ctx) => {
      const registro = atualizarRegistro(lista, ctx.params.id, ctx.body || {})
      if (!registro) return erroDetalhe(res, 404, "Registro não encontrado")
      enviarJson(res, 200, { success: true, registro })
    }
  }
  router.add("PUT", "/api/tecnico/registro/:id", rotaEditarRegistro(registrosTecnico))
  router.patch("/api/tecnico/registro/:id", rotaEditarRegistro(registrosTecnico))
  router.add("PUT", "/api/turma-campo/registro/:id", rotaEditarRegistro(registrosTurma))
  router.patch("/api/turma-campo/registro/:id", rotaEditarRegistro(registrosTurma))

  // ---- Exclusão de registro (mesma permissão da edição) ----
  function rotaExcluirRegistro(lista) {
    return async (req, res, ctx) => {
      const indice = lista.findIndex((r) => String(r.ID) === String(ctx.params.id))
      if (indice === -1) return erroDetalhe(res, 404, "Registro não encontrado")
      lista.splice(indice, 1)
      enviarJson(res, 200, { success: true, id: ctx.params.id })
    }
  }
  router.delete("/api/tecnico/registro/:id", rotaExcluirRegistro(registrosTecnico))
  router.delete("/api/turma-campo/registro/:id", rotaExcluirRegistro(registrosTurma))
}

module.exports = { registrar }
