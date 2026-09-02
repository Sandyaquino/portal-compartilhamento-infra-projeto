import { PageHeader } from "@/components/layout/page-header"

export default function FisicoPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Resultados de Execução"
        description="Relatórios e dashboards corporativos."
        breadcrumbs={[
          {
            label: "Início",
            href: "/",
          },
          {
            label: "Resultados",
            href: "/resultados",
          },
          {
            label: "Resultados de Execução",
          },
        ]}
      />
    </div>
  )
}