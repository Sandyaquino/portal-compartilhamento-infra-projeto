export type MunicipioBounds = {
  nome: string
  min_x: number
  max_x: number
  min_y: number
  max_y: number
}

type FeatureMunicipio = {
  properties: { name: string }
  geometry: { type: string; coordinates: unknown }
}

function extrairPontos(coordinates: unknown, pontos: [number, number][]) {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    pontos.push([coordinates[0] as number, coordinates[1] as number])
    return
  }
  for (const item of coordinates) extrairPontos(item, pontos)
}

// public/municipio-small.json já é usado pela página de faturamento (mapa de
// GeoJSON de municípios) - aqui só reaproveitamos o mesmo arquivo pra
// calcular a caixa delimitadora de cada município, usada pra "voar" o mapa
// até ele (não é um filtro de dados de verdade - os postes continuam vindo
// filtrados pelo viewport atual, igual sempre foi).
export async function carregarMunicipios(): Promise<MunicipioBounds[]> {
  const response = await fetch("/municipio-small.json", { cache: "force-cache" })
  if (!response.ok) return []

  const dados: { features: FeatureMunicipio[] } = await response.json()

  return dados.features
    .map((feature) => {
      const pontos: [number, number][] = []
      extrairPontos(feature.geometry.coordinates, pontos)
      if (pontos.length === 0) return null

      let min_x = Infinity
      let max_x = -Infinity
      let min_y = Infinity
      let max_y = -Infinity
      for (const [x, y] of pontos) {
        if (x < min_x) min_x = x
        if (x > max_x) max_x = x
        if (y < min_y) min_y = y
        if (y > max_y) max_y = y
      }

      return { nome: feature.properties.name, min_x, max_x, min_y, max_y }
    })
    .filter((item): item is MunicipioBounds => item !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
