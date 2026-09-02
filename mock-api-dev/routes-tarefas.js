"use strict"

// Caixa de Tarefas: agrega, num só lugar, as pendências acionáveis de vários
// módulos (Projetos, Jornada de Entrantes, Operação) — "o que eu preciso
// fazer hoje". Lê os stores em memória que já existem; não guarda estado
// próprio.

const db = require("./db")
const projetosMod = require("./routes-projetos")
const { enviarJson } = require("./util")

const STATUS_ENTRANTE_ABERTO = ["NOVO", "ANALISADO"]

function soData(valor) {
  return valor ? String(valor).slice(0, 10) : null
}

function diasParaPrazo(prazo) {
  if (!prazo) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${soData(prazo)}T00:00:00`)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

function situacaoPrazo(prazo) {
  const d = diasParaPrazo(prazo)
  if (d === null) return "SEM_PRAZO"
  if (d < 0) return "ATRASADO"
  if (d <= 2) return "VENCENDO"
  return "EM_DIA"
}

function tarefa({ tipo, entidade, titulo, descricao, modulo, responsavel, prioridade, prazo, link, dataReferencia }) {
  return {
    ID: `${tipo}:${entidade}`,
    TIPO: tipo,
    TITULO: titulo,
    DESCRICAO: descricao || null,
    MODULO: modulo,
    RESPONSAVEL: responsavel || null,
    PRIORIDADE: prioridade || null,
    PRAZO: soData(prazo),
    DIAS_PARA_PRAZO: diasParaPrazo(prazo),
    SITUACAO_PRAZO: situacaoPrazo(prazo),
    LINK: link,
    DATA_REFERENCIA: dataReferencia || null,
  }
}

// Constrói a lista completa de tarefas (sem filtro de responsável).
function coletarTarefas() {
  const tarefas = []

  // --- Projetos: análise da minha carteira + não atribuídos + triagem ---
  for (const p of projetosMod.projetos) {
    if (p.ATIVO !== "S" || projetosMod.STATUS_ENCERRADO.includes(p.STATUS_PROJETO)) continue
    if (p.RESPONSAVEL_ANALISE) {
      tarefas.push(
        tarefa({
          tipo: "PROJETO_ANALISE",
          entidade: p.ID_PROJETO,
          titulo: `${p.NUMERO_PROJETO} — ${p.NOME_FANTASIA || p.RAZAO_SOCIAL}`,
          descricao: `Analisar projeto · docs ${p.DOCS_VALIDADOS}/${p.DOCS_OBRIGATORIOS} · ${p.MUNICIPIO || "-"}`,
          modulo: "Projetos",
          responsavel: p.RESPONSAVEL_ANALISE,
          prioridade: p.PRIORIDADE,
          prazo: p.PRAZO_ANALISE,
          link: `/projetos/${p.ID_PROJETO}`,
          dataReferencia: p.DATA_RECEBIMENTO,
        }),
      )
    } else {
      tarefas.push(
        tarefa({
          tipo: "PROJETO_ATRIBUIR",
          entidade: p.ID_PROJETO,
          titulo: `${p.NUMERO_PROJETO} — ${p.NOME_FANTASIA || p.RAZAO_SOCIAL}`,
          descricao: "Atribuir responsável de análise",
          modulo: "Projetos",
          responsavel: null,
          prioridade: p.PRIORIDADE,
          prazo: p.PRAZO_ANALISE,
          link: "/projetos/carteira",
          dataReferencia: p.DATA_RECEBIMENTO,
        }),
      )
    }
  }
  for (const s of projetosMod.submissoes) {
    if (s.STATUS_SUBMISSAO !== "NOVO") continue
    tarefas.push(
      tarefa({
        tipo: "SUBMISSAO_TRIAR",
        entidade: s.ID_SUBMISSAO,
        titulo: s.ASSUNTO || `Submissão #${s.ID_SUBMISSAO}`,
        descricao: `Triar e-mail e gerar projeto · ${s.EMAIL_REMETENTE || "-"}`,
        modulo: "Projetos",
        responsavel: null,
        prioridade: null,
        prazo: null,
        link: "/projetos/entrada",
        dataReferencia: s.DATA_EMAIL,
      }),
    )
  }

  // --- Jornada de Entrantes: análise da carteira + não atribuídos ---
  for (const e of db.entrantes) {
    if (e.ATIVO !== "S" || !STATUS_ENTRANTE_ABERTO.includes(e.STATUS_ENTRADA)) continue
    if (e.RESPONSAVEL_ANALISE) {
      tarefas.push(
        tarefa({
          tipo: "ENTRANTE_ANALISE",
          entidade: e.ID_ENTRADA,
          titulo: `${e.RAZAO_SOCIAL || e.NOME_FANTASIA || "Entrante"} — ${e.CNPJ || ""}`.trim(),
          descricao: `Analisar entrante · ${e.MUNICIPIO || "-"}/${e.UF || "-"}`,
          modulo: "Jornada de Entrantes",
          responsavel: e.RESPONSAVEL_ANALISE,
          prioridade: e.PRIORIDADE,
          prazo: e.PRAZO_ANALISE,
          link: `/comercial/novosentrantes/${e.ID_ENTRADA}`,
          dataReferencia: e.DATA_RECEBIMENTO,
        }),
      )
    } else {
      tarefas.push(
        tarefa({
          tipo: "ENTRANTE_ATRIBUIR",
          entidade: e.ID_ENTRADA,
          titulo: `${e.RAZAO_SOCIAL || e.NOME_FANTASIA || "Entrante"} — ${e.CNPJ || ""}`.trim(),
          descricao: "Atribuir responsável de análise",
          modulo: "Jornada de Entrantes",
          responsavel: null,
          prioridade: e.PRIORIDADE,
          prazo: e.PRAZO_ANALISE,
          link: "/comercial/carteira-analise",
          dataReferencia: e.DATA_RECEBIMENTO,
        }),
      )
    }
  }

  // --- Operação: solicitações de ação abertas (por time) ---
  for (const s of db.solicitacoes) {
    if (s.STATUS !== "ABERTA") continue
    const provedor = db.provedores.find((p) => p.ID_PROVEDOR === s.ID_PROVEDOR)
    tarefas.push(
      tarefa({
        tipo: "ACAO_EXECUTAR",
        entidade: s.ID_SOLICITACAO,
        titulo: `${s.TIPO_ACAO} — ${provedor ? provedor.NOME_FANTASIA || provedor.RAZAO_SOCIAL : `Provedor #${s.ID_PROVEDOR}`}`,
        descricao: `${s.DESCRICAO || "Executar ação solicitada"} · time ${s.TIME_RESPONSAVEL}`,
        modulo: "Operação",
        responsavel: s.RESPONSAVEL_EXECUCAO || null,
        prioridade: s.PRIORIDADE,
        prazo: null,
        link: s.ID_PROVEDOR ? `/comercial/provedores/${s.ID_PROVEDOR}` : "/operacao/carteira",
        dataReferencia: s.DATA_SOLICITACAO,
      }),
    )
  }

  return tarefas
}

