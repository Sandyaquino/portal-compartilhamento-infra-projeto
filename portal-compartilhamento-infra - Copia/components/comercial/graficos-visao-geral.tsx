"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  Legend,
  Line,
  LineChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// Paleta fixa da visão geral comercial — cada cor tem um significado e não
// roda (mesma cor = mesma coisa em todos os gráficos da página).
const COR_ENTRANTE = "#2563EB" // azul — entrada nova
const COR_ANALISADO = "#4F46E5" // índigo — em análise
const COR_PROVEDOR = "#0D9488" // teal — provedor criado
const COR_PROCESSO = "#005A34" // verde primário — processo/contrato
const COR_DESCARTADO = "#94A3B8" // slate — descartado (neutro, não é "erro")

const COR_GRID = "#E5E7EB"
const COR_EIXO = { fontSize: 12, fill: "#64748B" }

function tooltipStyle() {
  return {
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    fontSize: 12,
  }
}

// ---------------------------------------------------------------------
// Funil da jornada comercial (entrantes -> analisados -> provedor ->
// processo -> concluído). Um hue só, do mais escuro (base, maior volume)
// ao mais claro — é uma sequência de magnitude, não identidades diferentes.
// ---------------------------------------------------------------------
export type EtapaFunil = { name: string; value: number }

const RAMPA_FUNIL = ["#003D23", "#00542F", "#005A34", "#2F8F63", "#7FBFA0"]

export function FunilJornada({ etapas }: { etapas: EtapaFunil[] }) {
  const dados = etapas.map((e, i) => ({ ...e, fill: RAMPA_FUNIL[Math.min(i, RAMPA_FUNIL.length - 1)] }))
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip
            formatter={(v: unknown) => [typeof v === "number" ? v.toLocaleString("pt-BR") : String(v), "itens"]}
            contentStyle={tooltipStyle()}
          />
          <Funnel dataKey="value" data={dados} isAnimationActive={false}>
            <LabelList position="right" dataKey="name" fill="#334155" fontSize={12} fontWeight={600} offset={12} />
            <LabelList
              position="center"
              dataKey="value"
              fill="#FFFFFF"
              fontSize={13}
              fontWeight={700}
              formatter={(v: unknown) => (typeof v === "number" ? v.toLocaleString("pt-BR") : String(v ?? ""))}
            />
            {dados.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------
// Entrantes por status — identidade (5 categorias fixas, ordem do fluxo).
// ---------------------------------------------------------------------
export type FatiaStatus = { name: string; value: number; cor: string }

export const CORES_STATUS_ENTRADA: Record<string, string> = {
  Novo: COR_ENTRANTE,
  Analisado: COR_ANALISADO,
  "Provedor criado": COR_PROVEDOR,
  "Processo criado": COR_PROCESSO,
  Descartado: COR_DESCARTADO,
}

export function DonutStatusEntrantes({ dados }: { dados: FatiaStatus[] }) {
  const total = dados.reduce((s, d) => s + d.value, 0)
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            formatter={(v: unknown, nome: unknown) => {
              const numero = typeof v === "number" ? v : 0
              const pct = total ? Math.round((numero / total) * 100) : 0
              return [`${numero.toLocaleString("pt-BR")} (${pct}%)`, String(nome ?? "")] as [string, string]
            }}
            contentStyle={tooltipStyle()}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Pie data={dados} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={2} stroke="#fff" strokeWidth={2}>
            {dados.map((d) => (
              <Cell key={d.name} fill={d.cor} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------
// Processos em aberto por etapa — uma série só (contagem), um hue só.
// ---------------------------------------------------------------------
export function BarrasEtapa({ dados }: { dados: { etapa: string; qtd: number }[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 16, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="etapa" tickLine={false} axisLine={false} tick={COR_EIXO} />
          <YAxis tickLine={false} axisLine={false} tick={COR_EIXO} allowDecimals={false} />
          <Tooltip formatter={(v: unknown) => [String(v ?? ""), "processos em aberto"] as [string, string]} contentStyle={tooltipStyle()} />
          <Bar dataKey="qtd" name="Processos em aberto" fill={COR_PROCESSO} radius={[4, 4, 0, 0]} maxBarSize={56}>
            <LabelList dataKey="qtd" position="top" fontSize={12} fill="#334155" fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------
// Evolução mensal: entrantes recebidos x processos abertos. Duas séries,
// mesma unidade (contagem) — um eixo só, com legenda.
// ---------------------------------------------------------------------
export function LinhaEvolucao({ dados }: { dados: { mes: string; entrantes: number; processos: number }[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 16, right: 18, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={COR_EIXO} />
          <YAxis tickLine={false} axisLine={false} tick={COR_EIXO} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="entrantes" name="Entrantes recebidos" stroke={COR_ENTRANTE} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="processos" name="Processos abertos" stroke={COR_PROCESSO} strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------
// Cumprimento de SLA por fase — cor de STATUS (semáforo), não identidade:
// cada barra é colorida pela própria taxa (>=80 verde, 50-79 âmbar, <50
// vermelho). Reservado só pra isso, nunca usado como cor categórica.
// ---------------------------------------------------------------------
function corSla(taxa: number) {
  if (taxa >= 80) return "#16A34A"
  if (taxa >= 50) return "#D97706"
  return "#DC2626"
}

export function BarrasSla({ dados }: { dados: { fase: string; taxa: number; avaliados: number }[] }) {
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tick={COR_EIXO} unit="%" />
          <YAxis type="category" dataKey="fase" tickLine={false} axisLine={false} tick={COR_EIXO} width={140} />
          <Tooltip
            formatter={(v: unknown, _n, item) => [
              `${v}% (${item?.payload?.avaliados ?? 0} avaliado(s))`,
              "cumprimento de SLA",
            ]}
            contentStyle={tooltipStyle()}
          />
          <Bar dataKey="taxa" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {dados.map((d) => (
              <Cell key={d.fase} fill={corSla(d.taxa)} />
            ))}
            <LabelList dataKey="taxa" position="right" formatter={(v: unknown) => `${v}%`} fontSize={12} fill="#334155" fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
