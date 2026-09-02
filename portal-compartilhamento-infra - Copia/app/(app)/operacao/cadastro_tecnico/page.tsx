"use client"

import Link from "next/link"

import {
  ImportadorCsv,
  formatarDataCurta,
  formatarNumero,
  type CardConsolidado,
  type ColunaRegistro,
  type EdicaoConfig,
} from "@/components/shared/importador-csv"

const cardsConsolidado: CardConsolidado[] = [
  { titulo: "Total Importações", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_IMPORTACOES as number) },
  { titulo: "Registros Processados", valor: ({ consolidado }) => formatarNumero(consolidado?.REGISTROS_PROCESSADOS as number) },
  { titulo: "Total Técnicos", cor: "text-blue-600", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_TECNICOS as number) },
  { titulo: "Postes Executados", cor: "text-green-600", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_POSTES_EXECUTADOS as number) },
  { titulo: "Total OS", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_OS as number) },
  { titulo: "Total Rejeitados", cor: "text-red-600", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_REJEITADOS as number) },
  { titulo: "Última Importação", valor: ({ consolidado }) => formatarDataCurta(consolidado?.ULTIMA_IMPORTACAO as string) },
  { titulo: "Registros na Tela", cor: "text-slate-700", valor: ({ registrosFiltrados }) => formatarNumero(registrosFiltrados.length) },
]

const colunas: ColunaRegistro[] = [
  { key: "ID", titulo: "ID" },
  { key: "DATA_EXECUCAO", titulo: "Data Exec.", render: (item) => formatarDataCurta(item.DATA_EXECUCAO as string) },
  { key: "EMPRESA", titulo: "Empresa", title: (item) => String(item.EMPRESA ?? "") },
  { key: "TECNICO", titulo: "Técnico", strong: true, title: (item) => String(item.TECNICO ?? "") },
  { key: "NUMERO_OS", titulo: "Nº OS" },
  { key: "TIPO_OS", titulo: "Tipo OS", title: (item) => String(item.TIPO_OS ?? "") },
  { key: "MUNICIPIO", titulo: "Município" },
  { key: "BAIRRO", titulo: "Bairro", title: (item) => String(item.BAIRRO ?? "") },
  { key: "POSTES_EXECUTADOS", titulo: "Postes", align: "center", numeric: true },
  {
    key: "OBSERVACAO",
    titulo: "Observação",
    title: (item) => String(item.OBSERVACAO ?? item.APOIO ?? ""),
    render: (item) => String(item.OBSERVACAO ?? item.APOIO ?? "-"),
  },
  { key: "DATA_IMPORTACAO", titulo: "Importação", render: (item) => formatarDataCurta(item.DATA_IMPORTACAO as string) },
  {
    key: "ID_ACAO",
    titulo: "Ação",
    align: "center",
    render: (item) =>
      item.ID_ACAO ? (
        <Link href="/mapa-postes/acoes" className="font-medium text-primary hover:underline">
          #{String(item.ID_ACAO)}
        </Link>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
]

const edicao: EdicaoConfig = {
  funcionalidade: "EDITAR_CADASTRO_TECNICO",
  campos: [
    { key: "MUNICIPIO", label: "Município" },
    { key: "BAIRRO", label: "Bairro" },
    { key: "POSTES_EXECUTADOS", label: "Postes Executados", type: "number" },
    { key: "OBSERVACAO", label: "Observação" },
    { key: "STATUS_APRESENTACAO", label: "Status Apresentação" },
  ],
  valoresIniciais: (item) => ({
    MUNICIPIO: (item.MUNICIPIO as string) ?? "",
    BAIRRO: (item.BAIRRO as string) ?? "",
    POSTES_EXECUTADOS: (item.POSTES_EXECUTADOS as string | number) ?? "",
    OBSERVACAO: (item.OBSERVACAO as string) ?? "",
    STATUS_APRESENTACAO: (item.STATUS_APRESENTACAO as string) ?? "",
  }),
  montarBody: (valores) => ({
    MUNICIPIO: valores.MUNICIPIO || null,
    BAIRRO: valores.BAIRRO || null,
    POSTES_EXECUTADOS: valores.POSTES_EXECUTADOS === "" ? null : Number(valores.POSTES_EXECUTADOS),
    OBSERVACAO: valores.OBSERVACAO || null,
    STATUS_APRESENTACAO: valores.STATUS_APRESENTACAO || null,
  }),
}

export default function CadastroTecnicoPage() {
  return (
    <ImportadorCsv
      titulo="Cadastro Técnico"
      descricao="Importação e controle das fiscalizações técnicas realizadas em campo."
      breadcrumbs={[
        { label: "Início", href: "/" },
        { label: "Operação", href: "/operacao" },
        { label: "Cadastro Técnico" },
      ]}
      recurso="tecnico"
      uploadTitulo="Controle Diário Técnico"
      uploadSubtitulo="Selecione o CSV exportado com as fiscalizações técnicas."
      cardsConsolidado={cardsConsolidado}
      colunasRegistro={colunas}
      buscaRegistroKeys={["NUMERO_OS", "TECNICO", "EMPRESA", "MUNICIPIO", "BAIRRO", "TIPO_OS"]}
      csvColunas={[
        "ID",
        "ID_ORIGEM",
        "EMPRESA",
        "TIPO_OS",
        "NUMERO_OS",
        "TECNICO",
        "MUNICIPIO",
        "BAIRRO",
        "DATA_EXECUCAO",
        "POSTES_EXECUTADOS",
        "OBSERVACAO",
        "APOIO",
        "STATUS_APRESENTACAO",
        "DATA_IMPORTACAO",
        "USUARIO_IMPORTACAO",
        "HASH_NEGOCIO",
        "CHAVE_NEGOCIO",
      ]}
      csvNomeArquivo="PORTAL_COMPARTILHAMENTO_TECNICO.csv"
      edicao={edicao}
    />
  )
}
