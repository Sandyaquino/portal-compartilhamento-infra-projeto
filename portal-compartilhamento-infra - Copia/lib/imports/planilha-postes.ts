import * as XLSX from "xlsx"

import type { LinhaPosteImport } from "@/lib/types/projetos"

export type PlanilhaPostesLida = {
  empresa: string | null
  projeto: string | null
  linhas: LinhaPosteImport[]
  ignoradas: number
}

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

// "-12,974512°" | "-0.000000°" | "-12.9745" -> number | null
function parseGrau(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const t = String(v).replace(/°|º/g, "").trim().replace(/\s/g, "").replace(",", ".")
  if (!t || t === "-" || t === "--") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// "16 Kgf" | "33°" | "1.234,5" -> number | null
function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  let t = String(v).replace(/[^0-9.,-]/g, "").trim()
  if (!t) return null
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function parseSN(v: unknown): "S" | "N" | null {
  const t = norm(v)
  if (!t) return null
  if (t.startsWith("S")) return "S"
  if (t.startsWith("N")) return "N"
  return null
}

const COLUNAS: Record<string, keyof LinhaPosteImport> = {
  OCUPACAO: "ocupacao",
  NPOSTE: "n_poste",
  NOPOSTE: "n_poste",
  NUMEROPOSTE: "n_poste",
  ENDERECO: "endereco",
  MUNICIPIO: "municipio",
  POSTE: "especificacao_poste",
  BARRAMENTO: "barramento",
  LATITUDE: "latitude",
  LONGITUDE: "longitude",
  FIXACAO: "fixacao",
  CORDOALHA: "cordoalha",
  ANGULO: "angulo",
  RESULTANTE: "resultante",
}

export async function lerPlanilhaPostes(file: File): Promise<PlanilhaPostesLida> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error("Planilha vazia ou ilegível")
  const grade = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" })

  let empresa: string | null = null
  let projeto: string | null = null
  let idxCabecalho = -1
  const mapa: Record<number, keyof LinhaPosteImport> = {}

  for (let i = 0; i < grade.length; i++) {
    const linha = grade[i] || []
    const texto = linha.map((c) => String(c ?? "")).join(" ")
    const t = norm(texto)
    if (!empresa && t.includes("EMPRESA")) empresa = texto.replace(/.*EMPRESA:?\s*/i, "").trim() || null
    if (!projeto && t.includes("PROJETO")) projeto = texto.replace(/.*PROJETO:?\s*/i, "").trim() || null

    // linha de cabeçalho das colunas
    const chaves = linha.map((c) => norm(c))
    if (chaves.includes("OCUPACAO") && (chaves.includes("LATITUDE") || chaves.includes("NPOSTE"))) {
      idxCabecalho = i
      linha.forEach((_, col) => {
        const alvo = COLUNAS[norm(linha[col])]
        if (alvo) mapa[col] = alvo
      })
      break
    }
  }

  if (idxCabecalho < 0 || !Object.values(mapa).includes("latitude")) {
    throw new Error("Não encontrei o cabeçalho da planilha (OCUPAÇÃO, LATITUDE, ...).")
  }

  const linhas: LinhaPosteImport[] = []
  let ignoradas = 0
  for (let i = idxCabecalho + 1; i < grade.length; i++) {
    const bruta = grade[i] || []
    const registro: Record<string, unknown> = {}
    for (const [col, chave] of Object.entries(mapa)) registro[chave] = bruta[Number(col)]

    const temAlgo = Object.values(registro).some((v) => String(v ?? "").trim() !== "")
    if (!temAlgo) continue

    const lat = parseGrau(registro.latitude)
    const lng = parseGrau(registro.longitude)
    const nPoste = String(registro.n_poste ?? "").trim()
    if (!nPoste && lat === null && lng === null) {
      ignoradas++
      continue
    }

    const ocup = norm(registro.ocupacao)
    linhas.push({
      ocupacao: ocup.startsWith("COMPART") ? "COMPARTILHADO" : ocup ? "NOVO" : null,
      n_poste: nPoste || null,
      endereco: String(registro.endereco ?? "").trim() || null,
      municipio: String(registro.municipio ?? "").trim() || null,
      especificacao_poste: String(registro.especificacao_poste ?? "").trim() || null,
      barramento: String(registro.barramento ?? "").trim() || null,
      latitude: lat,
      longitude: lng,
      fixacao: String(registro.fixacao ?? "").trim() || null,
      cordoalha: parseSN(registro.cordoalha),
      angulo: parseNumero(registro.angulo),
      resultante: parseNumero(registro.resultante),
    })
  }

  if (!linhas.length) throw new Error("Nenhuma linha de poste válida encontrada na planilha.")
  return { empresa, projeto, linhas, ignoradas }
}

// Gera a planilha modelo (mesmo layout do arquivo que o provedor usa).
export function baixarModeloPlanilhaPostes(empresa = "", projeto = "") {
  const linhas: (string | number)[][] = [
    [`EMPRESA: ${empresa}`],
    [`PROJETO: ${projeto}`],
    [],
    ["OCUPAÇÃO", "Nº POSTE", "ENDEREÇO", "MUNICÍPIO", "POSTE", "Barramento", "LATITUDE", "LONGITUDE", "FIXAÇÃO", "CORDOALHA", "ÂNGULO", "RESULTANTE"],
    ["COMPARTILHADO", 1, "Rua Exemplo, 100", "Salvador", "DT 400/12", "PST-01234", "-12,974512°", "-38,476300°", "Ancoragem", "Sim", "33°", "16 Kgf"],
    ["NOVO", 2, "Rua Exemplo, 120", "Salvador", "CIRC 1000/12", "ILEGÍVEL", "-12,974880°", "-38,476010°", "Passagem", "Não", "128°", "0 Kgf"],
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws["!cols"] = [
    { wch: 14 }, { wch: 8 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, "Postes")
  XLSX.writeFile(wb, "modelo-planilha-de-postes.xlsx")
}
