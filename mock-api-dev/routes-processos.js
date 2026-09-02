"use strict"

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

function encontrarProcesso(id) {
  return db.processos.find((p) => p.ID_PROCESSO === Number(id))
}

function nomeEtapaAtual(processo) {
  const etapa = db.etapaPorId(processo.ETAPA_ATUAL)
  return etapa ? etapa.NOME_ETAPA : null
}

function processoParaDetalhe(processo) {
  return {
    ID_PROCESSO: processo.ID_PROCESSO,
    ID_PROVEDOR: processo.ID_PROVEDOR,
    NUMERO_PROTOCOLO: processo.NUMERO_PROTOCOLO,
    TIPO_PROCESSO: processo.TIPO_PROCESSO,
    STATUS_ATUAL: processo.STATUS_ATUAL,
    ETAPA_ATUAL: processo.ETAPA_ATUAL,
    NOME_ETAPA_ATUAL: nomeEtapaAtual(processo),
    MUNICIPIO: processo.MUNICIPIO,
    REGIONAL: processo.REGIONAL,
    PRIORIDADE: processo.PRIORIDADE,
    DT_ABERTURA: processo.DT_ABERTURA,
    DT_PREVISAO_CONCLUSAO: processo.DT_PREVISAO_CONCLUSAO,
    DT_CONCLUSAO: processo.DT_CONCLUSAO,
    CNPJ: processo.CNPJ,
    RAZAO_SOCIAL: processo.RAZAO_SOCIAL,
    NOME_FANTASIA: processo.NOME_FANTASIA,
    RESPONSAVEL: processo.RESPONSAVEL,
    EMAIL: processo.EMAIL,
    TELEFONE: processo.TELEFONE,
  }
}

function processoParaListagem(processo) {
  const jornadaAtual = db.jornadaEmAndamento(processo.ID_PROCESSO)
  return {
    ...processoParaDetalhe(processo),
    SLA_DIAS: jornadaAtual ? jornadaAtual.SLA_DIAS : null,
    DIAS_CONSUMIDOS: jornadaAtual ? jornadaAtual.DIAS_CONSUMIDOS : null,
    DIAS_ATRASO: jornadaAtual ? jornadaAtual.DIAS_ATRASO : 0,
    STATUS_ETAPA_ATUAL: jornadaAtual ? jornadaAtual.STATUS_ETAPA : null,
    DATA_ENTRADA_ETAPA: jornadaAtual ? jornadaAtual.DATA_ENTRADA_ETAPA : null,
    DATA_PREVISTA_CONCLUSAO: jornadaAtual ? jornadaAtual.DATA_PREVISTA_CONCLUSAO : null,
    DATA_CONCLUSAO_ETAPA: jornadaAtual ? jornadaAtual.DATA_CONCLUSAO_ETAPA : null,
  }
}

function processoEncerrado(processo) {
  return ["CONCLUIDO", "CONCLUÍDO", "FINALIZADO", "CANCELADO"].includes(processo.STATUS_ATUAL)
}

