"use client"

import { DashboardCampo } from "@/components/operacao/dashboard-campo"
import { criarConfigTurma } from "@/components/operacao/config-turma"

const config = criarConfigTurma({
  titulo: "Dashboard Operacional de Execução",
  descricao: "Acompanhamento diário das equipes de execução.",
  breadcrumbLabel: "Dashboard de Execução",
  rodape:
    "Acompanhamento diário da execução das equipes de remoção: apresentação, produção, ranking e os registros recentes enviados do campo.",
})

export default function ExecucaoPage() {
  return <DashboardCampo config={config} mostrarRegistros />
}
