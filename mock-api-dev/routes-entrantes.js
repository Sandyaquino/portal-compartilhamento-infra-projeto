"use strict"

const db = require("./db")
const { enviarJson, erroDetalhe } = require("./util")

function encontrarEntrada(id) {
  return db.entrantes.find((e) => e.ID_ENTRADA === Number(id))
}

// Histórico fictício de cargas do Forms - alimenta a tela Comercial > Cadastro
// Forms (importação). Vive em memória; POST /importar acrescenta uma linha.
const importacoesEntrantes = Array.from({ length: 5 }, (_, i) => {
  const data = new Date()
  data.setDate(data.getDate() - (24 - i * 6))
  const lidos = 15 + Math.floor(Math.random() * 40)
  const rejeitados = i === 1 ? 1 + Math.floor(Math.random() * 3) : 0
  return {
    ID: i + 1,
    NOME_ARQUIVO: `FORMS_REGULARIZACAO_${data.toISOString().slice(0, 10).replace(/-/g, "")}.csv`,
    DATA_IMPORTACAO: data.toISOString(),
    USUARIO_IMPORTACAO: "importacao-forms",
    REGISTROS_LIDOS: lidos,
    REGISTROS_INSERIDOS: lidos - rejeitados,
    REGISTROS_ATUALIZADOS: Math.floor(Math.random() * 6),
    REGISTROS_REJEITADOS: rejeitados,
    STATUS_IMPORTACAO: rejeitados ? "SUCESSO_PARCIAL" : "SUCESSO",
  }
}).reverse()