function registrar(router) {
  router.get("/api/processos/etapas", (req, res) => {
    enviarJson(res, 200, db.etapas)
  })

  // As rotas literais de "Carteira de Análise" abaixo precisam ficar
  // registradas ANTES de "/api/processos/:id" — senão o router casaria
  // "carteira"/"sla-etapa"/etc como se fossem um :id.
  router.get("/api/processos/carteira", (req, res, ctx) => {
    const etapaId = ctx.query.get("etapa_id")
    let lista = db.processos.filter((p) => !["CONCLUIDO", "CANCELADO"].includes(p.STATUS_ATUAL))
    if (etapaId) lista = lista.filter((p) => p.ETAPA_ATUAL === Number(etapaId))

    const resposta = lista
      .map((p) => {
        const jornadaAtual = db.jornadaEmAndamento(p.ID_PROCESSO)
        return {
          ID_PROCESSO: p.ID_PROCESSO,
          NUMERO_PROTOCOLO: p.NUMERO_PROTOCOLO,
          ETAPA_ATUAL: p.ETAPA_ATUAL,
          NOME_ETAPA_ATUAL: nomeEtapaAtual(p),
          MUNICIPIO: p.MUNICIPIO,
          CNPJ: p.CNPJ,
          RAZAO_SOCIAL: p.RAZAO_SOCIAL,
          NOME_FANTASIA: p.NOME_FANTASIA,
          RESPONSAVEL_ETAPA: jornadaAtual ? jornadaAtual.RESPONSAVEL_ETAPA : null,
          PRAZO_ETAPA: jornadaAtual ? jornadaAtual.PRAZO_ETAPA : null,
          DATA_ATRIBUICAO_ETAPA: jornadaAtual ? jornadaAtual.DATA_ATRIBUICAO_ETAPA : null,
          DATA_ENTRADA_ETAPA: jornadaAtual ? jornadaAtual.DATA_ENTRADA_ETAPA : null,
          PRIORIDADE: p.PRIORIDADE,
        }
      })
      .sort((a, b) => String(a.PRAZO_ETAPA ?? "9999").localeCompare(String(b.PRAZO_ETAPA ?? "9999")))

    enviarJson(res, 200, resposta)
  })

  router.get("/api/processos/carteira-contato", (req, res) => {
    const lista = db.processos
      .filter((p) => !["CONCLUIDO", "CANCELADO"].includes(p.STATUS_ATUAL))
      .map((p) => {
        const contatosDoProcesso = db.contatos.filter((c) => c.ID_PROCESSO === p.ID_PROCESSO)
        const ultimoContato = contatosDoProcesso.length
          ? contatosDoProcesso.reduce((mais_recente, atual) => (atual.DATA_CONTATO > mais_recente.DATA_CONTATO ? atual : mais_recente))
          : null
        return {
          ID_PROCESSO: p.ID_PROCESSO,
          NUMERO_PROTOCOLO: p.NUMERO_PROTOCOLO,
          MUNICIPIO: p.MUNICIPIO,
          CNPJ: p.CNPJ,
          RAZAO_SOCIAL: p.RAZAO_SOCIAL,
          NOME_FANTASIA: p.NOME_FANTASIA,
          RESPONSAVEL_CONTATO: p.RESPONSAVEL_CONTATO,
          PRAZO_CONTATO: p.PRAZO_CONTATO,
          DATA_ATRIBUICAO_CONTATO: p.DATA_ATRIBUICAO_CONTATO,
          PRIORIDADE: p.PRIORIDADE,
          ULTIMO_CONTATO_EM: ultimoContato ? ultimoContato.DATA_CONTATO : null,
        }
      })
      .sort((a, b) => String(a.PRAZO_CONTATO ?? "9999").localeCompare(String(b.PRAZO_CONTATO ?? "9999")))

    enviarJson(res, 200, lista)
  })

  router.get("/api/processos/metricas-contato", (req, res) => {
    const total_contatos = db.contatos.length
    const respondidos = db.contatos.filter((c) => c.RESULTADO === "RESPONDIDO").length
    const sem_resposta = db.contatos.filter((c) => c.RESULTADO === "SEM_RESPOSTA").length
    const aguardando = db.contatos.filter((c) => !c.RESULTADO || c.RESULTADO === "AGUARDANDO").length
    const denominador = respondidos + sem_resposta
    const taxa_contato = denominador ? Math.round((respondidos / denominador) * 1000) / 10 : 0

    enviarJson(res, 200, { total_contatos, respondidos, sem_resposta, aguardando, taxa_contato })
  })

  router.get("/api/processos/sla-etapa", (req, res, ctx) => {
    const etapaId = ctx.query.get("etapa_id")
    let linhas = db.jornadas.filter((j) => j.PRAZO_ETAPA && j.DATA_CONCLUSAO_ETAPA)
    if (etapaId) linhas = linhas.filter((j) => j.ID_ETAPA === Number(etapaId))

    const total_avaliados = linhas.length
    const dentro_prazo = linhas.filter((j) => j.DATA_CONCLUSAO_ETAPA.slice(0, 10) <= j.PRAZO_ETAPA).length
    const fora_prazo = total_avaliados - dentro_prazo
    const taxa_cumprimento_sla = total_avaliados ? Math.round((dentro_prazo / total_avaliados) * 1000) / 10 : 0

    enviarJson(res, 200, { total_avaliados, dentro_prazo, fora_prazo, taxa_cumprimento_sla })
  })

  router.get("/api/processos/sla-contato", (req, res) => {
    const resolvidos = db.contatos.filter((c) => c.RESULTADO === "RESPONDIDO" || c.RESULTADO === "SEM_RESPOSTA")
    const avaliados = resolvidos
      .map((c) => {
        const processo = db.processos.find((p) => p.ID_PROCESSO === c.ID_PROCESSO)
        if (!processo || !processo.PRAZO_CONTATO || !c.DATA_RESULTADO) return null
        return { prazo: processo.PRAZO_CONTATO, resolucao: c.DATA_RESULTADO.slice(0, 10) }
      })
      .filter(Boolean)

    const total_avaliados = avaliados.length
    const dentro_prazo = avaliados.filter((a) => a.resolucao <= a.prazo).length
    const fora_prazo = total_avaliados - dentro_prazo
    const taxa_cumprimento_sla = total_avaliados ? Math.round((dentro_prazo / total_avaliados) * 1000) / 10 : 0

    enviarJson(res, 200, { total_avaliados, dentro_prazo, fora_prazo, taxa_cumprimento_sla })
  })

  router.get("/api/processos", (req, res, ctx) => {
    const status = ctx.query.get("status")
    const etapa = ctx.query.get("etapa")
    const municipio = ctx.query.get("municipio")
    const protocolo = ctx.query.get("protocolo")
    const provedor = ctx.query.get("provedor")

    let lista = db.processos
    if (status) lista = lista.filter((p) => p.STATUS_ATUAL === status)
    if (etapa) lista = lista.filter((p) => nomeEtapaAtual(p) === etapa)
    if (municipio) lista = lista.filter((p) => (p.MUNICIPIO || "").toLowerCase().includes(municipio.toLowerCase()))
    if (protocolo) lista = lista.filter((p) => (p.NUMERO_PROTOCOLO || "").includes(protocolo))
    if (provedor) lista = lista.filter((p) => (p.RAZAO_SOCIAL || "").toLowerCase().includes(provedor.toLowerCase()))

    enviarJson(res, 200, lista.map(processoParaListagem))
  })

  router.get("/api/processos/:id", (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")
    enviarJson(res, 200, processoParaDetalhe(processo))
  })

  router.get("/api/processos/:id/jornada", (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const lista = db.jornadas
      .filter((j) => j.ID_PROCESSO === processo.ID_PROCESSO && j.ATIVO === "S")
      .sort((a, b) => a.ORDEM_FLUXO - b.ORDEM_FLUXO || a.DATA_ENTRADA_ETAPA.localeCompare(b.DATA_ENTRADA_ETAPA) || a.ID_JORNADA - b.ID_JORNADA)

    enviarJson(res, 200, lista)
  })

  router.get("/api/processos/:id/documentos", (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const lista = db.documentos
      .filter((d) => d.ID_PROCESSO === processo.ID_PROCESSO && d.ATIVO === "S")
      .sort((a, b) => b.DATA_UPLOAD.localeCompare(a.DATA_UPLOAD))

    enviarJson(res, 200, lista)
  })

  router.post("/api/processos/:id/documentos", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const corpo = ctx.body
    const idEtapa = Number(corpo.id_etapa)
    if (!db.etapaPorId(idEtapa)) return erroDetalhe(res, 404, "Etapa não encontrada")
    if (!corpo.nome_arquivo || !corpo.caminho_arquivo) {
      return erroDetalhe(res, 400, "Informe nome_arquivo e caminho_arquivo")
    }

    const documento = db.adicionarDocumento({
      idProcesso: processo.ID_PROCESSO,
      idEtapa,
      tipoDocumento: corpo.tipo_documento,
      nomeArquivo: corpo.nome_arquivo,
      tipoArquivo: corpo.tipo_arquivo,
      caminhoArquivo: corpo.caminho_arquivo,
      tamanhoBytes: corpo.tamanho_bytes,
      observacao: corpo.observacao,
      usuarioUpload: corpo.usuario_upload,
    })

    enviarJson(res, 200, {
      success: true,
      id_documento: documento.ID_DOCUMENTO,
      id_processo: processo.ID_PROCESSO,
      id_etapa: idEtapa,
      mensagem: "Documento registrado com sucesso.",
    })
  })

  router.delete("/api/documentos/:id", (req, res, ctx) => {
    const documento = db.documentos.find((d) => d.ID_DOCUMENTO === Number(ctx.params.id) && d.ATIVO === "S")
    if (!documento) return erroDetalhe(res, 404, "Documento não encontrado")
    documento.ATIVO = "N"
    enviarJson(res, 200, { success: true, id_documento: documento.ID_DOCUMENTO, mensagem: "Documento removido." })
  })

  router.post("/api/processos/:id/analise-cadastral", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const corpo = ctx.body
    const registro = db.adicionarAnaliseCadastral({
      idProcesso: processo.ID_PROCESSO,
      idEtapa: Number(corpo.id_etapa),
      dadosConferidos: Boolean(corpo.dados_conferidos),
      cnpjValidado: Boolean(corpo.cnpj_validado),
      responsavelValidado: Boolean(corpo.responsavel_validado),
      contatoConfirmado: Boolean(corpo.contato_confirmado),
      usuarioRegistro: corpo.usuario_registro,
    })

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      mensagem: "Análise cadastral registrada com sucesso.",
      id_analise: registro.ID_ANALISE,
    })
  })

  router.post("/api/processos/:id/parecer", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const corpo = ctx.body
    if (!corpo.resultado) return erroDetalhe(res, 400, "Informe o resultado do parecer")

    const registro = db.adicionarParecer({
      idProcesso: processo.ID_PROCESSO,
      idEtapa: Number(corpo.id_etapa),
      resultado: corpo.resultado,
      observacao: corpo.observacao,
      usuarioRegistro: corpo.usuario_registro,
    })

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      mensagem: "Parecer registrado com sucesso.",
      id_parecer: registro.ID_PARECER,
    })
  })

  router.post("/api/processos/:id/contratacao", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const corpo = ctx.body
    if (!corpo.numero_pn || !corpo.numero_contrato || !corpo.url_contrato) {
      return erroDetalhe(res, 400, "Informe numero_pn, numero_contrato e url_contrato")
    }

    const registro = db.adicionarContratacao({
      idProcesso: processo.ID_PROCESSO,
      numeroPn: corpo.numero_pn,
      numeroContrato: corpo.numero_contrato,
      dataAssinatura: corpo.data_assinatura,
      urlContrato: corpo.url_contrato,
      usuarioRegistro: corpo.usuario_registro,
    })

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      mensagem: "Contratação registrada com sucesso.",
      id_contratacao: registro.ID_CONTRATACAO,
    })
  })

  router.patch("/api/processos/:id/jornada/atribuir", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado.")

    const jornadaAtual = db.jornadaEmAndamento(processo.ID_PROCESSO)
    if (!jornadaAtual) return erroDetalhe(res, 404, "Nenhuma etapa em andamento para este processo.")

    const responsavel = (ctx.body.responsavel || "").trim() || null
    const prazo = (ctx.body.prazo || "").trim() || null

    jornadaAtual.RESPONSAVEL_ETAPA = responsavel
    jornadaAtual.PRAZO_ETAPA = prazo
    jornadaAtual.DATA_ATRIBUICAO_ETAPA = db.agora()

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      responsavel_etapa: responsavel,
      prazo_etapa: prazo,
    })
  })

  router.patch("/api/processos/:id/atribuir-contato", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado.")

    const responsavel = (ctx.body.responsavel || "").trim() || null
    const prazo = (ctx.body.prazo || "").trim() || null

    processo.RESPONSAVEL_CONTATO = responsavel
    processo.PRAZO_CONTATO = prazo
    processo.DATA_ATRIBUICAO_CONTATO = db.agora()

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      responsavel_contato: responsavel,
      prazo_contato: prazo,
    })
  })

  router.post("/api/processos/:id/avancar-etapa", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")
    if (processoEncerrado(processo)) return erroDetalhe(res, 409, "Processo já está encerrado")

    const etapaAtual = db.etapaPorId(processo.ETAPA_ATUAL)
    const jornadaAtual = db.jornadaEmAndamento(processo.ID_PROCESSO)
    if (!etapaAtual || !jornadaAtual) return erroDetalhe(res, 400, "Não há etapa em andamento para este processo")

    const nomeNormalizado = db.normalizarNomeEtapa(etapaAtual.NOME_ETAPA)

    if (nomeNormalizado === "DOCUMENTACAO") {
      const temDocumento = db.documentos.some(
        (d) => d.ID_PROCESSO === processo.ID_PROCESSO && d.ID_ETAPA === etapaAtual.ID_ETAPA && d.ATIVO === "S"
      )
      if (!temDocumento) return erroDetalhe(res, 400, "Envie ao menos um documento antes de concluir esta etapa")
    } else if (nomeNormalizado === "ANALISE_CADASTRAL") {
      const analise = db.ultimoRegistro(db.analisesCadastrais, processo.ID_PROCESSO, etapaAtual.ID_ETAPA)
      const completo =
        analise &&
        analise.DADOS_CONFERIDOS === "S" &&
        analise.CNPJ_VALIDADO === "S" &&
        analise.RESPONSAVEL_VALIDADO === "S" &&
        analise.CONTATO_CONFIRMADO === "S"
      if (!completo) return erroDetalhe(res, 400, "Registre a análise cadastral completa antes de concluir esta etapa")
    } else if (nomeNormalizado === "APROVACAO") {
      const parecer = db.ultimoRegistro(db.pareceres, processo.ID_PROCESSO, etapaAtual.ID_ETAPA)
      if (!parecer) return erroDetalhe(res, 400, "Registre o parecer antes de concluir esta etapa")
      if (db.normalizarNomeEtapa(parecer.RESULTADO) === "REPROVADO") {
        return erroDetalhe(res, 409, "Parecer reprovado — utilize Retornar Etapa ou Cancelar Processo")
      }
    } else if (nomeNormalizado === "CONTRATACAO") {
      const temContratacao = db.contratacoes.some((c) => c.ID_PROCESSO === processo.ID_PROCESSO)
      if (!temContratacao) return erroDetalhe(res, 400, "Registre a contratação antes de concluir esta etapa")
    }

    const resultado = db.executarAvancoEtapa(processo.ID_PROCESSO)

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      etapaAnterior: resultado.etapaAnterior,
      novaEtapa: resultado.novaEtapa,
      statusProcesso: resultado.statusProcesso,
      mensagem: resultado.novaEtapa
        ? `Etapa concluída. Processo avançou para ${resultado.novaEtapa}.`
        : "Processo concluído com sucesso.",
    })
  })

  router.post("/api/processos/:id/retornar-etapa", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")
    if (processoEncerrado(processo)) return erroDetalhe(res, 409, "Processo já está encerrado")

    const motivo = (ctx.body.motivo || "").trim()
    if (!motivo) return erroDetalhe(res, 422, "Informe o motivo do retorno")

    const etapaAtual = db.etapaPorId(processo.ETAPA_ATUAL)
    if (!etapaAtual || !db.etapaPorOrdem(etapaAtual.ORDEM_FLUXO - 1)) {
      return erroDetalhe(res, 400, "Não há etapa anterior para retornar")
    }

    const resultado = db.executarRetorno(processo.ID_PROCESSO, motivo)

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      etapaAnterior: resultado.etapaAnterior,
      novaEtapa: resultado.novaEtapa,
      statusProcesso: resultado.statusProcesso,
      mensagem: `Processo retornado para ${resultado.novaEtapa}.`,
    })
  })

  router.post("/api/processos/:id/cancelar", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")
    if (processoEncerrado(processo)) return erroDetalhe(res, 409, "Processo já está encerrado")

    const motivo = (ctx.body.motivo || "").trim()
    if (!motivo) return erroDetalhe(res, 422, "Informe o motivo do cancelamento")

    db.executarCancelamento(processo.ID_PROCESSO, motivo)

    enviarJson(res, 200, {
      success: true,
      id_processo: processo.ID_PROCESSO,
      statusProcesso: "CANCELADO",
      mensagem: "Processo cancelado.",
    })
  })

  router.get("/api/processos/:id/contatos", (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const lista = db.contatos
      .filter((c) => c.ID_PROCESSO === processo.ID_PROCESSO)
      .sort((a, b) => (b.DATA_CONTATO || "").localeCompare(a.DATA_CONTATO || ""))

    enviarJson(res, 200, lista)
  })

  router.post("/api/processos/:id/contatos", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const corpo = ctx.body
    if (!corpo.data_contato) return erroDetalhe(res, 400, "Informe data_contato")
    if (!corpo.observacao || !corpo.observacao.trim()) return erroDetalhe(res, 400, "Informe observacao")

    db.adicionarContato({
      idProcesso: processo.ID_PROCESSO,
      dataContato: corpo.data_contato,
      meioContato: corpo.meio_contato,
      pessoaContato: corpo.pessoa_contato,
      observacao: corpo.observacao,
      resultado: corpo.resultado,
    })

    enviarJson(res, 200, { success: true, id_processo: processo.ID_PROCESSO, mensagem: "Contato registrado." })
  })

  router.patch("/api/processos/:id/contatos/:id_contato", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const contato = db.contatos.find((c) => c.ID_CONTATO === Number(ctx.params.id_contato) && c.ID_PROCESSO === processo.ID_PROCESSO)
    if (!contato) return erroDetalhe(res, 404, "Contato não encontrado")

    if (ctx.body.resultado !== undefined) {
      contato.RESULTADO = ctx.body.resultado
      contato.DATA_RESULTADO = ctx.body.resultado && ctx.body.resultado !== "AGUARDANDO" ? db.agora() : null
    }

    enviarJson(res, 200, { success: true, id_contato: contato.ID_CONTATO, resultado: contato.RESULTADO })
  })

  router.post("/api/processos/:id/contatos/enviar-email", async (req, res, ctx) => {
    const processo = encontrarProcesso(ctx.params.id)
    if (!processo) return erroDetalhe(res, 404, "Processo não encontrado")

    const corpo = ctx.body
    const destinatario = corpo.para || processo.EMAIL
    if (!destinatario) return erroDetalhe(res, 400, "Não há destinatário para o e-mail")
    if (!corpo.assunto || !corpo.corpo) return erroDetalhe(res, 400, "Informe assunto e corpo")

    // Sem envio real de e-mail no mock — só registra como um contato.
    db.adicionarContato({
      idProcesso: processo.ID_PROCESSO,
      dataContato: db.agora(),
      meioContato: "EMAIL",
      pessoaContato: corpo.pessoa_contato,
      observacao: `Assunto: ${corpo.assunto}\n\n${corpo.corpo}`,
      resultado: "AGUARDANDO",
    })

    enviarJson(res, 200, { success: true, id_processo: processo.ID_PROCESSO, destinatario, mensagem: "E-mail (fictício) enviado." })
  })
}

module.exports = { registrar }
