"use client"

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { API_BASE_URL as API_URL } from "@/lib/config";
import { NotificationBanner, type Notification } from "@/components/ui/notification-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterField } from "@/components/ui/filter-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import {
  DollarSign,
  Landmark,
  Users,
  FileText,
  Scale,
  BarChart3,
} from "lucide-react";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";



import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// Dynamic imports for Leaflet components (no SSR)
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);

const GeoJSON = dynamic(
  () => import("react-leaflet").then((mod) => mod.GeoJSON),
  { ssr: false }
);

const COLORS = [
  "#005A34",
  "#2563EB",
  "#F97316",
  "#7C3AED",
  "#DC2626",
];

export default function FaturamentoPage() {
  const [resumo, setResumo] = useState<any>(null);
  const [municipios, setMunicipios] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [judicial, setJudicial] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [abc, setAbc] = useState<any[]>([]);
  const [reajustes, setReajustes] = useState<any[]>([]);
  const [vencendo, setVencendo] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({
    municipio: "",
    lote: "",
    cliente: "",
    flag_judicial: "",
  });
  const [geoData, setGeoData] = useState<any>(null);
  const [notification, setNotification] = useState<Notification | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    carregarDados();

    // Load GeoJSON data for map
    fetch("/municipio-small.json")
      .then((res) => res.json())
      .then((data) => setGeoData(data))
      .catch((err) => console.error(err));
  }, []);

  function montarQuery() {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.append(k, v as string);
    });
    return params.toString();
  }

  async function carregarDados() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setNotification(null);
      const query = montarQuery();

      const [
        resumoResp,
        municipiosResp,
        lotesResp,
        judicialResp,
        clientesResp,
        abcResp,
        reajustesResp,
        vencendoResp,
      ] = await Promise.all([
        fetch(`${API_URL}/api/faturamento/resumo?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/municipios?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/lotes?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/judicial?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/clientes?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/curva-abc?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/reajustes?${query}`, { signal: controller.signal }),
        fetch(`${API_URL}/api/faturamento/contratos-vencendo?dias=90&${query}`, { signal: controller.signal }),
      ]);

      const respostas = [
        resumoResp,
        municipiosResp,
        lotesResp,
        judicialResp,
        clientesResp,
        abcResp,
        reajustesResp,
        vencendoResp,
      ];

      const comFalha = respostas.some((resp) => !resp.ok);
      if (comFalha) {
        setNotification({
          type: "error",
          message: "Não foi possível carregar todos os dados de faturamento. Tente aplicar os filtros novamente.",
        });
      }

      setResumo(resumoResp.ok ? await resumoResp.json() : null);
      setMunicipios(municipiosResp.ok ? await municipiosResp.json() : []);
      setLotes(lotesResp.ok ? await lotesResp.json() : []);
      setJudicial(judicialResp.ok ? await judicialResp.json() : []);
      setClientes(clientesResp.ok ? await clientesResp.json() : []);
      setAbc(abcResp.ok ? await abcResp.json() : []);
      setReajustes(reajustesResp.ok ? await reajustesResp.json() : []);
      setVencendo(vencendoResp.ok ? await vencendoResp.json() : []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      setNotification({ type: "error", message: "Erro inesperado ao carregar dados de faturamento." });
    }
  }

  function moeda(valor: number) {
    return valor?.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }

  function normalizar(texto: string) {
    return texto
      ?.toUpperCase()
      ?.normalize("NFD")
      ?.replace(/[̀-ͯ]/g, "");
  }

  function getColor(nome: string) {
    const municipio = municipios.find(
      (m) => normalizar(m.municipio) === normalizar(nome)
    );
    if (!municipio) return "#E0E0E0";
    const receita = municipio.receita;
    if (receita > 1000000) return "#005A34";
    if (receita > 500000) return "#2E7D32";
    if (receita > 100000) return "#66BB6A";
    return "#C8E6C9";
  }

  // Leaflet GeoJSON style
  const geoStyle = (feature: any) => {
    const nome = feature.properties?.name;
    return {
      fillColor: getColor(nome),
      color: "#FFF",
      weight: 1,
      fillOpacity: 0.7,
    };
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Faturamento"
        description="Painel executivo de faturamento e carteira."
        breadcrumbs={[
          { label: "Início", href: "/" },
          { label: "Comercial", href: "/comercial" },
          { label: "Faturamento" },
        ]}
      />

      <NotificationBanner notification={notification} />

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <FilterField label="Município">
            <Input
              placeholder="Município"
              value={filtros.municipio}
              onChange={(e) =>
                setFiltros({ ...filtros, municipio: e.target.value })
              }
            />
          </FilterField>

          <FilterField label="Lote">
            <Input
              placeholder="Lote"
              value={filtros.lote}
              onChange={(e) =>
                setFiltros({ ...filtros, lote: e.target.value })
              }
            />
          </FilterField>

          <FilterField label="Cliente">
            <Input
              placeholder="Cliente"
              value={filtros.cliente}
              onChange={(e) =>
                setFiltros({ ...filtros, cliente: e.target.value })
              }
            />
          </FilterField>

          <FilterField label="Judicial">
            <Select
              value={filtros.flag_judicial || "__all__"}
              onValueChange={(v) =>
                setFiltros({ ...filtros, flag_judicial: v === "__all__" || v === null ? "" : v })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="JUDICIAL">Judicial</SelectItem>
                <SelectItem value="NAO_JUDICIAL">Não Judicial</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        <div className="mt-4">
          <Button onClick={carregarDados}>Aplicar Filtros</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardKpi title="Receita Total" value={moeda(resumo?.receita_total)} icon={<DollarSign />} />
        <CardKpi title="Postes" value={resumo?.postes?.toLocaleString("pt-BR")} icon={<Landmark />} />
        <CardKpi title="Receita/Poste" value={`R$ ${resumo?.receita_poste}`} icon={<BarChart3 />} />
        <CardKpi title="% Judicial" value={`${resumo?.percentual_judicial}%`} icon={<Scale />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardKpi title="Contratos" value={resumo?.contratos} icon={<FileText />} />
        <CardKpi title="Clientes" value={resumo?.clientes} icon={<Users />} />
        <CardKpi title="Valor Médio Poste" value={`R$ ${resumo?.valor_unitario}`} icon={<DollarSign />} />
        <CardKpi title="Receita Média" value={moeda(resumo?.receita_media_contrato)} icon={<BarChart3 />} />
      </div>

      {/* GRÁFICOS */}
      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard title="Receita por Município">
          <BarChartWrapper data={municipios} dataKey="receita" xKey="municipio" />
        </ChartCard>

        <ChartCard title="Receita por Lote">
          <BarChartWrapper data={lotes} dataKey="receita" xKey="lote" />
        </ChartCard>

        <ChartCard title="Judicial x Não">
          <PieWrapper data={judicial} dataKey="receita" nameKey="flag" />
        </ChartCard>
      </div>

      {/* ABC */}
      <ChartCard title="Curva ABC">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={abc.slice(0, 30)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="posicao" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="percentual_acumulado"
              stroke="#005A34"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* REAJUSTES */}
      <ChartCard title="Reajustes">
        <PieWrapper data={reajustes} dataKey="receita" nameKey="indice" />
      </ChartCard>

      {/* TOP CLIENTES */}
      <TableCard title="Top Clientes" data={clientes} />

      {/* CONTRATOS VENCENDO */}
      <TableCard title="Contratos Vencendo" data={vencendo} />

      {/* MAPA */}
      <ChartCard title="Mapa por Município">
        <div className="w-full h-[600px] relative">
          <MapContainer center={[-12, -41]} zoom={7} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {geoData && (
              <GeoJSON
                data={geoData}
                style={geoStyle as any}
                onEachFeature={(feature: any, layer: any) => {
                  const nome = feature.properties?.name;
                  const m = municipios.find((m) => normalizar(m.municipio) === normalizar(nome));
                  const receita = m?.receita ? m.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'N/A';
                  layer.bindTooltip(`${nome}: ${receita}`, { sticky: true });
                } }
              />
            )}
          </MapContainer>
          <div className="absolute bottom-2 right-2 bg-white p-2 rounded shadow" style={{ zIndex: 1000 }}>
            <div className="text-xs font-semibold">Legenda</div>
            <div><span className="inline-block w-4 h-4 mr-1" style={ {backgroundColor: '#005A34'} }></span> &gt;1M</div>
            <div><span className="inline-block w-4 h-4 mr-1" style={ {backgroundColor: '#2E7D32'} }></span> &gt;500k - 1M</div>
            <div><span className="inline-block w-4 h-4 mr-1" style={ {backgroundColor: '#66BB6A'} }></span> &gt;100k - 500k</div>
            <div><span className="inline-block w-4 h-4 mr-1" style={ {backgroundColor: '#C8E6C9'} }></span> &le;100k</div>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

/* COMPONENTES */

function CardKpi({ title, value, icon }: any) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {title}
        </p>
        <div className="text-slate-400">
          {icon}
        </div>
      </div>
      <h3 className="mt-2 text-3xl font-bold text-slate-900">{value}</h3>
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function BarChartWrapper({ data, dataKey, xKey }: any) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data.slice(0, 10)}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} hide />
        <YAxis />
        <Tooltip />
        <Bar dataKey={dataKey} fill="#005A34" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieWrapper({ data, dataKey, nameKey }: any) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey={dataKey} nameKey={nameKey}>
          {data.map((_: any, i: number) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TableCard({ title, data }: any) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="text-slate-500">
            <TableHead className="p-2">Nome</TableHead>
            <TableHead className="p-2 text-right">Receita</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.slice(0, 10).map((row: any, i: number) => (
            <TableRow key={i}>
              <TableCell className="p-2">{row.cliente || row.indice}</TableCell>
              <TableCell className="p-2 text-right font-medium">
                {row.receita?.toLocaleString("pt-BR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
