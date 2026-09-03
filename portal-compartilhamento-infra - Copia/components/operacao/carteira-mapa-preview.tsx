"use client"

import { useEffect } from "react"
import "leaflet/dist/leaflet.css"
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"

import type { CarteiraOS } from "@/lib/types/carteira"

const CORES = [
  "#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed",
  "#0891b2", "#65a30d", "#dc2626", "#4f46e5", "#0d9488",
]

function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pontos.length) map.fitBounds(L.latLngBounds(pontos).pad(0.15))
  }, [map, pontos])
  return null
}

export default function CarteiraMapaPreview({ os }: { os: CarteiraOS[] }) {
  const equipes = [...new Set(os.map((o) => o.NOME_EQUIPE))]
  const corPorEquipe: Record<string, string> = {}
  equipes.forEach((e, i) => (corPorEquipe[e] = CORES[i % CORES.length]))
  const pontos = os.map((o) => [o.LATITUDE, o.LONGITUDE] as [number, number])

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={[-12.98, -38.48]} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri World Imagery"
          maxZoom={19}
        />
        <Enquadrar pontos={pontos} />
        {os.map((o) => (
          <CircleMarker
            key={o.ID_CARTEIRA_OS ?? o.SEQ}
            center={[o.LATITUDE, o.LONGITUDE]}
            radius={5}
            pathOptions={{
              color: "#fff",
              weight: 1,
              fillColor: corPorEquipe[o.NOME_EQUIPE],
              fillOpacity: o.TEM_PROVEDOR === "N" ? 0.95 : 0.55,
            }}
          >
            <Tooltip direction="top" opacity={1}>
              <div className="text-xs">
                <strong>OS #{o.SEQ}</strong> — dia {o.DIA_INDICE} ({o.DATA_PREVISTA}), parada {o.ORDEM_NO_DIA}
                <br />
                {o.MUNICIPIO}
                {o.LOCALIDADE ? ` · ${o.LOCALIDADE}` : ""}
                <br />
                Equipe: <strong>{o.NOME_EQUIPE}</strong>
                <br />
                {o.LATITUDE.toFixed(6)}, {o.LONGITUDE.toFixed(6)}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="absolute bottom-2 right-2 z-[1000] rounded-lg border border-slate-200 bg-white/95 p-2 text-[11px] shadow-md">
        {equipes.map((e) => (
          <div key={e} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corPorEquipe[e] }} />
            {e}
          </div>
        ))}
      </div>
    </div>
  )
}
