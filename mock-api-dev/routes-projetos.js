"use strict"

// Mock do módulo Projetos (análise de projetos de compartilhamento de
// infraestrutura). Espelha a DDL de sql/PORTAL_COMPARTILHAMENTO_PROJETO.sql.
//
// Modelo: um projeto chega por e-mail, é triado (caixa de entrada -> submissão),
// vira um PROJETO ligado à jornada do provedor pela CHAVE_CONEXAO (CNPJ só
// dígitos). Tem documentos obrigatórios, postes com lat/long, análise técnica
// e trilha de histórico.

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

function agora() {
  return new Date().toISOString()
}
function dataOffset(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}
function soDigitos(valor) {
  return String(valor || "").replace(/\D/g, "")
}
function aleatorio(min, max) {
  return min + Math.random() * (max - min)
}
function inteiro(min, max) {
  return Math.floor(aleatorio(min, max + 1))
}

const CENTRO = { lng: -38.5014, lat: -12.9822 }
const MUNICIPIOS = ["Salvador", "Lauro de Freitas", "Camaçari", "Simões Filho"]
const BAIRROS = ["Centro", "Pituba", "Barra", "Itapuã", "Brotas", "Cajazeiras"]
const TIPOS_OCUPACAO = ["FIBRA", "COAXIAL"]

const CATALOGO_TIPOS_DOC = [
  { ID_TIPO_DOCUMENTO: 1, CODIGO: "OFICIO_SOLICITACAO", NOME: "Ofício de solicitação de compartilhamento", OBRIGATORIO: "S", EXTENSOES_ACEITAS: "pdf", ORDEM: 10, ATIVO: "S" },
  { ID_TIPO_DOCUMENTO: 2, CODIGO: "PLANILHA_POSTES", NOME: "Planilha de postes", OBRIGATORIO: "S", EXTENSOES_ACEITAS: "xlsx,csv", ORDEM: 20, ATIVO: "S" },
  { ID_TIPO_DOCUMENTO: 3, CODIGO: "PROJETO_TECNICO", NOME: "Projeto técnico / memorial descritivo", OBRIGATORIO: "S", EXTENSOES_ACEITAS: "pdf", ORDEM: 30, ATIVO: "S" },
  { ID_TIPO_DOCUMENTO: 4, CODIGO: "ART_TRT", NOME: "ART / TRT do responsável técnico", OBRIGATORIO: "S", EXTENSOES_ACEITAS: "pdf", ORDEM: 40, ATIVO: "S" },
  { ID_TIPO_DOCUMENTO: 5, CODIGO: "LICENCA_ANATEL", NOME: "Licença / outorga ANATEL", OBRIGATORIO: "S", EXTENSOES_ACEITAS: "pdf", ORDEM: 50, ATIVO: "S" },
  { ID_TIPO_DOCUMENTO: 6, CODIGO: "CONTRATO_SOCIAL", NOME: "Contrato social / CNPJ", OBRIGATORIO: "S", EXTENSOES_ACEITAS: "pdf", ORDEM: 60, ATIVO: "S" },
  { ID_TIPO_DOCUMENTO: 7, CODIGO: "KML_TRACADO", NOME: "Arquivo KML/KMZ do traçado", OBRIGATORIO: "N", EXTENSOES_ACEITAS: "kml,kmz", ORDEM: 70, ATIVO: "S" },
]
const TIPOS_OBRIGATORIOS = CATALOGO_TIPOS_DOC.filter((t) => t.OBRIGATORIO === "S")

const STATUS_PROJETO = [
  "RECEBIDO",
  "EM_ANALISE",
  "PENDENTE_DOC",
  "ANALISE_TECNICA",
  "PARECER_EMITIDO",
  "VINCULADO",
  "CONCLUIDO",
  "DEVOLVIDO",
  "CANCELADO",
]
const STATUS_ENCERRADO = ["CONCLUIDO", "VINCULADO", "CANCELADO"]

// Prazo padrão de análise por prioridade (em dias corridos, contados a partir
// da atribuição). Espelha PORTAL_COMPARTILHAMENTO_PROJETO_SLA.
const SLA_DIAS = { URGENTE: 1, ALTA: 3, MEDIA: 7, BAIXA: 15 }

