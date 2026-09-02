"use client"

import Link from "next/link"
import { Activity, AlertTriangle, ClipboardList, MapPin, Percent, UserCheck, Users, Warehouse } from "lucide-react"

import {
  DashboardCampo,
  formatarNumeroBR as formatarNumero,
  type DashboardCampoConfig,
  type DadosDashboard,
} from "@/components/operacao/dashboard-campo"
import { SecoesFiscalizacao } from "@/components/operacao/secoes-fiscalizacao"

function montarOpcoes(valores: Array<string | null | undefined>) {
  return Array.from(
    new Set(valores.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0 && v !== "-")),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"))
}

function formatarDecimal(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0,0" : numero.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatarPercentual(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0,0%" : `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function formatarDataCurta(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleDateString("pt-BR")
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString("pt-BR")
}

const LIMITE = 150

function progressoOs(exec: unknown, prog: unknown) {
  const p = Number(prog ?? 0)
  if (!prog || p <= 0) return { texto: "—", inconsistente: false }
  const e = Number(exec ?? 0)
  const pct = (e / p) * 100
  if (pct > LIMITE) return { texto: "Dado inconsistente", inconsistente: true }
  return { texto: `${formatarNumero(e)}/${formatarNumero(p)} · ${pct.toFixed(0)}%`, inconsistente: false }
}

const RESUMO_INICIAL = {
  tecnicos_oficiais: 0,
  tecnicos_apresentados: 0,
  tecnicos_pendentes: 0,
  percentual_apresentacao: 0,
  os_fiscalizadas: 0,
  postes_fiscalizados: 0,
  municipios_atendidos: 0,
  empresas_ativas: 0,
  registros: 0,
  sem_os: 0,
  sem_observacao: 0,
  concluidas: 0,
  em_andamento: 0,
  parciais: 0,
  media_postes_tecnico: 0,
  media_postes_os: 0,
  percentual_execucao_os: 0,
}

function opcoesDe(campoBreakdown: string, chaveBreakdown: string, chaveRegistro: string) {
  return (d: DadosDashboard) =>
    montarOpcoes([
      ...(d.extra[campoBreakdown] ?? []).map((i) => i[chaveBreakdown]),
      ...d.registros.map((r) => r[chaveRegistro]),
    ])
}

const config: DashboardCampoConfig = {
  perfil: "tecnico",
  titulo: "Dashboard Técnico de Fiscalização",
  descricao:
    "Acompanhamento das fiscalizações técnicas, OS fiscalizadas, postes executados, municípios atendidos e aderência da base oficial.",
  breadcrumbLabel: "Dashboard Técnico",
  recursoDashboard: "dashboard-tecnico",
  breakdownEndpoints: ["empresas", "municipios", "tipos-os", "status"],
  registrosEndpoint: "dashboard-tecnico/registros",
  filtrosIniciais: {
    periodo: "mes_atual",
    dataInicial: "",
    dataFinal: "",
    empresa: "",
    tecnico: "",
    municipio: "",
    tipoOs: "",
    setor: "",
    superintendencia: "",
  },
  filtros: [
    { tipo: "select", campo: "empresa", label: "Empresa", allLabel: "Todas as empresas", opcoes: opcoesDe("empresas", "empresa", "EMPRESA") },
    { tipo: "select", campo: "tecnico", label: "Técnico", allLabel: "Todos os técnicos", opcoes: (d) => montarOpcoes(d.registros.map((r) => r.TECNICO)) },
    { tipo: "select", campo: "municipio", label: "Município", allLabel: "Todos os municípios", opcoes: opcoesDe("municipios", "municipio", "MUNICIPIO") },
    { tipo: "select", campo: "tipoOs", label: "Tipo OS", allLabel: "Todos os tipos de OS", opcoes: opcoesDe("tipos-os", "tipo_os", "TIPO_OS") },
    { tipo: "select", campo: "setor", label: "Setor", allLabel: "Todos os setores", opcoes: (d) => montarOpcoes(d.registros.map((r) => r.SETOR)) },
    { tipo: "select", campo: "superintendencia", label: "Superintendência", allLabel: "Todas as superintendências", opcoes: (d) => montarOpcoes(d.registros.map((r) => r.SUPERINTENDENCIA)) },
  ],
  montarQuery: (f) => {
    const p = new URLSearchParams()
    p.set("periodo", f.periodo)
    if (f.periodo === "personalizado") {
      if (f.dataInicial) p.set("data_inicial", f.dataInicial)
      if (f.dataFinal) p.set("data_final", f.dataFinal)
    }
    if (f.empresa) p.set("empresa", f.empresa)
    if (f.tecnico?.trim()) p.set("tecnico", f.tecnico.trim())
    if (f.municipio?.trim()) p.set("municipio", f.municipio.trim())
    if (f.tipoOs?.trim()) p.set("tipo_os", f.tipoOs.trim())
    if (f.setor?.trim()) p.set("setor", f.setor.trim())
    if (f.superintendencia?.trim()) p.set("superintendencia", f.superintendencia.trim())
    return p.toString()
  },
  resumoInicial: RESUMO_INICIAL,
  kpis: (d) => {
    const r = d.resumo
    const execInconsistente = Number(r.percentual_execucao_os ?? 0) > LIMITE
    return [
      [
        { key: "tec-of", title: "Técnicos Oficiais", value: formatarNumero(r.tecnicos_oficiais), subtitle: "Ativos e obrigatórios", icon: Users, color: "text-blue-600" },
        { key: "apres", title: "Apresentados", value: formatarNumero(r.tecnicos_apresentados), subtitle: "Com fiscalização no período", icon: UserCheck, color: "text-green-600" },
        { key: "pend", title: "Pendentes", value: formatarNumero(r.tecnicos_pendentes), subtitle: "Sem apresentação no período", icon: AlertTriangle, color: "text-orange-600" },
        { key: "pct-apres", title: "Apresentação", value: formatarPercentual(r.percentual_apresentacao), subtitle: "Aderência operacional", icon: Percent, color: "text-primary" },
      ],
      [
        { key: "os-fisc", title: "OS Fiscalizadas", value: formatarNumero(r.os_fiscalizadas), subtitle: "Ordens distintas", icon: ClipboardList, color: "text-orange-600" },
        { key: "postes", title: "Postes Fiscalizados", value: formatarNumero(r.postes_fiscalizados), subtitle: "Volume total", icon: Warehouse, color: "text-primary" },
        { key: "mun", title: "Municípios", value: formatarNumero(r.municipios_atendidos), subtitle: "Municípios atendidos", icon: MapPin, color: "text-green-600" },
        { key: "media", title: "Média Postes/OS", value: formatarDecimal(r.media_postes_os), subtitle: "Eficiência operacional", icon: Activity, color: "text-purple-600" },
        execInconsistente
          ? { key: "pct-os", title: "% Execução das OS", value: "Dado inconsistente", subtitle: "Verifique NUMERO_OS na origem", icon: AlertTriangle, color: "text-red-600" }
          : { key: "pct-os", title: "% Execução das OS", value: formatarPercentual(r.percentual_execucao_os), subtitle: "Postes sinalizados vs. planejado (GEOS)", icon: Percent, color: "text-primary" },
      ],
    ]
  },
  Secoes: SecoesFiscalizacao,
  registros: {
    tituloTabela: "Registros Recentes de Fiscalização",
    descricaoTabela: "Consulta operacional dos últimos apontamentos retornados pela API.",
    buscaKeys: ["TECNICO", "EMPRESA", "NUMERO_OS", "MUNICIPIO", "BAIRRO", "TIPO_OS"],
    colunas: [
      { key: "DATA_EXECUCAO", titulo: "Data", render: (i) => formatarDataCurta(i.DATA_EXECUCAO) },
      { key: "EMPRESA", titulo: "Empresa" },
      { key: "TECNICO", titulo: "Técnico", strong: true },
      { key: "NUMERO_OS", titulo: "OS" },
      { key: "TIPO_OS", titulo: "Tipo OS" },
      { key: "MUNICIPIO", titulo: "Município" },
      { key: "BAIRRO", titulo: "Bairro" },
      { key: "POSTES_EXECUTADOS", titulo: "Postes", align: "center", numeric: true },
      { key: "SETOR", titulo: "Setor" },
      {
        key: "OS_PROGRESSO",
        titulo: "Progresso da OS",
        render: (i) => {
          const pr = progressoOs(i.OS_POSTES_EXECUTADOS, i.OS_QNTD_POSTES)
          return <span className={pr.inconsistente ? "font-medium text-red-600" : ""}>{pr.texto}</span>
        },
      },
      { key: "DATA_IMPORTACAO", titulo: "Importação", render: (i) => formatarDataHora(i.DATA_IMPORTACAO) },
      {
        key: "ID_ACAO",
        titulo: "Ação",
        align: "center",
        render: (i) =>
          i.ID_ACAO ? (
            <Link href="/mapa-postes/acoes" className="font-medium text-primary hover:underline">#{String(i.ID_ACAO)}</Link>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
    ],
    csvColunas: [
      "ID", "DATA_EXECUCAO", "EMPRESA", "TIPO_OS", "NUMERO_OS", "TECNICO", "SETOR", "SUPERINTENDENCIA",
      "MUNICIPIO", "BAIRRO", "POSTES_EXECUTADOS", "OBSERVACAO", "APOIO", "DATA_IMPORTACAO",
      "USUARIO_IMPORTACAO", "CHAVE_NEGOCIO", "OS_POSTES_EXECUTADOS", "OS_QNTD_POSTES", "ID_ACAO",
    ],
    csvNomeArquivo: "DASHBOARD_TECNICO_FISCALIZACOES.csv",
    edicao: {
      funcionalidade: "EDITAR_CADASTRO_TECNICO",
      recurso: "tecnico",
      campos: [
        { key: "MUNICIPIO", label: "Município" },
        { key: "BAIRRO", label: "Bairro" },
        { key: "POSTES_EXECUTADOS", label: "Postes Executados", type: "number" },
        { key: "OBSERVACAO", label: "Observação" },
        { key: "STATUS_APRESENTACAO", label: "Status Apresentação" },
      ],
      valoresIniciais: (i) => ({
        MUNICIPIO: (i.MUNICIPIO as string) ?? "",
        BAIRRO: (i.BAIRRO as string) ?? "",
        POSTES_EXECUTADOS: (i.POSTES_EXECUTADOS as string | number) ?? "",
        OBSERVACAO: (i.OBSERVACAO as string) ?? "",
        STATUS_APRESENTACAO: (i.STATUS_APRESENTACAO as string) ?? "",
      }),
      montarBody: (v) => ({
        MUNICIPIO: v.MUNICIPIO || null,
        BAIRRO: v.BAIRRO || null,
        POSTES_EXECUTADOS: v.POSTES_EXECUTADOS === "" ? null : Number(v.POSTES_EXECUTADOS),
        OBSERVACAO: v.OBSERVACAO || null,
        STATUS_APRESENTACAO: v.STATUS_APRESENTACAO || null,
      }),
    },
  },
  rodape:
    "Painel de acompanhamento agregado das fiscalizações de campo, a partir do cadastro de técnicos oficiais e dos registros diários informados pelas equipes.",
}

export default function DashboardTecnicoPage() {
  return <DashboardCampo config={config} mostrarRegistros />
}
