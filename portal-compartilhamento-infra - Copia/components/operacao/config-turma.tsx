import Link from "next/link"
import { AlertTriangle, CheckCircle2, Percent, Users } from "lucide-react"

import {
  formatarNumeroBR as formatarNumero,
  type DashboardCampoConfig,
} from "@/components/operacao/dashboard-campo"
import { SecoesOperacional } from "@/components/operacao/secoes-operacional"

function formatarPercentual(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  return Number.isNaN(numero) ? "0,0%" : `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function formatarData(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleDateString("pt-BR")
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "-"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString("pt-BR")
}

function formatarCabosKm(valor: number | string | undefined | null) {
  const numero = Number(valor ?? 0)
  if (Number.isNaN(numero)) return "0 km"
  const km = numero >= 1000 ? numero / 1000 : numero
  return `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
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
  turmas_oficiais: 0,
  turmas_apresentadas: 0,
  turmas_pendentes: 0,
  percentual_apresentacao: 0,
  postes: 0,
  cabos: 0,
  caixas: 0,
  municipios: 0,
  manutencao: 0,
  folga: 0,
  sem_atividade: 0,
  sem_os: 0,
  percentual_execucao_os: 0,
}

export function criarConfigTurma(opts: { titulo: string; descricao: string; breadcrumbLabel: string; rodape: string }): DashboardCampoConfig {
  return {
    perfil: "turma",
    titulo: opts.titulo,
    descricao: opts.descricao,
    breadcrumbLabel: opts.breadcrumbLabel,
    recursoDashboard: "dashboard-operacional",
    breakdownEndpoints: ["ranking", "evolucao-apresentacao"],
    registrosEndpoint: "execucao/registros-recentes",
    filtrosIniciais: {
      periodo: "mes_atual",
      dataInicial: "",
      dataFinal: "",
      eps: "",
      equipe: "",
      municipio: "",
    },
    filtros: [
      { tipo: "select", campo: "eps", label: "EPS", allLabel: "Todas", opcoes: ["CADIC", "DINAMO", "ELEKTRA", "ORC"] },
      { tipo: "input", campo: "equipe", label: "Equipe", placeholder: "Ex.: ORCA" },
      { tipo: "input", campo: "municipio", label: "Município", placeholder: "Ex.: Salvador" },
    ],
    montarQuery: (f) => {
      const p = new URLSearchParams()
      p.set("periodo", f.periodo)
      if (f.periodo === "personalizado") {
        if (f.dataInicial) p.set("data_inicial", f.dataInicial)
        if (f.dataFinal) p.set("data_final", f.dataFinal)
      }
      if (f.eps) p.set("eps", f.eps)
      if (f.equipe?.trim()) p.set("equipe", f.equipe.trim())
      if (f.municipio?.trim()) p.set("municipio", f.municipio.trim())
      return p.toString()
    },
    resumoInicial: RESUMO_INICIAL,
    kpis: (d) => {
      const r = d.resumo
      return [
        [
          { key: "turmas-of", title: "Turmas Oficiais", value: formatarNumero(r.turmas_oficiais), subtitle: "Total de turmas cadastradas", icon: Users, color: "text-blue-600" },
          { key: "apres", title: "Apresentadas", value: formatarNumero(r.turmas_apresentadas), subtitle: "Turmas com execução", icon: CheckCircle2, color: "text-green-600" },
          { key: "pend", title: "Pendentes", value: formatarNumero(r.turmas_pendentes), subtitle: "Sem apresentação", icon: AlertTriangle, color: "text-orange-600" },
          { key: "pct", title: "Apresentação", value: formatarPercentual(r.percentual_apresentacao), subtitle: "Média diária do período", icon: Percent, color: "text-primary" },
        ],
      ]
    },
    Secoes: SecoesOperacional,
    registros: {
      tituloTabela: "Registros Recentes de Execução de Remoções",
      descricaoTabela: "Consulta operacional dos últimos apontamentos retornados pela API.",
      buscaKeys: ["RESPONSAVEL", "EQUIPE", "EPS", "NUMERO_OS", "TIPO_OS", "MUNICIPIO", "BAIRRO", "STATUS_APRESENTACAO"],
      colunas: [
        { key: "DATA_EXECUCAO", titulo: "Data", render: (i) => formatarData(i.DATA_EXECUCAO) },
        { key: "EPS", titulo: "Empresa" },
        { key: "RESPONSAVEL", titulo: "Técnico", strong: true, render: (i) => String(i.RESPONSAVEL || i.EQUIPE || "-") },
        { key: "NUMERO_OS", titulo: "OS" },
        { key: "TIPO_OS", titulo: "Tipo OS" },
        { key: "MUNICIPIO", titulo: "Município" },
        { key: "BAIRRO", titulo: "Bairro" },
        { key: "POSTES_EXECUTADOS", titulo: "Postes", align: "center", numeric: true },
        { key: "CABOS_REMOVIDOS", titulo: "Cabos", align: "center", render: (i) => <span className="font-semibold text-blue-600">{formatarCabosKm(i.CABOS_REMOVIDOS)}</span> },
        { key: "CAIXAS_REMOVIDAS", titulo: "Caixas", align: "center", render: (i) => <span className="font-semibold text-orange-600">{formatarNumero(i.CAIXAS_REMOVIDAS)}</span> },
        { key: "POSTE_FORA_OS", titulo: "Fora OS", align: "center", render: (i) => <span className="font-semibold text-red-600">{formatarNumero(i.POSTE_FORA_OS)}</span> },
        {
          key: "STATUS_APRESENTACAO",
          titulo: "Status",
          align: "center",
          render: (i) => (
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {String(i.STATUS_APRESENTACAO || "-")}
            </span>
          ),
        },
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
        "DATA_EXECUCAO", "EPS", "RESPONSAVEL", "EQUIPE", "NUMERO_OS", "TIPO_OS", "MUNICIPIO", "BAIRRO",
        "POSTES_EXECUTADOS", "CABOS_REMOVIDOS", "CAIXAS_REMOVIDAS", "POSTE_FORA_OS", "STATUS_APRESENTACAO",
        "DATA_IMPORTACAO", "OS_POSTES_EXECUTADOS", "OS_QNTD_POSTES", "ID_ACAO",
      ],
      csvNomeArquivo: "registros_recentes_fiscalizacao.csv",
      edicao: {
        funcionalidade: "EDITAR_CADASTRO_EQUIPE",
        recurso: "turma-campo",
        campos: [
          { key: "MUNICIPIO", label: "Município" },
          { key: "BAIRRO", label: "Bairro" },
          { key: "POSTES_EXECUTADOS", label: "Postes Executados", type: "number" },
          { key: "CABOS_REMOVIDOS", label: "Cabos Removidos (m)", type: "number" },
          { key: "CAIXAS_REMOVIDAS", label: "Caixas Removidas", type: "number" },
          { key: "OBSERVACAO", label: "Observação" },
          { key: "STATUS_APRESENTACAO", label: "Status Apresentação" },
        ],
        valoresIniciais: (i) => ({
          MUNICIPIO: (i.MUNICIPIO as string) ?? "",
          BAIRRO: (i.BAIRRO as string) ?? "",
          POSTES_EXECUTADOS: (i.POSTES_EXECUTADOS as string | number) ?? "",
          CABOS_REMOVIDOS: (i.CABOS_REMOVIDOS as string | number) ?? "",
          CAIXAS_REMOVIDAS: (i.CAIXAS_REMOVIDAS as string | number) ?? "",
          OBSERVACAO: (i.OBSERVACAO as string) ?? "",
          STATUS_APRESENTACAO: (i.STATUS_APRESENTACAO as string) ?? "",
        }),
        montarBody: (v) => ({
          MUNICIPIO: v.MUNICIPIO || null,
          BAIRRO: v.BAIRRO || null,
          POSTES_EXECUTADOS: v.POSTES_EXECUTADOS === "" ? null : Number(v.POSTES_EXECUTADOS),
          CABOS_REMOVIDOS: v.CABOS_REMOVIDOS === "" ? null : Number(v.CABOS_REMOVIDOS),
          CAIXAS_REMOVIDAS: v.CAIXAS_REMOVIDAS === "" ? null : Number(v.CAIXAS_REMOVIDAS),
          OBSERVACAO: v.OBSERVACAO || null,
          STATUS_APRESENTACAO: v.STATUS_APRESENTACAO || null,
        }),
      },
    },
    rodape: opts.rodape,
  }
}