function prazoPadrao(prioridade, base = new Date()) {
  const dias = SLA_DIAS[String(prioridade || "MEDIA").toUpperCase()] ?? SLA_DIAS.MEDIA
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasParaPrazo(prazo) {
  if (!prazo) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${String(prazo).slice(0, 10)}T00:00:00`)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

function situacaoPrazo(prazo) {
  const d = diasParaPrazo(prazo)
  if (d === null) return "SEM_PRAZO"
  if (d < 0) return "ATRASADO"
  if (d <= 2) return "VENCENDO"
  return "EM_DIA"
}

// ------------------------------------------------------------------
// Seed
// ------------------------------------------------------------------
let seqProjeto = 0
let seqPoste = 0
let seqDoc = 0
let seqSub = 0
let seqAnalise = 0
let seqHist = 0

const projetos = []
const projetoPostes = []
const projetoDocumentos = []
const submissoes = []
const analises = []
const historico = []

function anoAtual() {
  return new Date().getFullYear()
}
function numeroProjeto() {
  return `PRJ-${anoAtual()}-${String(seqProjeto).padStart(6, "0")}`
}

function gerarPostes(idProjeto, qtd, municipio) {
  const postes = []
  for (let i = 0; i < qtd; i++) {
    const status = Math.random() < 0.7 ? "APROVADO" : Math.random() < 0.6 ? "PENDENTE" : "REPROVADO"
    postes.push({
      ID_PROJETO_POSTE: ++seqPoste,
      ID_PROJETO: idProjeto,
      IDENTIFICADOR_POSTE: `PT-${idProjeto}-${String(i + 1).padStart(3, "0")}`,
      BARRAMENTO: Math.random() < 0.75 ? `PST-${String(inteiro(1, 260)).padStart(5, "0")}` : null,
      ID_POSTE_PORTAL: null,
      LATITUDE: Number((CENTRO.lat + aleatorio(-0.06, 0.06)).toFixed(10)),
      LONGITUDE: Number((CENTRO.lng + aleatorio(-0.08, 0.08)).toFixed(10)),
      MUNICIPIO: municipio,
      UF: "BA",
      LOGRADOURO: `Rua ${String.fromCharCode(65 + (i % 20))}`,
      BAIRRO: BAIRROS[i % BAIRROS.length],
      CEP: "40000-000",
      TIPO_OCUPACAO: TIPOS_OCUPACAO[i % TIPOS_OCUPACAO.length],
      QTD_PONTOS_FIXACAO: inteiro(1, 2),
      STATUS_ANALISE: status,
      MOTIVO_REPROVACAO: status === "REPROVADO" ? "Poste esgotado / sem ponto de fixação livre." : null,
      GEO_VALIDADA: Math.random() < 0.85 ? "S" : "N",
      POSTE_LOCALIZADO: Math.random() < 0.75 ? "S" : "N",
      OBSERVACAO: null,
      CREATED_AT: agora(),
      UPDATED_AT: agora(),
    })
  }
  return postes
}

function gerarDocumentos(idProjeto, idSubmissao, emailRemetente, completos) {
  const docs = []
  for (const tipo of CATALOGO_TIPOS_DOC) {
    const recebido = completos || tipo.OBRIGATORIO === "N" ? true : Math.random() < 0.6
    const status = !recebido
      ? "PENDENTE"
      : Math.random() < 0.7
        ? "VALIDADO"
        : Math.random() < 0.6
          ? "RECEBIDO"
          : "REJEITADO"
    docs.push({
      ID_PROJETO_DOCUMENTO: ++seqDoc,
      ID_PROJETO: idProjeto,
      ID_SUBMISSAO: idSubmissao,
      CODIGO_TIPO: tipo.CODIGO,
      TIPO_DOCUMENTO: tipo.NOME,
      OBRIGATORIO: tipo.OBRIGATORIO,
      NOME_ARQUIVO: recebido ? `${tipo.CODIGO.toLowerCase()}.${tipo.EXTENSOES_ACEITAS.split(",")[0]}` : null,
      TIPO_ARQUIVO: recebido ? "application/pdf" : null,
      CAMINHO_ARQUIVO: recebido ? `https://sharepoint.fake/projetos/${idProjeto}/${tipo.CODIGO}.pdf` : null,
      TAMANHO_BYTES: recebido ? inteiro(80_000, 4_000_000) : null,
      HASH_ARQUIVO: recebido ? `hash-${idProjeto}-${tipo.ID_TIPO_DOCUMENTO}` : null,
      STATUS_DOCUMENTO: status,
      MOTIVO_REJEICAO: status === "REJEITADO" ? "Documento ilegível / fora do padrão." : null,
      RECEBIDO_VIA: "EMAIL",
      EMAIL_REMETENTE: recebido ? emailRemetente : null,
      DATA_RECEBIMENTO: recebido ? dataOffset(inteiro(1, 20)) : null,
      VALIDADO_POR: status === "VALIDADO" ? "maria.souza" : null,
      DATA_VALIDACAO: status === "VALIDADO" ? dataOffset(inteiro(0, 10)) : null,
      OBSERVACAO: null,
      CREATED_AT: agora(),
      ATIVO: "S",
    })
  }
  return docs
}

function recalcularContadores(projeto) {
  const docs = projetoDocumentos.filter((d) => d.ID_PROJETO === projeto.ID_PROJETO && d.ATIVO === "S")
  const obrig = docs.filter((d) => d.OBRIGATORIO === "S")
  const recebidos = obrig.filter((d) => d.STATUS_DOCUMENTO !== "PENDENTE")
  const validados = obrig.filter((d) => d.STATUS_DOCUMENTO === "VALIDADO")
  const postes = projetoPostes.filter((p) => p.ID_PROJETO === projeto.ID_PROJETO)
  projeto.DOCS_OBRIGATORIOS = obrig.length
  projeto.DOCS_RECEBIDOS = recebidos.length
  projeto.DOCS_VALIDADOS = validados.length
  projeto.DOCUMENTACAO_OK = obrig.length > 0 && validados.length === obrig.length ? "S" : "N"
  projeto.QTD_POSTES_RECEBIDA = postes.length
  projeto.QTD_POSTES_VALIDADA = postes.filter((p) => p.STATUS_ANALISE === "APROVADO").length
}

function addHistorico(idProjeto, tipoEvento, statusAnterior, statusNovo, descricao, usuario) {
  historico.push({
    ID_HISTORICO: ++seqHist,
    ID_PROJETO: idProjeto,
    TIPO_EVENTO: tipoEvento,
    STATUS_ANTERIOR: statusAnterior ?? null,
    STATUS_NOVO: statusNovo ?? null,
    DESCRICAO: descricao ?? null,
    USUARIO: usuario ?? "dev.local",
    DATA_EVENTO: agora(),
  })
}