const ORDEM_SITUACAO = { ATRASADO: 0, VENCENDO: 1, EM_DIA: 2, SEM_PRAZO: 3 }

function ordenar(tarefas) {
  return [...tarefas].sort((a, b) => {
    const s = ORDEM_SITUACAO[a.SITUACAO_PRAZO] - ORDEM_SITUACAO[b.SITUACAO_PRAZO]
    if (s !== 0) return s
    if (a.PRAZO && b.PRAZO) return a.PRAZO.localeCompare(b.PRAZO)
    if (a.PRAZO) return -1
    if (b.PRAZO) return 1
    return String(b.DATA_REFERENCIA || "").localeCompare(String(a.DATA_REFERENCIA || ""))
  })
}

function aplicarFiltroResponsavel(tarefas, responsavel) {
  if (!responsavel) return tarefas
  if (responsavel === "__sem__") return tarefas.filter((t) => !t.RESPONSAVEL)
  return tarefas.filter((t) => t.RESPONSAVEL === responsavel)
}

function registrar(router) {
  router.get("/api/tarefas", (req, res, ctx) => {
    const responsavel = ctx.query.get("responsavel")
    const modulo = ctx.query.get("modulo")
    let lista = aplicarFiltroResponsavel(coletarTarefas(), responsavel)
    if (modulo) lista = lista.filter((t) => t.MODULO === modulo)
    enviarJson(res, 200, ordenar(lista))
  })

  router.get("/api/tarefas/resumo", (req, res, ctx) => {
    const responsavel = ctx.query.get("responsavel")
    const lista = aplicarFiltroResponsavel(coletarTarefas(), responsavel)
    const porModulo = {}
    for (const t of lista) porModulo[t.MODULO] = (porModulo[t.MODULO] || 0) + 1
    enviarJson(res, 200, {
      total: lista.length,
      atrasadas: lista.filter((t) => t.SITUACAO_PRAZO === "ATRASADO").length,
      vencendo: lista.filter((t) => t.SITUACAO_PRAZO === "VENCENDO").length,
      sem_prazo: lista.filter((t) => t.SITUACAO_PRAZO === "SEM_PRAZO").length,
      por_modulo: porModulo,
    })
  })
}

module.exports = { registrar }
