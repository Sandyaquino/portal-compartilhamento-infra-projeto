import * as XLSX from "xlsx"

import type { AnaliseRedeResposta } from "@/lib/types/trecho-rede"

// Exporta o resultado da Análise de Rede num .xlsx: abas Resumo, Postes
// sinalizados e Evidências. Dispara o download no navegador.
export function baixarAnaliseRedeExcel(dados: AnaliseRedeResposta) {
  const { parametros: p, resumo: r } = dados
  const wb = XLSX.utils.book_new()

  const resumo: (string | number)[][] = [
    ["Análise de Rede — postes na rota não faturados"],
    [],
    ["Município", p.municipio],
    ["Alimentador", p.alimentador ?? "(todos)"],
    ["Tipo de trecho", p.entidade],
    ["Critério", p.modo === "MESMO_PROVEDOR" ? "Mesmo provedor nos dois extremos" : "Corredor ocupado (qualquer provedor)"],
    ["Máx. trechos no vão", p.max_trechos],
    ["Exigir o mesmo alimentador", p.exigir_mesmo_alimentador ? "Sim" : "Não"],
    ["Vão máximo (m)", p.max_metros_vao],
    ["Score mínimo", p.min_score],
    ["Provedor", p.id_operadora ? String(p.id_operadora) : "(todos)"],
    [],
    ["Postes sinalizados", r.postes_sinalizados],
    ["Provedores implicados", r.provedores_implicados],
    ["Trechos no escopo", r.trechos_no_escopo],
    ["Nós no escopo", r.nos],
    ["Nós sem ocupação (avaliados)", r.nos_sem_ocupacao],
    ["Gerado em", new Date().toLocaleString("pt-BR")],
  ]
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo["!cols"] = [{ wch: 30 }, { wch: 48 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo")

  const linhasPostes = dados.postes.map((poste) => ({
    Barramento: poste.BARRAMENTO,
    "Município": poste.MUNICIPIO,
    Alimentador: poste.ALIMENTADOR,
    Tipo: poste.ENTIDADE === "TRECHO DE MT" ? "MT" : "BT",
    Score: poste.SCORE,
    Grau: poste.GRAU,
    "Sem ocupação": poste.SEM_OCUPACAO ? "Sim" : "Ocupação não identificada",
    "Provedor(es) implicado(s)": poste.provedores.map((x) => x.razao).join(" | "),
    "Qtd. evidências": poste.evidencias.length,
    Latitude: poste.Y,
    Longitude: poste.X,
    "Google Maps": `https://www.google.com/maps/search/?api=1&query=${poste.Y},${poste.X}`,
  }))
  const wsPostes = XLSX.utils.json_to_sheet(linhasPostes)
  wsPostes["!cols"] = [
    { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 6 }, { wch: 7 }, { wch: 6 },
    { wch: 24 }, { wch: 42 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 52 },
  ]
  XLSX.utils.book_append_sheet(wb, wsPostes, "Postes sinalizados")

  const linhasEvid = dados.postes.flatMap((poste) =>
    poste.evidencias.map((ev) => ({
      "Poste sinalizado": poste.BARRAMENTO,
      Alimentador: poste.ALIMENTADOR,
      "Score do poste": poste.SCORE,
      "Extremo A (ocupado)": ev.poste_a,
      "Extremo C (ocupado)": ev.poste_c,
      "Trechos no vão": ev.trechos,
      "Metros no vão": ev.metros,
      "Mesmo alimentador": ev.mesmo_alimentador ? "Sim" : "Não",
      "Provedor(es) em comum": ev.provedores.map((x) => x.razao).join(" | "),
    })),
  )
  const wsEvid = XLSX.utils.json_to_sheet(
    linhasEvid.length ? linhasEvid : [{ "Poste sinalizado": "(sem evidências)" }],
  )
  wsEvid["!cols"] = [
    { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 18 },
    { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 42 },
  ]
  XLSX.utils.book_append_sheet(wb, wsEvid, "Evidências")

  const nome = `analise-rede-${p.municipio.toLowerCase().replace(/\s+/g, "-")}-${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, nome)
}
