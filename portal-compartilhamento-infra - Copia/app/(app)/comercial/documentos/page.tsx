import { PageHeader } from "@/components/layout/page-header"

export default function DocumentosPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Documentos"
        description="Gestão dos documentos de compartilhamento."
        breadcrumbs={[
          {
            label: "Início",
            href: "/",
          },
          {
            label: "Comercial",
            href: "/comercial",
          },
          {
            label: "Documentos",
          },
        ]}
      />
    </div>
  )
}