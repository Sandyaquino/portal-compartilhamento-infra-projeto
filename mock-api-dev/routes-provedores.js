"use strict"

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

function encontrarProvedor(id) {
  return db.provedores.find((p) => p.ID_PROVEDOR === Number(id))
}

function registrar(router) {
  // Provedores que já concluíram a jornada (têm ao menos um processo
  // CONCLUIDO) — base da tela Comercial > Contratos.
  router.get("/api/provedores", (req, res) => {
    const idsComProcessoConcluido = new Set(
      db.processos.filter((p) => p.STATUS_ATUAL === "CONCLUIDO").map((p) => p.ID_PROVEDOR)
    )

    const lista = db.provedores
      .filter((p) => idsComProcessoConcluido.has(p.ID_PROVEDOR))
      .map((p) => {
        const processosDoProvedor = db.processos.filter((proc) => proc.ID_PROVEDOR === p.ID_PROVEDOR)
        const concluidos = processosDoProvedor.filter((proc) => proc.STATUS_ATUAL === "CONCLUIDO")
        const ultimaConclusao = concluidos.length
          ? concluidos.reduce((mais_recente, atual) => (atual.DT_CONCLUSAO > mais_recente.DT_CONCLUSAO ? atual : mais_recente)).DT_CONCLUSAO
          : null

        return {
          ID_PROVEDOR: p.ID_PROVEDOR,
          CNPJ: p.CNPJ,
          RAZAO_SOCIAL: p.RAZAO_SOCIAL,
          NOME_FANTASIA: p.NOME_FANTASIA,
          RESPONSAVEL: p.RESPONSAVEL,
          EMAIL: p.EMAIL,
          TELEFONE: p.TELEFONE,
          STATUS_CADASTRO: p.STATUS_CADASTRO,
          TOTAL_PROCESSOS: processosDoProvedor.length,
          ULTIMA_CONCLUSAO: ultimaConclusao,
        }
      })
      .sort((a, b) => (a.RAZAO_SOCIAL || "").localeCompare(b.RAZAO_SOCIAL || ""))

    enviarJson(res, 200, lista)
  })

  router.get("/api/provedores/:id", (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const entrada = db.entrantes.find((e) => e.CNPJ === provedor.CNPJ) || null
    const processosDoProvedor = db.processos
      .filter((p) => p.ID_PROVEDOR === provedor.ID_PROVEDOR)
      .sort((a, b) => String(b.DT_ABERTURA).localeCompare(String(a.DT_ABERTURA)))
      .map((p) => ({
        ID_PROCESSO: p.ID_PROCESSO,
        NUMERO_PROTOCOLO: p.NUMERO_PROTOCOLO,
        TIPO_PROCESSO: p.TIPO_PROCESSO,
        STATUS_ATUAL: p.STATUS_ATUAL,
        ETAPA_ATUAL: p.ETAPA_ATUAL,
        NOME_ETAPA_ATUAL: (db.etapaPorId(p.ETAPA_ATUAL) || {}).NOME_ETAPA ?? null,
        DT_ABERTURA: p.DT_ABERTURA,
        DT_PREVISAO_CONCLUSAO: p.DT_PREVISAO_CONCLUSAO,
        DT_CONCLUSAO: p.DT_CONCLUSAO,
      }))

    enviarJson(res, 200, {
      provedor: {
        ID_PROVEDOR: provedor.ID_PROVEDOR,
        CNPJ: provedor.CNPJ,
        RAZAO_SOCIAL: provedor.RAZAO_SOCIAL,
        NOME_FANTASIA: provedor.NOME_FANTASIA,
        RESPONSAVEL: provedor.RESPONSAVEL,
        EMAIL: provedor.EMAIL,
        TELEFONE: provedor.TELEFONE,
        STATUS_CADASTRO: provedor.STATUS_CADASTRO,
      },
      entrada: entrada
        ? { ID_ENTRADA: entrada.ID_ENTRADA, DATA_RECEBIMENTO: entrada.DATA_RECEBIMENTO, STATUS_ENTRADA: entrada.STATUS_ENTRADA, MUNICIPIO: entrada.MUNICIPIO }
        : null,
      processos: processosDoProvedor,
    })
  })

  router.get("/api/provedores/:id/timeline", (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")
    enviarJson(res, 200, db.timelineDoProvedor(provedor.ID_PROVEDOR))
  })

  // Contratos/PNs do provedor - um por processo que já concluiu a etapa de
  // Contratação (db.contratacoes). Alimenta a aba "Contrato" da tela unificada
  // de provedor/contrato.
  router.get("/api/provedores/:id/contratos", (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const idsProcesso = new Set(
      db.processos.filter((p) => p.ID_PROVEDOR === provedor.ID_PROVEDOR).map((p) => p.ID_PROCESSO)
    )

    const lista = db.contratacoes
      .filter((c) => idsProcesso.has(c.ID_PROCESSO))
      .map((c) => {
        const processo = db.processos.find((p) => p.ID_PROCESSO === c.ID_PROCESSO)
        return {
          ID_CONTRATACAO: c.ID_CONTRATACAO,
          ID_PROCESSO: c.ID_PROCESSO,
          NUMERO_PROTOCOLO: processo ? processo.NUMERO_PROTOCOLO : null,
          MUNICIPIO: processo ? processo.MUNICIPIO : null,
          NUMERO_PN: c.NUMERO_PN,
          NUMERO_CONTRATO: c.NUMERO_CONTRATO,
          DATA_ASSINATURA: c.DATA_ASSINATURA,
          URL_CONTRATO: c.URL_CONTRATO,
          DATA_REGISTRO: c.DATA_REGISTRO,
        }
      })
      .sort((a, b) => String(b.DATA_ASSINATURA ?? "").localeCompare(String(a.DATA_ASSINATURA ?? "")))

    enviarJson(res, 200, lista)
  })

  // Postes/ocupações deste provedor no Mapa de Postes — usado pelo modal de
  // "Solicitar Ação" quando o tipo é Remoção, pra escolher quais postes são
  // o alvo (a mesma ação nasce também em TB_ACAO do mapa, ver POST /acoes).
  router.get("/api/provedores/:id/postes", (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")
    enviarJson(res, 200, db.postesDoProvedor(provedor.ID_PROVEDOR))
  })

  router.post("/api/provedores/:id/processos", async (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const processo = db.novoProcesso({ provedor, municipio: provedor.MUNICIPIO })

    enviarJson(res, 200, {
      success: true,
      id_provedor: provedor.ID_PROVEDOR,
      id_processo: processo.ID_PROCESSO,
      numeroProtocolo: processo.NUMERO_PROTOCOLO,
      mensagem: "Processo criado com sucesso.",
    })
  })

  router.get("/api/provedores/:id/acoes", (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const lista = db.solicitacoes
      .filter((s) => s.ID_PROVEDOR === provedor.ID_PROVEDOR)
      .sort((a, b) => String(b.DATA_SOLICITACAO).localeCompare(String(a.DATA_SOLICITACAO)))

    enviarJson(res, 200, lista)
  })

  router.post("/api/provedores/:id/acoes", async (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const corpo = ctx.body
    const catalogo = db.CATALOGO_TIPOS_ACAO[corpo.tipo_acao]
    if (!catalogo) {
      return erroDetalhe(res, 400, `tipo_acao deve ser um de: ${Object.keys(db.CATALOGO_TIPOS_ACAO).sort().join(", ")}`)
    }

    const timeResponsavel = corpo.time_responsavel || catalogo.time
    if (!["TECNICO", "NEGOCIACAO", "COMERCIAL"].includes(timeResponsavel)) {
      return erroDetalhe(res, 400, "time_responsavel deve ser um de: COMERCIAL, NEGOCIACAO, TECNICO")
    }

    // Remoção pode nascer já vinculada a postes reais do Mapa de Postes -
    // mesma ação (TB_ACAO/db.acoes), visível pro time técnico nos dois lugares.
    let idAcaoPoste = null
    const barramentos = Array.isArray(corpo.barramentos) ? corpo.barramentos : []
    if (corpo.tipo_acao === "REMOCAO" && barramentos.length) {
      idAcaoPoste = db.novaAcao({
        tipo: "REMOCAO",
        titulo: `Remoção - ${provedor.RAZAO_SOCIAL}`,
        responsavel: null,
        prazo: null,
        status: "ABERTA",
        qtdPostes: barramentos.length,
        bounds: null,
        observacao: corpo.descricao ?? null,
        criadoPor: "dev.local",
        barramentos,
      })
    }

    const solicitacao = db.adicionarSolicitacaoAcao({
      idProvedor: provedor.ID_PROVEDOR,
      idProcesso: corpo.id_processo ?? null,
      idAcaoPoste,
      tipoAcao: corpo.tipo_acao,
      timeResponsavel,
      descricao: corpo.descricao,
      prioridade: corpo.prioridade,
    })

    enviarJson(res, 200, {
      success: true,
      id_solicitacao: solicitacao.ID_SOLICITACAO,
      id_provedor: provedor.ID_PROVEDOR,
      time_responsavel: timeResponsavel,
      id_acao_poste: idAcaoPoste,
      mensagem: "Solicitação registrada com sucesso.",
    })
  })

  router.patch("/api/provedores/:id/acoes/:idSolicitacao", async (req, res, ctx) => {
    const provedor = encontrarProvedor(ctx.params.id)
    if (!provedor) return erroDetalhe(res, 404, "Provedor não encontrado")

    const solicitacao = db.solicitacoes.find(
      (s) => s.ID_SOLICITACAO === Number(ctx.params.idSolicitacao) && s.ID_PROVEDOR === provedor.ID_PROVEDOR
    )
    if (!solicitacao) return erroDetalhe(res, 404, "Solicitação não encontrada")

    const STATUS_VALIDOS = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]
    const corpo = ctx.body
    if (!STATUS_VALIDOS.includes(corpo.status)) {
      return erroDetalhe(res, 400, `status deve ser um de: ${STATUS_VALIDOS.join(", ")}`)
    }

    solicitacao.STATUS = corpo.status
    if (corpo.observacao_conclusao !== undefined) solicitacao.OBSERVACAO_CONCLUSAO = corpo.observacao_conclusao
    if (corpo.responsavel_execucao !== undefined) solicitacao.RESPONSAVEL_EXECUCAO = corpo.responsavel_execucao
    if (["CONCLUIDA", "CANCELADA"].includes(corpo.status)) {
      solicitacao.DATA_CONCLUSAO = db.agora()
    }
    solicitacao.UPDATED_AT = db.agora()

    enviarJson(res, 200, { success: true, id_solicitacao: solicitacao.ID_SOLICITACAO, status: solicitacao.STATUS })
  })
}

module.exports = { registrar }
