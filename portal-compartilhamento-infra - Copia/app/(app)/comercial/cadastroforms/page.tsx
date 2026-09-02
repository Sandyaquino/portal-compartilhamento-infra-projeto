"use client"

import {
  ImportadorCsv,
  formatarDataCurta,
  formatarNumero,
  type CardConsolidado,
  type ColunaRegistro,
} from "@/components/shared/importador-csv"

function simNao(valor: unknown) {
  const texto = String(valor ?? "").trim().toUpperCase()
  if (["S", "SIM", "TRUE", "1"].includes(texto)) return "Sim"
  if (["N", "NAO", "NÃO", "FALSE", "0"].includes(texto)) return "Não"
  return valor ? String(valor) : "-"
}

function classeStatusEntrada(status?: unknown) {
  switch (String(status ?? "")) {
    case "NOVO":
      return "bg-blue-100 text-blue-700"
    case "IMPORTADO":
    case "PROVEDOR_CRIADO":
    case "PROCESSO_CRIADO":
      return "bg-green-100 text-green-700"
    case "ANALISADO":
    case "EM_ANALISE":
      return "bg-yellow-100 text-yellow-700"
    case "DUPLICADO":
      return "bg-orange-100 text-orange-700"
    case "DESCARTADO":
      return "bg-red-100 text-red-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

const cardsConsolidado: CardConsolidado[] = [
  { titulo: "Total Importações", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_IMPORTACOES as number) },
  { titulo: "Novos Entrantes", valor: ({ consolidado }) => formatarNumero(consolidado?.NOVOS_ENTRANTES as number) },
  { titulo: "Importados", cor: "text-green-600", valor: ({ consolidado }) => formatarNumero(consolidado?.IMPORTADOS as number) },
  { titulo: "Descartados", cor: "text-red-600", valor: ({ consolidado }) => formatarNumero(consolidado?.DESCARTADOS as number) },
]

const colunas: ColunaRegistro[] = [
  { key: "ID_ENTRADA", titulo: "ID" },
  { key: "DATA_RECEBIMENTO", titulo: "Recebido", render: (item) => formatarDataCurta(item.DATA_RECEBIMENTO as string) },
  { key: "RAZAO_SOCIAL", titulo: "Razão Social", strong: true, title: (item) => String(item.RAZAO_SOCIAL ?? "") },
  { key: "CNPJ", titulo: "CNPJ" },
  { key: "MUNICIPIO", titulo: "Município", title: (item) => String(item.MUNICIPIO ?? "") },
  { key: "UF", titulo: "UF", align: "center" },
  { key: "QTD_POSTES", titulo: "Postes", align: "center", numeric: true },
  { key: "POSSUI_GEOS", titulo: "GEOS", align: "center", render: (item) => simNao(item.POSSUI_GEOS) },
  {
    key: "STATUS_ENTRADA",
    titulo: "Status",
    align: "center",
    render: (item) => (
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${classeStatusEntrada(item.STATUS_ENTRADA)}`}>
        {String(item.STATUS_ENTRADA ?? "-")}
      </span>
    ),
  },
]

export default function ImportacaoFormsPage() {
  return (
    <ImportadorCsv
      titulo="Importação Forms"
      descricao="Importação dos novos entrantes recebidos através do Microsoft Forms."
      breadcrumbs={[
        { label: "Início", href: "/" },
        { label: "Comercial", href: "/comercial" },
        { label: "Importação Forms" },
      ]}
      recurso="novos-entrantes"
      uploadTitulo="Formulário de Regularização do Provedor"
      uploadSubtitulo="Selecione o CSV exportado do Microsoft Forms com os novos entrantes."
      cardsConsolidado={cardsConsolidado}
      colunasRegistro={colunas}
      buscaRegistroKeys={["RAZAO_SOCIAL", "NOME_FANTASIA", "CNPJ", "MUNICIPIO", "STATUS_ENTRADA"]}
      csvColunas={[
        "ID_ENTRADA",
        "DATA_RECEBIMENTO",
        "DATA_IMPORTACAO",
        "RAZAO_SOCIAL",
        "NOME_FANTASIA",
        "CNPJ",
        "MUNICIPIO",
        "UF",
        "EMAIL_CONTATO",
        "TELEFONE_CONTATO",
        "QTD_POSTES",
        "POSSUI_GEOS",
        "POSSUI_OS_GEOS",
        "STATUS_ENTRADA",
        "CREATED_BY",
      ]}
      csvNomeArquivo="PORTAL_COMPARTILHAMENTO_ENTRADA.csv"
    />
  )
}