function registrar(router) {
  router.get("/api/novos-entrantes/analistas", (req, res) => {
    enviarJson(res, 200, db.analistas)
  })

  // ---- Cadastro Forms (importação de novos entrantes) ----
  router.get("/api/novos-entrantes/consolidado", (req, res) => {
    const descartados = db.entrantes.filter((e) => e.STATUS_ENTRADA === "DESCARTADO").length
    enviarJson(res, 200, {
      TOTAL_IMPORTACOES: importacoesEntrantes.length,
      REGISTROS_PROCESSADOS:
        importacoesEntrantes.reduce((t, i) => t + i.REGISTROS_INSERIDOS + i.REGISTROS_ATUALIZADOS, 0),
      TOTAL_REJEITADOS: importacoesEntrantes.reduce((t, i) => t + i.REGISTROS_REJEITADOS, 0),
      ULTIMA_IMPORTACAO: importacoesEntrantes[0] ? importacoesEntrantes[0].DATA_IMPORTACAO : null,
      NOVOS_ENTRANTES: db.entrantes.length,
      IMPORTADOS: db.entrantes.length - descartados,
      DESCARTADOS: descartados,
    })
  })

  router.get("/api/novos-entrantes/importacoes", (req, res) => {
    enviarJson(res, 200, importacoesEntrantes)
  })

  router.get("/api/novos-entrantes/registros", (req, res) => {
    const lista = db.entrantes.map((e) => ({
      ID_ENTRADA: e.ID_ENTRADA,
      DATA_RECEBIMENTO: e.DATA_RECEBIMENTO,
      DATA_IMPORTACAO: e.DATA_IMPORTACAO,
      RAZAO_SOCIAL: e.RAZAO_SOCIAL,
      NOME_FANTASIA: e.NOME_FANTASIA,
      CNPJ: e.CNPJ,
      MUNICIPIO: e.MUNICIPIO,
      UF: e.UF,
      EMAIL_CONTATO: e.EMAIL_CONTATO,
      TELEFONE_CONTATO: e.TELEFONE_CONTATO,
      QTD_POSTES: e.QTD_POSTES,
      POSSUI_GEOS: e.POSSUI_GEOS,
      POSSUI_OS_GEOS: e.POSSUI_OS_GEOS,
      STATUS_ENTRADA: e.STATUS_ENTRADA,
      CREATED_BY: e.CREATED_BY,
    }))
    enviarJson(res, 200, lista)
  })

  router.post("/api/novos-entrantes/importar", async (req, res) => {
    const lidos = 20 + Math.floor(Math.random() * 30)
    const rejeitados = Math.floor(Math.random() * 3)
    const resultado = {
      registros_lidos: lidos,
      registros_inseridos: lidos - rejeitados,
      registros_atualizados: Math.floor(Math.random() * 5),
      registros_rejeitados: rejeitados,
    }
    importacoesEntrantes.unshift({
      ID: importacoesEntrantes.length + 1,
      NOME_ARQUIVO: `FORMS_REGULARIZACAO_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`,
      DATA_IMPORTACAO: db.agora(),
      USUARIO_IMPORTACAO: "dev.local",
      REGISTROS_LIDOS: lidos,
      REGISTROS_INSERIDOS: resultado.registros_inseridos,
      REGISTROS_ATUALIZADOS: resultado.registros_atualizados,
      REGISTROS_REJEITADOS: rejeitados,
      STATUS_IMPORTACAO: rejeitados ? "SUCESSO_PARCIAL" : "SUCESSO",
    })
    enviarJson(res, 200, resultado)
  })

  router.get("/api/novos-entrantes/carteira", (req, res) => {
    const lista = db.entrantes
      .filter((e) => e.ATIVO === "S" && ["NOVO", "ANALISADO"].includes(e.STATUS_ENTRADA))
      .sort((a, b) => String(a.PRAZO_ANALISE ?? "9999").localeCompare(String(b.PRAZO_ANALISE ?? "9999")) || a.DATA_RECEBIMENTO.localeCompare(b.DATA_RECEBIMENTO))
      .map((e) => ({
        ID_ENTRADA: e.ID_ENTRADA,
        RAZAO_SOCIAL: e.RAZAO_SOCIAL,
        NOME_FANTASIA: e.NOME_FANTASIA,
        CNPJ: e.CNPJ,
        MUNICIPIO: e.MUNICIPIO,
        UF: e.UF,
        STATUS_ENTRADA: e.STATUS_ENTRADA,
        DATA_RECEBIMENTO: e.DATA_RECEBIMENTO,
        RESPONSAVEL_ANALISE: e.RESPONSAVEL_ANALISE,
        PRAZO_ANALISE: e.PRAZO_ANALISE,
        DATA_ATRIBUICAO: e.DATA_ATRIBUICAO,
        PRIORIDADE: e.PRIORIDADE,
      }))

    enviarJson(res, 200, lista)
  })

  router.get("/api/novos-entrantes/sla-analise", (req, res) => {
    const somenteData = (valor) => (valor ? String(valor).slice(0, 10) : null)

    const avaliados = db.entrantes
      .filter((e) => e.PRAZO_ANALISE)
      .map((e) => {
        const resolucao = db.historicoEntrada.find(
          (h) => h.ID_ENTRADA === e.ID_ENTRADA && ["PROVEDOR_CRIADO", "DESCARTADO"].includes(h.STATUS_NOVO)
        )
        return resolucao ? { prazo: somenteData(e.PRAZO_ANALISE), resolucao: somenteData(resolucao.DATA_EVENTO) } : null
      })
      .filter(Boolean)

    const total_avaliados = avaliados.length
    const dentro_prazo = avaliados.filter((a) => a.resolucao <= a.prazo).length
    const fora_prazo = total_avaliados - dentro_prazo
    const taxa_cumprimento_sla = total_avaliados ? Math.round((dentro_prazo / total_avaliados) * 1000) / 10 : 0

    enviarJson(res, 200, { total_avaliados, dentro_prazo, fora_prazo, taxa_cumprimento_sla })
  })

  router.patch("/api/novos-entrantes/entrada/:id/atribuir", async (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrante não encontrado")

    const responsavel = (ctx.body.responsavel || "").trim() || null
    const prazo = (ctx.body.prazo || "").trim() || null

    entrada.RESPONSAVEL_ANALISE = responsavel
    entrada.PRAZO_ANALISE = prazo
    entrada.DATA_ATRIBUICAO = db.agora()
    entrada.UPDATED_AT = db.agora()

    db.registrarHistoricoEntrada(
      entrada.ID_ENTRADA,
      entrada.STATUS_ENTRADA,
      entrada.STATUS_ENTRADA,
      responsavel ? `Atribuído a ${responsavel}, prazo ${prazo ?? "não definido"}` : "Responsável removido da carteira de análise"
    )

    enviarJson(res, 200, {
      success: true,
      id_entrada: entrada.ID_ENTRADA,
      responsavel_analise: responsavel,
      prazo_analise: prazo,
    })
  })

  router.get("/api/novos-entrantes", (req, res, ctx) => {
    const status = ctx.query.get("status")
    const municipio = ctx.query.get("municipio")
    const cnpj = ctx.query.get("cnpj")

    let lista = db.entrantes
    if (status) lista = lista.filter((e) => e.STATUS_ENTRADA === status)
    if (municipio) lista = lista.filter((e) => (e.MUNICIPIO || "").toLowerCase().includes(municipio.toLowerCase()))
    if (cnpj) lista = lista.filter((e) => (e.CNPJ || "").includes(cnpj))

    // Nota: o backend real NÃO devolve NOME_FANTASIA/UF/ID_PROCESSO nesta
    // listagem (só no detalhe). Aqui devolvemos mesmo assim de propósito,
    // pra o botão "Ver Processo" da tela de listagem funcionar no fictício
    // — é uma pequena liberdade em relação ao contrato real, documentada.
    const resposta = lista.map((e) => ({
      ID_ENTRADA: e.ID_ENTRADA,
      DATA_RECEBIMENTO: e.DATA_RECEBIMENTO,
      RAZAO_SOCIAL: e.RAZAO_SOCIAL,
      NOME_FANTASIA: e.NOME_FANTASIA,
      CNPJ: e.CNPJ,
      MUNICIPIO: e.MUNICIPIO,
      UF: e.UF,
      QTD_POSTES: e.QTD_POSTES,
      POSSUI_GEOS: e.POSSUI_GEOS,
      STATUS_ENTRADA: e.STATUS_ENTRADA,
      RESPONSAVEL_ANALISE: e.RESPONSAVEL_ANALISE,
      PRAZO_ANALISE: e.PRAZO_ANALISE,
      ID_PROCESSO: e.ID_PROCESSO,
    }))

    enviarJson(res, 200, resposta)
  })

  router.get("/api/novos-entrantes/entrada/:id", (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")
    enviarJson(res, 200, entrada)
  })

  router.get("/api/novos-entrantes/entrada/:id/historico", (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    const lista = db.historicoEntrada
      .filter((h) => h.ID_ENTRADA === entrada.ID_ENTRADA)
      .sort((a, b) => a.DATA_EVENTO.localeCompare(b.DATA_EVENTO))

    enviarJson(res, 200, lista)
  })

  // ---- Interações de contato do entrante (e-mail, ligação, WhatsApp...) ----
  const CANAIS_INTERACAO = ["EMAIL", "LIGACAO", "WHATSAPP", "REUNIAO", "PRESENCIAL", "OUTRO"]
  const SENTIDOS_INTERACAO = ["ENVIADO", "RECEBIDO"]

  router.get("/api/novos-entrantes/entrada/:id/interacoes", (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    const lista = db.interacoesEntrada
      .filter((i) => i.ID_ENTRADA === entrada.ID_ENTRADA)
      .sort((a, b) => a.DATA_INTERACAO.localeCompare(b.DATA_INTERACAO))

    enviarJson(res, 200, lista)
  })

  router.post("/api/novos-entrantes/entrada/:id/interacoes", async (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    const canal = String(ctx.body.canal || "").toUpperCase()
    const sentido = String(ctx.body.sentido || "ENVIADO").toUpperCase()
    if (!CANAIS_INTERACAO.includes(canal)) {
      return erroDetalhe(res, 400, `canal deve ser um de: ${CANAIS_INTERACAO.join(", ")}`)
    }
    if (!SENTIDOS_INTERACAO.includes(sentido)) {
      return erroDetalhe(res, 400, "sentido deve ser ENVIADO ou RECEBIDO")
    }

    const registro = db.registrarInteracaoEntrada(entrada.ID_ENTRADA, {
      canal,
      sentido,
      contato: (ctx.body.contato || "").trim() || null,
      assunto: (ctx.body.assunto || "").trim() || null,
      observacao: (ctx.body.observacao || "").trim() || null,
      usuario: (ctx.body.usuario || "").trim() || null,
    })

    entrada.UPDATED_AT = db.agora()
    enviarJson(res, 201, { success: true, interacao: registro })
  })

  // Timeline unificada: transições de estágio + interações de contato, em ordem.
  router.get("/api/novos-entrantes/entrada/:id/timeline", (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    const eventosStatus = db.historicoEntrada
      .filter((h) => h.ID_ENTRADA === entrada.ID_ENTRADA)
      .map((h) => ({
        tipo: "STATUS",
        data: h.DATA_EVENTO,
        status_anterior: h.STATUS_ANTERIOR,
        status_novo: h.STATUS_NOVO,
        detalhe: h.OBSERVACAO,
        usuario: h.USUARIO,
      }))

    const eventosContato = db.interacoesEntrada
      .filter((i) => i.ID_ENTRADA === entrada.ID_ENTRADA)
      .map((i) => ({
        tipo: "CONTATO",
        data: i.DATA_INTERACAO,
        titulo: i.ASSUNTO || "Contato registrado",
        canal: i.CANAL,
        sentido: i.SENTIDO,
        contato: i.CONTATO,
        detalhe: i.OBSERVACAO,
        usuario: i.USUARIO,
      }))

    const todos = [...eventosStatus, ...eventosContato].sort((a, b) =>
      String(a.data).localeCompare(String(b.data)),
    )
    enviarJson(res, 200, todos)
  })

  router.patch("/api/novos-entrantes/entrada/:id", async (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    const camposEditaveis = [
      "NOME_FANTASIA", "LOGRADOURO", "NUMERO_ENDERECO", "BAIRRO", "CEP", "MUNICIPIO", "UF",
      "EMAIL_CONTATO", "TELEFONE_CONTATO", "INSCRICAO_MUNICIPAL", "INSCRICAO_ESTADUAL",
      "PROCESSO_SEI_ANATEL", "NOME_RESPONSAVEL", "CPF_RESPONSAVEL", "RG_RESPONSAVEL",
      "EMAIL_RESPONSAVEL", "TELEFONE_RESPONSAVEL", "POSSUI_GEOS", "POSSUI_OS_GEOS",
      "REDE_FIBRA", "ATENDE_DIS_NOR_056", "QTD_MUNICIPIOS", "MUNICIPIOS_ATUACAO",
      "QTD_POSTES", "INFORMACOES_ADICIONAIS", "CLASSIFICACAO", "PRIORIDADE",
      "POTENCIAL_RECEITA", "OBSERVACOES",
    ]

    for (const campo of camposEditaveis) {
      if (ctx.body[campo] !== undefined && ctx.body[campo] !== null) {
        entrada[campo] = ctx.body[campo]
      }
    }

    if (entrada.STATUS_ENTRADA === "NOVO") {
      entrada.STATUS_ENTRADA = "ANALISADO"
      db.registrarHistoricoEntrada(entrada.ID_ENTRADA, "NOVO", "ANALISADO", null)
    }

    entrada.UPDATED_AT = db.agora()
    enviarJson(res, 200, { success: true, id_entrada: entrada.ID_ENTRADA })
  })

  router.patch("/api/novos-entrantes/entrada/:id/descartar", async (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    const motivo = (ctx.body.motivo || "").trim()
    if (!motivo) return erroDetalhe(res, 400, "O campo motivo é obrigatório para descarte")

    const statusAnterior = entrada.STATUS_ENTRADA
    entrada.STATUS_ENTRADA = "DESCARTADO"
    entrada.MOTIVO_DESCARTE = motivo
    entrada.DELETED_AT = db.agora()
    entrada.DELETED_BY = "dev.local"
    db.registrarHistoricoEntrada(entrada.ID_ENTRADA, statusAnterior, "DESCARTADO", motivo)

    enviarJson(res, 200, { success: true })
  })

  router.post("/api/novos-entrantes/entrada/:id/criar-provedor", async (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    if (entrada.STATUS_ENTRADA !== "ANALISADO") {
      const mensagens = {
        PROVEDOR_CRIADO: "Este entrante já possui provedor criado.",
        PROCESSO_CRIADO: "Este entrante já possui provedor criado.",
        DESCARTADO: "Este entrante foi descartado e não pode gerar provedor.",
        NOVO: "Analise o entrante antes de criar o provedor.",
      }
      return erroDetalhe(res, 409, mensagens[entrada.STATUS_ENTRADA] || "Analise o entrante antes de criar o provedor.")
    }

    if (db.provedorPorCnpj(entrada.CNPJ)) {
      return erroDetalhe(res, 409, "Provedor com este CNPJ já existe")
    }

    const provedor = db.novoProvedor({
      cnpj: entrada.CNPJ,
      razaoSocial: entrada.RAZAO_SOCIAL,
      nomeFantasia: entrada.NOME_FANTASIA,
      responsavel: entrada.NOME_RESPONSAVEL,
      email: entrada.EMAIL_CONTATO,
      telefone: entrada.TELEFONE_CONTATO,
      municipio: entrada.MUNICIPIO,
      uf: entrada.UF,
    })

    entrada.STATUS_ENTRADA = "PROVEDOR_CRIADO"
    entrada.ID_PROVEDOR = provedor.ID_PROVEDOR
    db.registrarHistoricoEntrada(entrada.ID_ENTRADA, "ANALISADO", "PROVEDOR_CRIADO", null)

    enviarJson(res, 200, {
      success: true,
      id_provedor: provedor.ID_PROVEDOR,
      id_entrada: entrada.ID_ENTRADA,
      mensagem: "Provedor criado com sucesso.",
    })
  })

  router.post("/api/novos-entrantes/entrada/:id/criar-processo", async (req, res, ctx) => {
    const entrada = encontrarEntrada(ctx.params.id)
    if (!entrada) return erroDetalhe(res, 404, "Entrada não encontrada")

    if (entrada.ID_PROCESSO || entrada.STATUS_ENTRADA === "PROCESSO_CRIADO") {
      return erroDetalhe(res, 409, "Este entrante já possui processo criado.")
    }
    if (entrada.STATUS_ENTRADA !== "PROVEDOR_CRIADO") {
      return erroDetalhe(res, 400, "Para criar o processo, o Entrante precisa estar com status PROVEDOR_CRIADO.")
    }

    const provedor = db.provedorPorCnpj(entrada.CNPJ)
    if (!provedor) {
      return erroDetalhe(res, 400, "Não existe Provedor cadastrado para o CNPJ deste Entrante. Crie o provedor primeiro.")
    }

    const processo = db.novoProcesso({ provedor, municipio: entrada.MUNICIPIO })

    entrada.STATUS_ENTRADA = "PROCESSO_CRIADO"
    entrada.ID_PROCESSO = processo.ID_PROCESSO
    entrada.ID_PROVEDOR = provedor.ID_PROVEDOR
    db.registrarHistoricoEntrada(entrada.ID_ENTRADA, "PROVEDOR_CRIADO", "PROCESSO_CRIADO", null)

    enviarJson(res, 200, {
      success: true,
      id_entrada: entrada.ID_ENTRADA,
      id_provedor: provedor.ID_PROVEDOR,
      processoCriado: processo.ID_PROCESSO,
      id_processo: processo.ID_PROCESSO,
      numeroProtocolo: processo.NUMERO_PROTOCOLO,
      mensagem: "Processo criado com sucesso.",
    })
  })

  router.get("/api/provedores/existe/:cnpj", (req, res, ctx) => {
    const provedor = db.provedores.find((p) => p.CNPJ === ctx.params.cnpj)
    enviarJson(res, 200, {
      existe: Boolean(provedor),
      id_provedor: provedor ? provedor.ID_PROVEDOR : null,
      razao_social: provedor ? provedor.RAZAO_SOCIAL : null,
    })
  })
}

module.exports = { registrar }