function criarProjeto({ provedor, cnpj, razao, fantasia, status, submissao, completos }) {
  const id = ++seqProjeto
  const municipio = MUNICIPIOS[id % MUNICIPIOS.length]
  const qtdInformada = inteiro(8, 40)
  const processo = provedor ? db.processos.find((p) => p.ID_PROVEDOR === provedor.ID_PROVEDOR) : null

  const projeto = {
    ID_PROJETO: id,
    NUMERO_PROJETO: numeroProjeto(),
    TITULO: `Compartilhamento ${fantasia || razao} - ${municipio}`,
    CHAVE_CONEXAO: soDigitos(cnpj),
    ID_PROVEDOR: provedor ? provedor.ID_PROVEDOR : null,
    ID_PROCESSO: processo ? processo.ID_PROCESSO : null,
    NUMERO_PROTOCOLO: processo ? processo.NUMERO_PROTOCOLO : null,
    CNPJ: cnpj,
    RAZAO_SOCIAL: razao,
    NOME_FANTASIA: fantasia,
    MUNICIPIO: municipio,
    UF: "BA",
    REGIONAL: "Metropolitana",
    QTD_POSTES_INFORMADA: qtdInformada,
    QTD_POSTES_RECEBIDA: 0,
    QTD_POSTES_VALIDADA: 0,
    STATUS_PROJETO: status,
    PRIORIDADE: ["ALTA", "MEDIA", "BAIXA", "ALTA"][id % 4],
    // Distribui a fila: id 3 sem responsável, id 2 atrasado, id 4 vencendo em breve.
    RESPONSAVEL_ANALISE: id === 3 ? null : id % 2 === 0 ? "maria.souza" : "joao.lima",
    PRAZO_ANALISE:
      id === 3
        ? null
        : id === 2
          ? dataOffset(3).slice(0, 10) // 3 dias atrás -> atrasado
          : id === 4
            ? dataOffset(-1).slice(0, 10) // amanhã -> vencendo em breve
            : dataOffset(-6).slice(0, 10), // folga
    DATA_ATRIBUICAO: id === 3 ? null : submissao.DATA_EMAIL,
    DATA_CONCLUSAO: ["CONCLUIDO", "VINCULADO"].includes(status) ? dataOffset(inteiro(1, 5)) : null,
    CANAL_ORIGEM: "EMAIL",
    SUBMETIDO_POR: "maria.souza",
    EMAIL_REMETENTE: submissao.EMAIL_REMETENTE,
    DATA_RECEBIMENTO: submissao.DATA_EMAIL,
    DOCS_OBRIGATORIOS: 0,
    DOCS_RECEBIDOS: 0,
    DOCS_VALIDADOS: 0,
    DOCUMENTACAO_OK: "N",
    OBSERVACOES: null,
    CREATED_AT: submissao.DATA_EMAIL,
    CREATED_BY: "maria.souza",
    UPDATED_AT: agora(),
    UPDATED_BY: "maria.souza",
    ATIVO: "S",
  }
  projetos.push(projeto)

  const qtdPostes = completos ? qtdInformada : inteiro(4, qtdInformada)
  projetoPostes.push(...gerarPostes(id, qtdPostes, municipio))
  projetoDocumentos.push(...gerarDocumentos(id, submissao.ID_SUBMISSAO, submissao.EMAIL_REMETENTE, completos))

  submissao.ID_PROJETO = id
  submissao.STATUS_SUBMISSAO = "VINCULADA"
  submissao.PROCESSADO_EM = agora()

  addHistorico(id, "RECEBIMENTO", null, "RECEBIDO", `Projeto criado a partir do e-mail "${submissao.ASSUNTO}".`, "maria.souza")
  if (status !== "RECEBIDO") addHistorico(id, "STATUS", "RECEBIDO", status, "Análise em andamento.", projeto.RESPONSAVEL_ANALISE)

  if (["PARECER_EMITIDO", "VINCULADO", "CONCLUIDO"].includes(status)) {
    const postes = projetoPostes.filter((p) => p.ID_PROJETO === id)
    analises.push({
      ID_ANALISE: ++seqAnalise,
      ID_PROJETO: id,
      DOC_CONFERIDA: "S",
      CNPJ_REGULAR: "S",
      LICENCA_ANATEL_OK: "S",
      POSTES_LOCALIZADOS: "S",
      GEO_DENTRO_CONCESSAO: "S",
      CAPACIDADE_SUFICIENTE: "S",
      RESULTADO: postes.some((p) => p.STATUS_ANALISE === "REPROVADO") ? "APROVADO_PARCIAL" : "APROVADO",
      PARECER: "Documentação conforme. Postes localizados e com capacidade. Recomenda-se aprovação.",
      QTD_POSTES_APROVADOS: postes.filter((p) => p.STATUS_ANALISE === "APROVADO").length,
      QTD_POSTES_REPROVADOS: postes.filter((p) => p.STATUS_ANALISE === "REPROVADO").length,
      USUARIO_ANALISE: projeto.RESPONSAVEL_ANALISE,
      DATA_ANALISE: dataOffset(inteiro(1, 6)),
      CREATED_AT: agora(),
    })
    addHistorico(id, "ANALISE", status, "PARECER_EMITIDO", "Parecer técnico registrado.", projeto.RESPONSAVEL_ANALISE)
    if (["VINCULADO", "CONCLUIDO"].includes(status) && processo) {
      addHistorico(id, "VINCULO", "PARECER_EMITIDO", status, `Vinculado ao processo ${processo.NUMERO_PROTOCOLO}.`, projeto.RESPONSAVEL_ANALISE)
    }
  }

  recalcularContadores(projeto)
  return projeto
}

// Checklist de documentos "em branco" (tudo PENDENTE) — usado quando o
// projeto é criado manualmente pelo usuário, sem e-mail/anexos.
function gerarDocumentosPendentes(idProjeto) {
  return CATALOGO_TIPOS_DOC.map((tipo) => ({
    ID_PROJETO_DOCUMENTO: ++seqDoc,
    ID_PROJETO: idProjeto,
    ID_SUBMISSAO: null,
    CODIGO_TIPO: tipo.CODIGO,
    TIPO_DOCUMENTO: tipo.NOME,
    OBRIGATORIO: tipo.OBRIGATORIO,
    NOME_ARQUIVO: null,
    TIPO_ARQUIVO: null,
    CAMINHO_ARQUIVO: null,
    TAMANHO_BYTES: null,
    HASH_ARQUIVO: null,
    STATUS_DOCUMENTO: "PENDENTE",
    MOTIVO_REJEICAO: null,
    RECEBIDO_VIA: "MANUAL",
    EMAIL_REMETENTE: null,
    DATA_RECEBIMENTO: null,
    VALIDADO_POR: null,
    DATA_VALIDACAO: null,
    OBSERVACAO: null,
    CREATED_AT: agora(),
    ATIVO: "S",
  }))
}

