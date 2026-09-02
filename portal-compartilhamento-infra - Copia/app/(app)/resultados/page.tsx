import { PageHeader } from "@/components/layout/page-header"

export default function ResultadosPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Resultados"
        description="Dados e indicadores do portal."
        breadcrumbs={[
          {
            label: "Início",
            href: "/",
          },
          {
            label: "Resultados",
          },
        ]}
      />

      {/* Conteúdo */}
    </div>
  )
}