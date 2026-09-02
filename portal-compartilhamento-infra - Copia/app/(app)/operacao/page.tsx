"use client"

import { DashboardCampo } from "@/components/operacao/dashboard-campo"
import { criarConfigTurma } from "@/components/operacao/config-turma"

const config = criarConfigTurma({
  titulo: "Dashboard Operacional",
  descricao: "Acompanhamento diário das turmas de compartilhamento.",
  breadcrumbLabel: "Dashboard Operacional",
  rodape:
    "Acompanhamento diário da produção das turmas de compartilhamento: apresentação, postes executados e ranking por equipe.",
})

export default function OperacaoPage() {
  return <DashboardCampo config={config} />
}