// Criação manual: o usuário cria o projeto no portal e associa a um
// provedor/processo já existentes (em vez de vir de um e-mail triado).
function criarProjetoManual({
  provedor,
  processo,
  cnpj,
  razao,
  fantasia,
  municipio,
  uf,
  titulo,
  prioridade,
  qtdInformada,
  usuario,
}) {
  const id = ++seqProjeto
  const mun = municipio || "Salvador"
  const prio = ["BAIXA", "MEDIA", "ALTA", "URGENTE"].includes(String(prioridade || "").toUpperCase())
    ? String(prioridade).toUpperCase()
    : "MEDIA"

  const projeto = {
    ID_PROJETO: id,
    NUMERO_PROJETO: numeroProjeto(),
    TITULO: titulo || `Compartilhamento ${fantasia || razao} - ${mun}`,
    CHAVE_CONEXAO: soDigitos(cnpj),
    ID_PROVEDOR: provedor ? provedor.ID_PROVEDOR : null,
    ID_PROCESSO: processo ? processo.ID_PROCESSO : null,
    NUMERO_PROTOCOLO: processo ? processo.NUMERO_PROTOCOLO : null,
    CNPJ: cnpj,
    RAZAO_SOCIAL: razao,
    NOME_FANTASIA: fantasia || null,
    MUNICIPIO: mun,
    UF: uf || "BA",
    REGIONAL: "Metropolitana",
    QTD_POSTES_INFORMADA: Number.isFinite(qtdInformada) ? qtdInformada : 0,
    QTD_POSTES_RECEBIDA: 0,
    QTD_POSTES_VALIDADA: 0,
    STATUS_PROJETO: "RECEBIDO",
    PRIORIDADE: prio,
    RESPONSAVEL_ANALISE: null,
    PRAZO_ANALISE: null,
    DATA_ATRIBUICAO: null,
    DATA_CONCLUSAO: null,
    CANAL_ORIGEM: "MANUAL",
    SUBMETIDO_POR: usuario || "dev.local",
    EMAIL_REMETENTE: null,
    DATA_RECEBIMENTO: agora(),
    DOCS_OBRIGATORIOS: 0,
    DOCS_RECEBIDOS: 0,
    DOCS_VALIDADOS: 0,
    DOCUMENTACAO_OK: "N",
    OBSERVACOES: null,
    CREATED_AT: agora(),
    CREATED_BY: usuario || "dev.local",
    UPDATED_AT: agora(),
    UPDATED_BY: usuario || "dev.local",
    ATIVO: "S",
  }
  projetos.push(projeto)
  projetoDocumentos.push(...gerarDocumentosPendentes(id))

  addHistorico(
    id,
    "RECEBIMENTO",
    null,
    "RECEBIDO",
    processo
      ? `Projeto criado manualmente e vinculado ao processo ${processo.NUMERO_PROTOCOLO}.`
      : provedor
        ? `Projeto criado manualmente e vinculado ao provedor ${provedor.RAZAO_SOCIAL}.`
        : "Projeto criado manualmente.",
    usuario,
  )
  recalcularContadores(projeto)
  return projeto
}

function novaSubmissao({ cnpj, razao, remetente, assunto, offsetDias, anexos }) {
  const sub = {
    ID_SUBMISSAO: ++seqSub,
    ID_PROJETO: null,
    CHAVE_CONEXAO: soDigitos(cnpj),
    MESSAGE_ID: `<msg-${seqSub}@provedor.fake>`,
    EMAIL_REMETENTE: remetente,
    EMAIL_PARA: "compartilhamento@neoenergia.fake",
    ASSUNTO: assunto,
    CORPO_RESUMO: `Prezados, segue projeto de compartilhamento de infraestrutura da ${razao} (CNPJ ${cnpj}). Anexos: planilha de postes, projeto técnico e documentação.`,
    DATA_EMAIL: dataOffset(offsetDias),
    QTD_ANEXOS: anexos,
    STATUS_SUBMISSAO: "NOVO",
    MOTIVO_DESCARTE: null,
    SUBMETIDO_POR: null,
    DATA_SUBMISSAO: null,
    PROCESSADO_EM: null,
    CREATED_AT: agora(),
  }
  submissoes.push(sub)
  return sub
}

// --- Monta o dataset a partir dos provedores que já existem no db.js ---
const provedoresBase = db.provedores.slice(0, 4)
const statusPorIndice = ["CONCLUIDO", "PARECER_EMITIDO", "ANALISE_TECNICA", "PENDENTE_DOC"]

provedoresBase.forEach((prov, i) => {
  const sub = novaSubmissao({
    cnpj: prov.CNPJ,
    razao: prov.RAZAO_SOCIAL,
    remetente: prov.EMAIL || `contato@${soDigitos(prov.CNPJ).slice(0, 6)}.fake`,
    assunto: `Projeto de compartilhamento - ${prov.NOME_FANTASIA || prov.RAZAO_SOCIAL}`,
    offsetDias: 25 - i * 4,
    anexos: inteiro(4, 8),
  })
  criarProjeto({
    provedor: prov,
    cnpj: prov.CNPJ,
    razao: prov.RAZAO_SOCIAL,
    fantasia: prov.NOME_FANTASIA,
    status: i === 0 ? "CONCLUIDO" : statusPorIndice[i] || "EM_ANALISE",
    submissao: sub,
    completos: i <= 1,
  })
})

