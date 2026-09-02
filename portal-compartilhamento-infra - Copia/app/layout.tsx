import "./globals.css"

export const metadata = {
  title: "Portal de Compartilhamento de Infraestrutura",
  description: "Gestão de contratos, faturamento e fiscalização.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  )
}