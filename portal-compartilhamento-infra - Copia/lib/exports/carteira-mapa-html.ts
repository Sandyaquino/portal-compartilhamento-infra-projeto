import type { CarteiraDetalhe } from "@/lib/types/carteira"

const CORES = [
  "#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed",
  "#0891b2", "#65a30d", "#dc2626", "#4f46e5", "#0d9488",
]

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  )
}

// Gera um .html autocontido (Leaflet via CDN) com camada de satélite, camadas
// por equipe, filtro por dia, legenda e tooltip por ponto com os dados da OS
// e links para Google Maps / Waze. Dispara o download no navegador.
export function baixarCarteiraMapaHtml(det: CarteiraDetalhe) {
  const c = det.carteira
  const equipes = [...new Set(det.os.map((o) => o.NOME_EQUIPE))]
  const dias = [...new Set(det.os.map((o) => o.DATA_PREVISTA))].sort()
  const corPorEquipe: Record<string, string> = {}
  equipes.forEach((e, i) => (corPorEquipe[e] = CORES[i % CORES.length]))

  const pontos = det.os.map((o) => ({
    seq: o.SEQ,
    lat: o.LATITUDE,
    lng: o.LONGITUDE,
    eq: o.NOME_EQUIPE,
    mun: o.MUNICIPIO,
    loc: o.LOCALIDADE ?? "",
    dia: o.DATA_PREVISTA,
    diaIdx: o.DIA_INDICE,
    ordem: o.ORDEM_NO_DIA,
    bar: o.DE_BARRAMENTO,
    prov: o.TEM_PROVEDOR,
    gmaps: o.LINK_GMAPS,
    waze: o.LINK_WAZE,
    cor: corPorEquipe[o.NOME_EQUIPE],
  }))

  const legendaItens = equipes
    .map((e) => {
      const qtd = det.os.filter((o) => o.NOME_EQUIPE === e).length
      return `<div class="li"><span class="sw" style="background:${corPorEquipe[e]}"></span>${esc(e)} <b>(${qtd})</b></div>`
    })
    .join("")

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(c.TITULO)} — Mapa</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body{margin:0;height:100%;font:14px/1.4 system-ui,Segoe UI,Roboto,sans-serif}
  #map{position:absolute;inset:0}
  .painel{position:absolute;z-index:1000;background:#fff;border:1px solid #d7dde3;border-radius:10px;
    box-shadow:0 6px 24px rgba(0,0,0,.15);padding:10px 12px}
  .topo{top:12px;left:12px;max-width:320px}
  .topo h1{margin:0 0 2px;font-size:14px}
  .topo .sub{color:#64748b;font-size:12px}
  .topo select{margin-top:8px;width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}
  .legenda{bottom:16px;right:16px;max-height:45vh;overflow:auto}
  .legenda h2{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
  .legenda .li{display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0}
  .legenda .sw{width:12px;height:12px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.25)}
  .tt{font-size:12px;min-width:190px}
  .tt b.t{display:block;font-size:12px;margin-bottom:2px}
  .tt .row{color:#475569}
  .tt .links{margin-top:6px;display:flex;gap:8px}
  .tt .links a{color:#2563eb;text-decoration:none;font-weight:600}
  .marker-num{display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;
    border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}
</style>
</head>
<body>
<div id="map"></div>

<div class="painel topo">
  <h1>${esc(c.TITULO)}</h1>
  <div class="sub">${esc(c.DATA_INICIO)} a ${esc(c.DATA_FIM)} · ${det.os.length} OS · ${equipes.length} equipe(s) · EPS ${esc(c.EPS ?? "-")}</div>
  <select id="filtroDia">
    <option value="">Todos os dias</option>
    ${dias.map((d, i) => `<option value="${esc(d)}">Dia ${i + 1} — ${esc(d)}</option>`).join("")}
  </select>
</div>

<div class="painel legenda">
  <h2>Equipes</h2>
  ${legendaItens}
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var PONTOS = ${JSON.stringify(pontos)};

  var satelite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Esri World Imagery" });
  var rotulos = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19 });
  var ruas = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "&copy; OpenStreetMap" });

  var satComRotulos = L.layerGroup([satelite, rotulos]);

  var map = L.map("map", { layers: [satComRotulos] });

  // camadas por equipe (aparecem no controle de camadas e na legenda)
  var camadasEquipe = {};
  var todosMarcadores = [];
  PONTOS.forEach(function (p) {
    var size = 22;
    var icon = L.divIcon({
      className: "",
      html: '<div class="marker-num" style="width:' + size + 'px;height:' + size + 'px;background:' + p.cor + '">' + p.ordem + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    var m = L.marker([p.lat, p.lng], { icon: icon });
    var tt =
      '<div class="tt">' +
      '<b class="t">OS #' + p.seq + ' — dia ' + p.diaIdx + ' (' + p.dia + '), parada ' + p.ordem + '</b>' +
      '<div class="row">' + p.mun + (p.loc ? ' · ' + p.loc : '') + '</div>' +
      '<div class="row">Equipe: <b>' + p.eq + '</b></div>' +
      '<div class="row">Barramento: ' + p.bar + (p.prov === 'N' ? ' · <b>sem provedor</b>' : '') + '</div>' +
      '<div class="row">' + p.lat.toFixed(6) + ', ' + p.lng.toFixed(6) + '</div>' +
      '<div class="links"><a href="' + p.gmaps + '" target="_blank" rel="noopener">Google Maps</a>' +
      '<a href="' + p.waze + '" target="_blank" rel="noopener">Waze</a></div>' +
      '</div>';
    m.bindTooltip(tt, { interactive: true, direction: "top", opacity: 1, className: "" });
    m.bindPopup(tt);
    m._dia = p.dia;
    m._eqLayer = p.eq;
    todosMarcadores.push(m);
    if (!camadasEquipe[p.eq]) camadasEquipe[p.eq] = L.layerGroup();
    m.addTo(camadasEquipe[p.eq]);
  });

  Object.keys(camadasEquipe).forEach(function (eq) { camadasEquipe[eq].addTo(map); });

  L.control.layers(
    { "Satélite": satComRotulos, "Ruas": ruas },
    camadasEquipe,
    { collapsed: false }
  ).addTo(map);

  // enquadra tudo
  if (PONTOS.length) {
    map.fitBounds(L.latLngBounds(PONTOS.map(function (p) { return [p.lat, p.lng]; })).pad(0.15));
  } else {
    map.setView([-12.98, -38.48], 12);
  }

  // filtro por dia
  document.getElementById("filtroDia").addEventListener("change", function (e) {
    var dia = e.target.value;
    todosMarcadores.forEach(function (m) {
      var visivel = !dia || m._dia === dia;
      var layer = camadasEquipe[m._eqLayer];
      if (visivel) { if (!layer.hasLayer(m)) layer.addLayer(m); }
      else { if (layer.hasLayer(m)) layer.removeLayer(m); }
    });
  });
</script>
</body>
</html>`

  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `carteira-${c.ID_CARTEIRA}-${c.DATA_INICIO}-mapa.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