// Submissões ainda NÃO triadas (caixa de entrada): 2 de provedores conhecidos
// e 1 de um CNPJ que ainda não é provedor no portal (sem vínculo resolvido).
if (db.provedores[4]) {
  novaSubmissao({
    cnpj: db.provedores[4].CNPJ,
    razao: db.provedores[4].RAZAO_SOCIAL,
    remetente: db.provedores[4].EMAIL || "contato@provedor.fake",
    assunto: `Solicitação de compartilhamento - postes zona norte`,
    offsetDias: 3,
    anexos: 5,
  })
}
novaSubmissao({
  cnpj: "70.123.456/0001-77",
  razao: "Sertão Conecta Provedor de Internet Ltda",
  remetente: "eng@sertaoconecta.fake",
  assunto: "Projeto compartilhamento infra - Juazeiro (novo provedor)",
  offsetDias: 1,
  anexos: 6,
})
novaSubmissao({
  cnpj: "71.987.654/0001-22",
  razao: "Bahia Link Telecom EIRELI",
  remetente: "projetos@bahialink.fake",
  assunto: "Encaminhamento de projeto - 22 postes",
  offsetDias: 0,
  anexos: 3,
})

// ------------------------------------------------------------------
// Serialização
// ------------------------------------------------------------------
function projetoListaItem(p) {
  return {
    ID_PROJETO: p.ID_PROJETO,
    NUMERO_PROJETO: p.NUMERO_PROJETO,
    TITULO: p.TITULO,
    CNPJ: p.CNPJ,
    RAZAO_SOCIAL: p.RAZAO_SOCIAL,
    NOME_FANTASIA: p.NOME_FANTASIA,
    MUNICIPIO: p.MUNICIPIO,
    UF: p.UF,
    STATUS_PROJETO: p.STATUS_PROJETO,
    PRIORIDADE: p.PRIORIDADE,
    RESPONSAVEL_ANALISE: p.RESPONSAVEL_ANALISE,
    PRAZO_ANALISE: p.PRAZO_ANALISE,
    QTD_POSTES_INFORMADA: p.QTD_POSTES_INFORMADA,
    QTD_POSTES_RECEBIDA: p.QTD_POSTES_RECEBIDA,
    QTD_POSTES_VALIDADA: p.QTD_POSTES_VALIDADA,
    DOCS_OBRIGATORIOS: p.DOCS_OBRIGATORIOS,
    DOCS_VALIDADOS: p.DOCS_VALIDADOS,
    DOCUMENTACAO_OK: p.DOCUMENTACAO_OK,
    ID_PROVEDOR: p.ID_PROVEDOR,
    ID_PROCESSO: p.ID_PROCESSO,
    NUMERO_PROTOCOLO: p.NUMERO_PROTOCOLO,
    CHAVE_CONEXAO: p.CHAVE_CONEXAO,
    DATA_RECEBIMENTO: p.DATA_RECEBIMENTO,
  }
}

function vinculoDoProjeto(p) {
  const provedor = p.ID_PROVEDOR ? db.provedores.find((x) => x.ID_PROVEDOR === p.ID_PROVEDOR) : null
  const processo = p.ID_PROCESSO ? db.processos.find((x) => x.ID_PROCESSO === p.ID_PROCESSO) : null
  // fallback: tenta resolver pela CHAVE_CONEXAO mesmo sem FK gravada
  const provedorPorChave =
    provedor || db.provedores.find((x) => soDigitos(x.CNPJ) === p.CHAVE_CONEXAO) || null
  return {
    CHAVE_CONEXAO: p.CHAVE_CONEXAO,
    RESOLVIDO: Boolean(provedor),
    provedor: provedorPorChave
      ? {
          ID_PROVEDOR: provedorPorChave.ID_PROVEDOR,
          RAZAO_SOCIAL: provedorPorChave.RAZAO_SOCIAL,
          NOME_FANTASIA: provedorPorChave.NOME_FANTASIA,
          CNPJ: provedorPorChave.CNPJ,
          STATUS_CADASTRO: provedorPorChave.STATUS_CADASTRO,
        }
      : null,
    processo: processo
      ? {
          ID_PROCESSO: processo.ID_PROCESSO,
          NUMERO_PROTOCOLO: processo.NUMERO_PROTOCOLO,
          STATUS_ATUAL: processo.STATUS_ATUAL,
          ETAPA_ATUAL: processo.ETAPA_ATUAL,
        }
      : null,
  }
}

