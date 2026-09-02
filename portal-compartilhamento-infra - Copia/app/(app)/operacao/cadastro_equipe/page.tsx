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
  { titulo: "Total Rejeitados", cor: "text-red-600", valor: ({ consolidado }) => formatarNumero(consolidado?.TOTAL_REJEITADOS as number) },
  { titulo: "Última Importação", valor: ({ consolidado }) => formatarDataCurta(consolidado?.ULTIMA_IMPORTACAO as string) },
]

const colunas: ColunaRegistro[] = [
  { key: "ID", titulo: "ID" },
  { key: "DATA_EXECUCAO", titulo: "Data Exec.", render: (item) => formatarDataCurta(item.DATA_EXECUCAO as string) },
  { key: "EQUIPE", titulo: "Equipe", strong: true, title: (item) => String(item.EQUIPE ?? "") },
  { key: "EPS", titulo: "EPS" },
  { key: "NUMERO_OS", titulo: "Nº OS" },
  { key: "MUNICIPIO", titulo: "Município" },
  { key: "BAIRRO", titulo: "Bairro", title: (item) => String(item.BAIRRO ?? "") },
  { key: "POSTES_EXECUTADOS", titulo: "Postes", align: "center", numeric: true },
  {
    key: "CABOS_REMOVIDOS",
    titulo: "Cabos",
    align: "center",
    render: (item) => <span className="font-semibold text-blue-600">{formatarNumero(item.CABOS_REMOVIDOS as number)}</span>,
  },
  {
    key: "CAIXAS_REMOVIDAS",
    titulo: "Caixas",
    align: "center",
    render: (item) => <span className="font-semibold text-orange-600">{formatarNumero(item.CAIXAS_REMOVIDAS as number)}</span>,
  },
  {
    key: "STATUS_APRESENTACAO",
    titulo: "Status",
    align: "center",
    render: (item) => (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
        {String(item.STATUS_APRESENTACAO ?? "-")}
      </span>
    ),
  },
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
  funcionalidade: "EDITAR_CADASTRO_EQUIPE",
  campos: [
    { key: "MUNICIPIO", label: "Município" },
    { key: "BAIRRO", label: "Bairro" },
    { key: "POSTES_EXECUTADOS", label: "Postes Executados", type: "number" },
    { key: "CABOS_REMOVIDOS", label: "Cabos Removidos (m)", type: "number" },
    { key: "CAIXAS_REMOVIDAS", label: "Caixas Removidas", type: "number" },
    { key: "OBSERVACAO", label: "Observação" },
    { key: "STATUS_APRESENTACAO", label: "Status Apresentação" },
  ],
  valoresIniciais: (item) => ({
    MUNICIPIO: (item.MUNICIPIO as string) ?? "",
    BAIRRO: (item.BAIRRO as string) ?? "",
    POSTES_EXECUTADOS: (item.POSTES_EXECUTADOS as string | number) ?? "",
    CABOS_REMOVIDOS: (item.CABOS_REMOVIDOS as string | number) ?? "",
    CAIXAS_REMOVIDAS: (item.CAIXAS_REMOVIDAS as string | number) ?? "",
    OBSERVACAO: (item.OBSERVACAO as string) ?? "",
    STATUS_APRESENTACAO: (item.STATUS_APRESENTACAO as string) ?? "",
  }),
  montarBody: (valores) => ({
    MUNICIPIO: valores.MUNICIPIO || null,
    BAIRRO: valores.BAIRRO || null,
    POSTES_EXECUTADOS: valores.POSTES_EXECUTADOS === "" ? null : Number(valores.POSTES_EXECUTADOS),
    CABOS_REMOVIDOS: valores.CABOS_REMOVIDOS === "" ? null : Number(valores.CABOS_REMOVIDOS),
    CAIXAS_REMOVIDAS: valores.CAIXAS_REMOVIDAS === "" ? null : Number(valores.CAIXAS_REMOVIDAS),
    OBSERVACAO: valores.OBSERVACAO || null,
    STATUS_APRESENTACAO: valores.STATUS_APRESENTACAO || null,
  }),
}

export default function CadastroEquipePage() {
  return (
    <ImportadorCsv
      titulo="Cadastro Equipes"
      descricao="Importação e controle das execuções de campo realizadas pelas equipes."
      breadcrumbs={[
        { label: "Início", href: "/" },
        { label: "Operação", href: "/operacao" },
        { label: "Cadastro Equipes" },
      ]}
      recurso="turma-campo"
      uploadTitulo="Controle Diário de Campo"
      uploadSubtitulo="Selecione o CSV exportado com as execuções das equipes."
      cardsConsolidado={cardsConsolidado}
      colunasRegistro={colunas}
      buscaRegistroKeys={["NUMERO_OS", "EQUIPE", "MUNICIPIO", "BAIRRO", "EPS"]}
      csvColunas={[
        "ID",
        "ID_ORIGEM",
        "DATA_EXECUCAO",
        "DATA_ENVIO",
        "EQUIPE",
        "RESPONSAVEL",
        "EPS",
        "TIPO_OS",
        "NUMERO_OS",
        "MUNICIPIO",
        "BAIRRO",
        "POSTES_EXECUTADOS",
        "CABOS_REMOVIDOS",
        "CAIXAS_REMOVIDAS",
        "POSTE_FORA_OS",
        "OBSERVACAO",
        "STATUS_APRESENTACAO",
        "DATA_IMPORTACAO",
        "USUARIO_IMPORTACAO",
        "CHAVE_NEGOCIO",
      ]}
      csvNomeArquivo="PORTAL_COMPARTILHAMENTO_TURMA_CAMPO.csv"
      edicao={edicao}
    />
  )
}
