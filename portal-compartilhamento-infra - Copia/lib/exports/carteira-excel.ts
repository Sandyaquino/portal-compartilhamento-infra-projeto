import * as XLSX from "xlsx"

import type { CarteiraDetalhe } from "@/lib/types/carteira"

// Exporta a carteira num .xlsx de verdade (SheetJS): abas Resumo,
// Ordens de Serviço e Por dia. Dispara o download no navegador.
export function baixarCarteiraExcel(det: CarteiraDetalhe) {
  const c = det.carteira
  const wb = XLSX.utils.book_new()

  const resumo: (string | number)[][] = [
    ["Carteira", c.TITULO],
    ["Frequência", c.FREQUENCIA],
    ["Período", `${c.DATA_INICIO} a ${c.DATA_FIM}`],
    ["Modo", c.MODO],
    ["Estratégia", c.ESTRATEGIA ?? "-"],
    ["EPS", c.EPS ?? "-"],
    ["Postes por dia", c.QTD_POSTES_DIA],
    ["Status", c.STATUS],
    [],
    ["Ordens de serviço", det.resumo.qtd_os],
    ["Dias úteis", det.resumo.qtd_dias],
    ["Equipes", det.resumo.qtd_equipes],
    ["Municípios", det.resumo.qtd_municipios],
    ["Postes sem provedor", det.resumo.sem_provedor],
    ["Postes com provedor", det.resumo.com_provedor],
  ]
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo["!cols"] = [{ wch: 22 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo")

  const linhas = det.os.map((o) => ({
    Seq: o.SEQ,
    Data: o.DATA_PREVISTA,
    Dia: o.DIA_INDICE,
    "Ordem no dia": o.ORDEM_NO_DIA,
    Equipe: o.NOME_EQUIPE,
    EPS: o.EPS,
    "Município": o.MUNICIPIO,
    Localidade: o.LOCALIDADE ?? "",
    Barramento: o.DE_BARRAMENTO,
    NU_PG_ID: o.NU_PG_ID,
    "Tem provedor": o.TEM_PROVEDOR === "S" ? "Sim" : "Não",
    "Qtd provedores": o.QTD_PROVEDORES ?? (o.PROVEDORES?.length ?? 0),
    Provedores: (o.PROVEDORES ?? []).map((p) => p.RAZAO_SOCIAL ?? p.CNPJ ?? "").filter(Boolean).join(" | "),
    Latitude: o.LATITUDE,
    Longitude: o.LONGITUDE,
    "Estratégia": o.ESTRATEGIA ?? "",
    Score: o.SCORE ?? "",
    Motivo: o.MOTIVO ?? "",
    Status: o.STATUS,
    "Google Maps": o.LINK_GMAPS,
    Waze: o.LINK_WAZE,
  }))
  const wsOs = XLSX.utils.json_to_sheet(linhas)
  wsOs["!cols"] = [
    { wch: 5 }, { wch: 11 }, { wch: 4 }, { wch: 11 }, { wch: 10 }, { wch: 24 },
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 44 }, { wch: 13 },
    { wch: 13 }, { wch: 22 }, { wch: 7 }, { wch: 42 }, { wch: 11 }, { wch: 40 }, { wch: 40 },
  ]
  XLSX.utils.book_append_sheet(wb, wsOs, "Ordens de Serviço")

  const porDia = det.por_dia.map((d) => ({
    Dia: d.dia_indice,
    Data: d.data,
    "OS": d.qtd,
    "Municípios": d.municipios.join(", "),
    Equipes: d.equipes.join(", "),
  }))
  const wsDia = XLSX.utils.json_to_sheet(porDia)
  wsDia["!cols"] = [{ wch: 4 }, { wch: 11 }, { wch: 5 }, { wch: 30 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, wsDia, "Por dia")

  XLSX.writeFile(wb, `carteira-${c.ID_CARTEIRA}-${c.DATA_INICIO}.xlsx`)
}
