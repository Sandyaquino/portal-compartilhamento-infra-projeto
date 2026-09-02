import { PageHeader } from "@/components/layout/page-header"

export default function ComercialPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Comercial"
        description="Gestão comercial de compartilhamento de infraestrutura."
        breadcrumbs={[
          {
            label: "Início",
            href: "/",
          },
          {
            label: "Comercial",
          },
        ]}
      />

      {/* Conteúdo */}
    </div>
  )
}
