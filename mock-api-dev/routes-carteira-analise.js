"use strict"

// Tabela de apoio do gerador automático da Carteira de Análise Comercial:
// tempo médio de execução por atividade. Espelha
// sql/PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO.sql.
// A distribuição em si (quem recebe o quê, prazo factível) é calculada no
// front (components/comercial/gerar-carteira-modal.tsx) a partir dos
// endpoints de carteira/analistas que já existem; aqui só fica o dado de
// apoio (tempo médio) que alimenta essa conta.

const { enviarJson, erroDetalhe } = require("./util")

const atividades = [
  { CODIGO_ATIVIDADE: "ENTRANTE", NOME: "Análise de Entrante", DESCRICAO: "Triagem inicial do cadastro recebido pelo formulário/e-mail.", TEMPO_MEDIO_MINUTOS: 90, ATIVO: "S" },
  { CODIGO_ATIVIDADE: "ETAPA_1", NOME: "Análise Cadastral", DESCRICAO: "Conferência dos dados cadastrais do provedor.", TEMPO_MEDIO_MINUTOS: 60, ATIVO: "S" },
  { CODIGO_ATIVIDADE: "ETAPA_2", NOME: "Documentação", DESCRICAO: "Validação da documentação exigida.", TEMPO_MEDIO_MINUTOS: 120, ATIVO: "S" },
  { CODIGO_ATIVIDADE: "ETAPA_3", NOME: "Aprovação", DESCRICAO: "Parecer final de aprovação.", TEMPO_MEDIO_MINUTOS: 45, ATIVO: "S" },
  { CODIGO_ATIVIDADE: "ETAPA_4", NOME: "Contratação", DESCRICAO: "Elaboração e formalização da minuta contratual.", TEMPO_MEDIO_MINUTOS: 150, ATIVO: "S" },
  { CODIGO_ATIVIDADE: "CONTATO", NOME: "Contato com Provedor", DESCRICAO: "Ligação/e-mail de acompanhamento com o provedor.", TEMPO_MEDIO_MINUTOS: 20, ATIVO: "S" },
]

function registrar(router) {
  router.get("/api/carteira-analise/atividades", (req, res) => enviarJson(res, 200, atividades))

  router.patch("/api/carteira-analise/atividades/:codigo", async (req, res, ctx) => {
    const at = atividades.find((a) => a.CODIGO_ATIVIDADE === ctx.params.codigo)
    if (!at) return erroDetalhe(res, 404, "Atividade não encontrada")
    const corpo = ctx.body || {}
    if (corpo.tempo_medio_minutos !== undefined) {
      const v = Number(corpo.tempo_medio_minutos)
      if (!Number.isFinite(v) || v <= 0) return erroDetalhe(res, 400, "tempo_medio_minutos deve ser um número positivo")
      at.TEMPO_MEDIO_MINUTOS = Math.round(v)
      at.UPDATED_AT = new Date().toISOString()
      at.UPDATED_BY = corpo.usuario || "dev.local"
    }
    enviarJson(res, 200, { success: true, atividade: at })
  })
}

module.exports = { registrar }
