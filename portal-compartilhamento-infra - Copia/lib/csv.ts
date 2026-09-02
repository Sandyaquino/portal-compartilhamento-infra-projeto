const BOM = "﻿"

export function exportarCsv<T extends Record<string, any>>(
  colunas: string[],
  registros: T[],
  nomeArquivo: string
) {
  const linhas = registros.map((registro) =>
    colunas
      .map((coluna) => {
        const valor = registro[coluna] ?? ""
        return `"${String(valor).replace(/"/g, '""')}"`
      })
      .join(";")
  )

  const csv = [colunas.join(";"), ...linhas].join("\n")
  const blob = new Blob([BOM + csv], {
    type: "text/csv;charset=utf-8;",
  })

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