function registrar(router) {
  router.get("/api/projetos/tipos-documento", (req, res) => enviarJson(res, 200, CATALOGO_TIPOS_DOC))

  // Analistas disponíveis para a carteira (reaproveita o cadastro do portal).
  router.get("/api/projetos/analistas", (req, res) => enviarJson(res, 200, db.analistas))

  // Regra de SLA por prioridade (prazo pré-definido).
  router.get("/api/projetos/sla", (req, res) =>
    enviarJson(res, 200, {
      unidade: "dias corridos a partir da atribuição",
      dias: SLA_DIAS,
      exemplo_prazo: Object.fromEntries(Object.keys(SLA_DIAS).map((p) => [p, prazoPadrao(p)])),
    }),
  )

  // Carteira de análise: fila de projetos abertos, por responsável e prazo.
  router.get("/api/projetos/carteira", (req, res, ctx) => {
    const responsavel = ctx.query.get("responsavel")
    let lista = projetos.filter((p) => p.ATIVO === "S" && !STATUS_ENCERRADO.includes(p.STATUS_PROJETO))
    if (responsavel === "__sem__") lista = lista.filter((p) => !p.RESPONSAVEL_ANALISE)
    else if (responsavel) lista = lista.filter((p) => p.RESPONSAVEL_ANALISE === responsavel)

    const itens = lista
      .map((p) => ({
        ID_PROJETO: p.ID_PROJETO,
        NUMERO_PROJETO: p.NUMERO_PROJETO,
        TITULO: p.TITULO,
        RAZAO_SOCIAL: p.RAZAO_SOCIAL,
        NOME_FANTASIA: p.NOME_FANTASIA,
        CNPJ: p.CNPJ,
        MUNICIPIO: p.MUNICIPIO,
        UF: p.UF,
        STATUS_PROJETO: p.STATUS_PROJETO,
        PRIORIDADE: p.PRIORIDADE,
        RESPONSAVEL_ANALISE: p.RESPONSAVEL_ANALISE,
        PRAZO_ANALISE: p.PRAZO_ANALISE,
        DATA_ATRIBUICAO: p.DATA_ATRIBUICAO,
        DATA_RECEBIMENTO: p.DATA_RECEBIMENTO,
        DIAS_PARA_PRAZO: diasParaPrazo(p.PRAZO_ANALISE),
        SITUACAO_PRAZO: situacaoPrazo(p.PRAZO_ANALISE),
        DOCS_VALIDADOS: p.DOCS_VALIDADOS,
        DOCS_OBRIGATORIOS: p.DOCS_OBRIGATORIOS,
      }))
      .sort((a, b) => String(a.PRAZO_ANALISE ?? "9999").localeCompare(String(b.PRAZO_ANALISE ?? "9999")))

    enviarJson(res, 200, itens)
  })

  // Métrica histórica de cumprimento de SLA (projetos já encerrados que tinham prazo).
  router.get("/api/projetos/sla-carteira", (req, res) => {
    const avaliados = projetos.filter(
      (p) => p.ATIVO === "S" && p.PRAZO_ANALISE && p.DATA_CONCLUSAO && STATUS_ENCERRADO.includes(p.STATUS_PROJETO),
    )
    const dentro = avaliados.filter((p) => String(p.DATA_CONCLUSAO).slice(0, 10) <= String(p.PRAZO_ANALISE).slice(0, 10)).length
    const total = avaliados.length
    enviarJson(res, 200, {
      total_avaliados: total,
      dentro_prazo: dentro,
      fora_prazo: total - dentro,
      taxa_cumprimento_sla: total ? Math.round((dentro / total) * 1000) / 10 : 0,
    })
  })

  // Atribuir responsável + prazo (usa o prazo padrão do SLA se não vier).
  router.patch("/api/projetos/:id/atribuir", async (req, res, ctx) => {
    const projeto = projetos.find((p) => p.ID_PROJETO === Number(ctx.params.id))
    if (!projeto) return erroDetalhe(res, 404, "Projeto não encontrado")
    const corpo = ctx.body || {}
    const responsavel = (corpo.responsavel || "").trim() || null
    let prazo = (corpo.prazo || "").trim() || null
    if (!prazo && corpo.usar_sla !== false) prazo = prazoPadrao(projeto.PRIORIDADE)

    projeto.RESPONSAVEL_ANALISE = responsavel
    projeto.PRAZO_ANALISE = prazo
    projeto.DATA_ATRIBUICAO = responsavel ? agora() : null
    projeto.UPDATED_AT = agora()
    if (["RECEBIDO"].includes(projeto.STATUS_PROJETO) && responsavel) {
      projeto.STATUS_PROJETO = "EM_ANALISE"
    }
    addHistorico(
      projeto.ID_PROJETO,
      "ATRIBUICAO",
      null,
      null,
      responsavel
        ? `Atribuído a ${responsavel}, prazo ${prazo ?? "não definido"} (SLA ${projeto.PRIORIDADE}).`
        : "Responsável removido da carteira.",
      corpo.usuario,
    )
    enviarJson(res, 200, {
      success: true,
      responsavel_analise: responsavel,
      prazo_analise: prazo,
      status_projeto: projeto.STATUS_PROJETO,
    })
  })

  router.get("/api/projetos/resumo", (req, res) => {
    const ativos = projetos.filter((p) => p.ATIVO === "S")
    const emAnalise = ativos.filter((p) =>
      ["EM_ANALISE", "PENDENTE_DOC", "ANALISE_TECNICA", "PARECER_EMITIDO"].includes(p.STATUS_PROJETO),
    )
    const hoje = new Date().toISOString().slice(0, 10)
    enviarJson(res, 200, {
      total: ativos.length,
      em_analise: emAnalise.length,
      pendente_doc: ativos.filter((p) => p.STATUS_PROJETO === "PENDENTE_DOC").length,
      vinculados: ativos.filter((p) => ["VINCULADO", "CONCLUIDO"].includes(p.STATUS_PROJETO)).length,
      atrasados: emAnalise.filter((p) => p.PRAZO_ANALISE && p.PRAZO_ANALISE < hoje).length,
      submissoes_novas: submissoes.filter((s) => s.STATUS_SUBMISSAO === "NOVO").length,
      postes_recebidos: projetoPostes.length,
      postes_aprovados: projetoPostes.filter((p) => p.STATUS_ANALISE === "APROVADO").length,
    })
  })

  router.get("/api/projetos/submissoes", (req, res, ctx) => {
    const status = ctx.query.get("status")
    let lista = [...submissoes].sort((a, b) => String(b.DATA_EMAIL).localeCompare(String(a.DATA_EMAIL)))
    if (status) lista = lista.filter((s) => s.STATUS_SUBMISSAO === status)
    const comProvedor = lista.map((s) => ({
      ...s,
      PROVEDOR_CONHECIDO: Boolean(db.provedores.find((p) => soDigitos(p.CNPJ) === s.CHAVE_CONEXAO)),
    }))
    enviarJson(res, 200, comProvedor)
  })

  router.post("/api/projetos/submissoes/:id/vincular", async (req, res, ctx) => {
    const sub = submissoes.find((s) => s.ID_SUBMISSAO === Number(ctx.params.id))
    if (!sub) return erroDetalhe(res, 404, "Submissão não encontrada")
    if (sub.ID_PROJETO) return erroDetalhe(res, 409, "Submissão já vinculada a um projeto")

    const corpo = ctx.body || {}
    const provedor = db.provedores.find((p) => soDigitos(p.CNPJ) === sub.CHAVE_CONEXAO) || null
    const razao = corpo.razao_social || sub.CORPO_RESUMO.match(/da ([^(]+) \(/)?.[1]?.trim() || "Provedor não identificado"

    const projeto = criarProjeto({
      provedor,
      cnpj: corpo.cnpj || `${sub.CHAVE_CONEXAO}`,
      razao: provedor ? provedor.RAZAO_SOCIAL : razao,
      fantasia: provedor ? provedor.NOME_FANTASIA : corpo.nome_fantasia || null,
      status: "EM_ANALISE",
      submissao: sub,
      completos: false,
    })
    sub.SUBMETIDO_POR = corpo.submetido_por || "dev.local"
    sub.DATA_SUBMISSAO = agora()

    enviarJson(res, 200, {
      success: true,
      id_projeto: projeto.ID_PROJETO,
      numero_projeto: projeto.NUMERO_PROJETO,
      vinculo_resolvido: Boolean(provedor),
    })
  })

  // Opções para o formulário de "Novo projeto": provedores existentes já com
  // seus processos, pra o usuário escolher a que vincular.
  router.get("/api/projetos/opcoes-vinculo", (req, res) => {
    const lista = db.provedores.map((prov) => ({
      ID_PROVEDOR: prov.ID_PROVEDOR,
      RAZAO_SOCIAL: prov.RAZAO_SOCIAL,
      NOME_FANTASIA: prov.NOME_FANTASIA,
      CNPJ: prov.CNPJ,
      MUNICIPIO: prov.MUNICIPIO || null,
      UF: prov.UF || null,
      STATUS_CADASTRO: prov.STATUS_CADASTRO || null,
      processos: db.processos
        .filter((proc) => proc.ID_PROVEDOR === prov.ID_PROVEDOR)
        .map((proc) => ({
          ID_PROCESSO: proc.ID_PROCESSO,
          NUMERO_PROTOCOLO: proc.NUMERO_PROTOCOLO,
          STATUS_ATUAL: proc.STATUS_ATUAL,
          ETAPA_ATUAL: proc.ETAPA_ATUAL ?? null,
        })),
    }))
    enviarJson(res, 200, lista)
  })

  // Criação manual de projeto, associando a um provedor/processo existente.
  router.post("/api/projetos", async (req, res, ctx) => {
    const corpo = ctx.body || {}

    const idProvedor = corpo.id_provedor ? Number(corpo.id_provedor) : null
    const provedor = idProvedor ? db.provedores.find((p) => p.ID_PROVEDOR === idProvedor) : null
    if (idProvedor && !provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const idProcesso = corpo.id_processo ? Number(corpo.id_processo) : null
    const processo = idProcesso ? db.processos.find((p) => p.ID_PROCESSO === idProcesso) : null
    if (idProcesso && !processo) return erroDetalhe(res, 404, "Processo não encontrado")
    if (processo && provedor && processo.ID_PROVEDOR !== provedor.ID_PROVEDOR) {
      return erroDetalhe(res, 400, "O processo informado não pertence ao provedor selecionado")
    }

    const cnpj = String(corpo.cnpj || (provedor && provedor.CNPJ) || "").trim()
    const razao = String(corpo.razao_social || (provedor && provedor.RAZAO_SOCIAL) || "").trim()
    if (!provedor && !razao) {
      return erroDetalhe(res, 400, "Selecione um provedor ou informe a razão social")
    }

    const projeto = criarProjetoManual({
      provedor,
      processo,
      cnpj,
      razao: razao || (provedor ? provedor.RAZAO_SOCIAL : ""),
      fantasia: corpo.nome_fantasia || (provedor && provedor.NOME_FANTASIA) || null,
      municipio: corpo.municipio || (provedor && provedor.MUNICIPIO) || null,
      uf: corpo.uf || (provedor && provedor.UF) || null,
      titulo: (corpo.titulo || "").trim() || null,
      prioridade: corpo.prioridade || "MEDIA",
      qtdInformada: Number(corpo.qtd_postes_informada) || 0,
      usuario: corpo.usuario || "dev.local",
    })

    enviarJson(res, 201, {
      success: true,
      id_projeto: projeto.ID_PROJETO,
      numero_projeto: projeto.NUMERO_PROJETO,
      vinculo_resolvido: Boolean(provedor),
    })
  })

  router.get("/api/projetos", (req, res, ctx) => {
    const status = ctx.query.get("status")
    const municipio = (ctx.query.get("municipio") || "").toLowerCase()
    const busca = (ctx.query.get("busca") || "").toLowerCase()
    let lista = projetos.filter((p) => p.ATIVO === "S")
    if (status) lista = lista.filter((p) => p.STATUS_PROJETO === status)
    if (municipio) lista = lista.filter((p) => (p.MUNICIPIO || "").toLowerCase().includes(municipio))
    if (busca) {
      lista = lista.filter((p) =>
        [p.NUMERO_PROJETO, p.RAZAO_SOCIAL, p.NOME_FANTASIA, p.CNPJ, p.NUMERO_PROTOCOLO]
          .map((v) => String(v ?? "").toLowerCase())
          .some((v) => v.includes(busca)),
      )
    }
    lista = lista.sort((a, b) => String(b.DATA_RECEBIMENTO).localeCompare(String(a.DATA_RECEBIMENTO)))
    enviarJson(res, 200, lista.map(projetoListaItem))
  })

  router.get("/api/projetos/:id", (req, res, ctx) => {
    const projeto = projetos.find((p) => p.ID_PROJETO === Number(ctx.params.id))
    if (!projeto) return erroDetalhe(res, 404, "Projeto não encontrado")
    enviarJson(res, 200, {
      projeto,
      postes: projetoPostes.filter((p) => p.ID_PROJETO === projeto.ID_PROJETO),
      documentos: projetoDocumentos
        .filter((d) => d.ID_PROJETO === projeto.ID_PROJETO && d.ATIVO === "S")
        .sort((a, b) => (a.CODIGO_TIPO || "").localeCompare(b.CODIGO_TIPO || "")),
      analises: analises
        .filter((a) => a.ID_PROJETO === projeto.ID_PROJETO)
        .sort((a, b) => String(b.DATA_ANALISE).localeCompare(String(a.DATA_ANALISE))),
      historico: historico
        .filter((h) => h.ID_PROJETO === projeto.ID_PROJETO)
        .sort((a, b) => String(a.DATA_EVENTO).localeCompare(String(b.DATA_EVENTO))),
      vinculo: vinculoDoProjeto(projeto),
    })
  })

  router.patch("/api/projetos/:id/status", async (req, res, ctx) => {
    const projeto = projetos.find((p) => p.ID_PROJETO === Number(ctx.params.id))
    if (!projeto) return erroDetalhe(res, 404, "Projeto não encontrado")
    const novo = (ctx.body || {}).status
    if (!STATUS_PROJETO.includes(novo)) {
      return erroDetalhe(res, 400, `status deve ser um de: ${STATUS_PROJETO.join(", ")}`)
    }
    const anterior = projeto.STATUS_PROJETO
    projeto.STATUS_PROJETO = novo
    projeto.UPDATED_AT = agora()
    if (["CONCLUIDO", "VINCULADO"].includes(novo)) projeto.DATA_CONCLUSAO = agora()
    addHistorico(projeto.ID_PROJETO, "STATUS", anterior, novo, (ctx.body || {}).observacao || null, (ctx.body || {}).usuario)
    enviarJson(res, 200, { success: true, status: novo })
  })

  router.patch("/api/projetos/:id/postes/:idPoste", async (req, res, ctx) => {
    const poste = projetoPostes.find(
      (p) => p.ID_PROJETO_POSTE === Number(ctx.params.idPoste) && p.ID_PROJETO === Number(ctx.params.id),
    )
    if (!poste) return erroDetalhe(res, 404, "Poste do projeto não encontrado")
    const corpo = ctx.body || {}
    if (corpo.status_analise) poste.STATUS_ANALISE = corpo.status_analise
    if (corpo.motivo_reprovacao !== undefined) poste.MOTIVO_REPROVACAO = corpo.motivo_reprovacao
    if (corpo.observacao !== undefined) poste.OBSERVACAO = corpo.observacao
    poste.UPDATED_AT = agora()
    const projeto = projetos.find((p) => p.ID_PROJETO === poste.ID_PROJETO)
    recalcularContadores(projeto)
    enviarJson(res, 200, { success: true, poste })
  })

  router.patch("/api/projetos/:id/documentos/:idDoc", async (req, res, ctx) => {
    const doc = projetoDocumentos.find(
      (d) => d.ID_PROJETO_DOCUMENTO === Number(ctx.params.idDoc) && d.ID_PROJETO === Number(ctx.params.id),
    )
    if (!doc) return erroDetalhe(res, 404, "Documento não encontrado")
    const corpo = ctx.body || {}
    const STATUS_DOC = ["PENDENTE", "RECEBIDO", "VALIDADO", "REJEITADO"]
    if (corpo.status && !STATUS_DOC.includes(corpo.status)) {
      return erroDetalhe(res, 400, `status deve ser um de: ${STATUS_DOC.join(", ")}`)
    }
    if (corpo.status) {
      doc.STATUS_DOCUMENTO = corpo.status
      if (corpo.status === "VALIDADO") {
        doc.VALIDADO_POR = corpo.usuario || "dev.local"
        doc.DATA_VALIDACAO = agora()
      }
      if (corpo.status === "REJEITADO") doc.MOTIVO_REJEICAO = corpo.motivo || "Documento rejeitado."
    }
    const projeto = projetos.find((p) => p.ID_PROJETO === doc.ID_PROJETO)
    recalcularContadores(projeto)
    addHistorico(doc.ID_PROJETO, "DOCUMENTO", null, null, `${doc.TIPO_DOCUMENTO}: ${doc.STATUS_DOCUMENTO}.`, corpo.usuario)
    enviarJson(res, 200, { success: true, documento: doc })
  })

  router.post("/api/projetos/:id/analise", async (req, res, ctx) => {
    const projeto = projetos.find((p) => p.ID_PROJETO === Number(ctx.params.id))
    if (!projeto) return erroDetalhe(res, 404, "Projeto não encontrado")
    const corpo = ctx.body || {}
    const postes = projetoPostes.filter((p) => p.ID_PROJETO === projeto.ID_PROJETO)
    const registro = {
      ID_ANALISE: ++seqAnalise,
      ID_PROJETO: projeto.ID_PROJETO,
      DOC_CONFERIDA: corpo.doc_conferida ? "S" : "N",
      CNPJ_REGULAR: corpo.cnpj_regular ? "S" : "N",
      LICENCA_ANATEL_OK: corpo.licenca_anatel_ok ? "S" : "N",
      POSTES_LOCALIZADOS: corpo.postes_localizados ? "S" : "N",
      GEO_DENTRO_CONCESSAO: corpo.geo_dentro_concessao ? "S" : "N",
      CAPACIDADE_SUFICIENTE: corpo.capacidade_suficiente ? "S" : "N",
      RESULTADO: corpo.resultado || "PENDENCIA",
      PARECER: corpo.parecer || null,
      QTD_POSTES_APROVADOS: postes.filter((p) => p.STATUS_ANALISE === "APROVADO").length,
      QTD_POSTES_REPROVADOS: postes.filter((p) => p.STATUS_ANALISE === "REPROVADO").length,
      USUARIO_ANALISE: corpo.usuario || "dev.local",
      DATA_ANALISE: agora(),
      CREATED_AT: agora(),
    }
    analises.push(registro)
    const anterior = projeto.STATUS_PROJETO
    projeto.STATUS_PROJETO = registro.RESULTADO === "REPROVADO" ? "DEVOLVIDO" : "PARECER_EMITIDO"
    projeto.UPDATED_AT = agora()
    addHistorico(projeto.ID_PROJETO, "ANALISE", anterior, projeto.STATUS_PROJETO, "Parecer registrado.", registro.USUARIO_ANALISE)
    enviarJson(res, 200, { success: true, id_analise: registro.ID_ANALISE, status: projeto.STATUS_PROJETO })
  })
}

// Expostos para o agregador da Caixa de Tarefas (routes-tarefas.js).
module.exports = { registrar, projetos, submissoes, STATUS_ENCERRADO, diasParaPrazo, situacaoPrazo }
