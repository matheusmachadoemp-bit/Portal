import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import * as XLSX from "xlsx";
import type { SaleChannel } from "@prisma/client";

// Duas planilhas são aceitas:
// 1) O relatório "Vendas por período" exportado direto do Saipos (uma linha
//    por pedido/comanda) — é o formato real usado pelo usuário.
// 2) Uma planilha de resumo diário (uma linha por dia, com colunas de
//    faturamento/pedidos já somados) — útil para quem monta a planilha à mão.
const HEADER_ALIASES: Record<string, string> = {
  // Formato "Vendas por período" (Saipos)
  tipodopedido: "tipoPedido",
  canaldevenda: "canalVenda",
  datadavenda: "dataVenda",
  pagamento: "pagamento",
  estacancelado: "cancelado",
  bairro: "bairro",
  total: "totalVenda",
  totaltaxadeservico: "taxaServico",
  codigodaloja: "codigoLoja",
  nomedaloja: "nomeLoja",
  // Formato resumo diário
  data: "date",
  dia: "date",
  faturamentodelivery: "faturamentoDelivery",
  fatdelivery: "faturamentoDelivery",
  delivery: "faturamentoDelivery",
  faturamentosalao: "faturamentoSalao",
  fatsalao: "faturamentoSalao",
  salao: "faturamentoSalao",
  pedidosdelivery: "pedidosDelivery",
  pedidosbalcao: "pedidosBalcao",
  pedidossalao: "pedidosSalao",
  mesas: "mesasAtendidas",
  mesasatendidas: "mesasAtendidas",
  taxaservico: "taxaServicoValor",
  taxadeservico: "taxaServicoValor",
  metadiaria: "metaDiaria",
  meta: "metaDiaria",
  observacoes: "observacoes",
  obs: "observacoes",
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function mapTipoPedidoToChannel(tipo: string): SaleChannel {
  const t = normalizeText(tipo);
  if (t === "d") return "DELIVERY";
  if (t === "m" || t === "f") return "SALAO";
  return "BALCAO";
}

function parseDateFlexible(raw: string | number): Date | null {
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (br) {
    const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3]);
    return new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1])));
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

/** Extrai só a data (dia/mês/ano) de "Data da venda", ignorando a hora — usada para agrupar por dia. */
function parseOrderDate(raw: string | number): Date | null {
  if (typeof raw === "number") return parseDateFlexible(raw);
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (br) {
    const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3]);
    return new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1])));
  }
  return parseDateFlexible(raw);
}

function parseNumber(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const cleaned = String(raw ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const normalized =
    cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isNaN(value) ? 0 : value;
}

function rowsFromCsvText(text: string): string[][] {
  const delimiter = text.includes(";") ? ";" : ",";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

function rowsFromWorkbook(buffer: Buffer): (string | number)[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: "" });
}

type DayAggregate = {
  faturamentoDelivery: number;
  faturamentoSalao: number;
  pedidosDelivery: number;
  pedidosBalcao: number;
  pedidosSalao: number;
  mesasAtendidas: number;
  taxaServicoValor: number;
};

function emptyDay(): DayAggregate {
  return {
    faturamentoDelivery: 0,
    faturamentoSalao: 0,
    pedidosDelivery: 0,
    pedidosBalcao: 0,
    pedidosSalao: 0,
    mesasAtendidas: 0,
    taxaServicoValor: 0,
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível importar vendas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isSpreadsheet = /\.xlsx?$/i.test(file.name);

  let rows: (string | number)[][];
  try {
    rows = isSpreadsheet ? rowsFromWorkbook(buffer) : rowsFromCsvText(buffer.toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo. Confira se é um .xlsx ou .csv válido." }, { status: 400 });
  }

  if (rows.length < 2) {
    return NextResponse.json({ error: "Arquivo vazio ou sem linhas de dados." }, { status: 400 });
  }

  const headerRow = rows[0].map((h) => normalizeHeader(String(h)));
  const columnMap: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const mapped = HEADER_ALIASES[h];
    if (mapped && columnMap[mapped] === undefined) columnMap[mapped] = idx;
  });

  const isPerOrderFormat = columnMap.dataVenda !== undefined && columnMap.totalVenda !== undefined;
  const isDailySummaryFormat = !isPerOrderFormat && columnMap.date !== undefined;

  if (!isPerOrderFormat && !isDailySummaryFormat) {
    return NextResponse.json(
      {
        error:
          'Cabeçalho não reconhecido. Envie o relatório "Vendas por período" exportado do Saipos (colunas como "Tipo do pedido", "Data da venda", "Pagamento", "Total"...) ou uma planilha de resumo diário com uma coluna "Data" e colunas de faturamento/pedidos.',
      },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  const byDay = new Map<string, DayAggregate>();
  const empresaNameNormalized = normalizeText(empresa.name);
  const otherLojaNames = new Set<string>();
  let canceladosIgnorados = 0;
  let outraLojaIgnorados = 0;
  let linhasValidas = 0;

  function dayOf(date: Date): DayAggregate {
    const key = date.toISOString();
    const existing = byDay.get(key);
    if (existing) return existing;
    const created = emptyDay();
    byDay.set(key, created);
    return created;
  }

  if (isPerOrderFormat) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => String(c).trim() === "")) continue;

      const rawDate = row[columnMap.dataVenda];
      const date = parseOrderDate(rawDate);
      if (!date) {
        errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
        continue;
      }

      const cancelado = columnMap.cancelado !== undefined && normalizeText(String(row[columnMap.cancelado])) === "s";
      if (cancelado) {
        canceladosIgnorados++;
        continue;
      }

      const codigoLoja = columnMap.codigoLoja !== undefined ? String(row[columnMap.codigoLoja] ?? "").trim() : "";
      const nomeLoja = columnMap.nomeLoja !== undefined ? String(row[columnMap.nomeLoja] ?? "").trim() : "";
      if (codigoLoja || nomeLoja) {
        const pertenceAOutraLoja = empresa.saiposLojaId
          ? codigoLoja && codigoLoja !== empresa.saiposLojaId
          : nomeLoja && normalizeText(nomeLoja) !== empresaNameNormalized;
        if (pertenceAOutraLoja) {
          outraLojaIgnorados++;
          if (nomeLoja) otherLojaNames.add(nomeLoja);
          continue;
        }
      }

      const tipoPedido = columnMap.tipoPedido !== undefined ? String(row[columnMap.tipoPedido] ?? "") : "";
      const channel = mapTipoPedidoToChannel(tipoPedido);
      const valorTotal = parseNumber(row[columnMap.totalVenda]);
      const taxaServico = columnMap.taxaServico !== undefined ? parseNumber(row[columnMap.taxaServico]) : 0;

      const agg = dayOf(date);
      if (channel === "DELIVERY") {
        agg.faturamentoDelivery += valorTotal;
        agg.pedidosDelivery += 1;
      } else if (channel === "SALAO") {
        agg.faturamentoSalao += valorTotal;
        agg.pedidosSalao += 1;
        if (normalizeText(tipoPedido) === "m") agg.mesasAtendidas += 1;
      } else {
        agg.faturamentoSalao += valorTotal;
        agg.pedidosBalcao += 1;
      }
      agg.taxaServicoValor += taxaServico;
      linhasValidas++;
    }
  } else {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => String(c).trim() === "")) continue;

      const rawDate = row[columnMap.date];
      const date = parseDateFlexible(rawDate);
      if (!date) {
        errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
        continue;
      }

      const agg = dayOf(date);
      const get = (field: keyof DayAggregate) => {
        const idx = columnMap[field];
        return idx !== undefined ? parseNumber(row[idx]) : 0;
      };
      agg.faturamentoDelivery += get("faturamentoDelivery");
      agg.faturamentoSalao += get("faturamentoSalao");
      agg.pedidosDelivery += get("pedidosDelivery");
      agg.pedidosBalcao += get("pedidosBalcao");
      agg.pedidosSalao += get("pedidosSalao");
      agg.mesasAtendidas += get("mesasAtendidas");
      agg.taxaServicoValor += get("taxaServicoValor");
      linhasValidas++;
    }
  }

  if (byDay.size === 0) {
    return NextResponse.json(
      { error: "Nenhuma linha válida encontrada no arquivo.", errors },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;

  for (const [dayKey, agg] of byDay) {
    const day = new Date(dayKey);
    const data = {
      faturamentoDelivery: agg.faturamentoDelivery,
      faturamentoSalao: agg.faturamentoSalao,
      pedidosDelivery: agg.pedidosDelivery,
      pedidosBalcao: agg.pedidosBalcao,
      pedidosSalao: agg.pedidosSalao,
      mesasAtendidas: agg.mesasAtendidas,
      taxaServicoValor: agg.taxaServicoValor,
      source: "IMPORTADO" as const,
      createdById: session.user.id,
    };

    const existing = await prisma.salesEntry.findFirst({
      where: { empresaId: empresa.id, date: day, periodType: "DIARIO" },
      select: { id: true },
    });

    if (existing) {
      await prisma.salesEntry.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.salesEntry.create({ data: { empresaId: empresa.id, date: day, periodType: "DIARIO", ...data } });
      created += 1;
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "IMPORT",
      entityType: "SalesEntry",
      entityId: file.name,
      after: JSON.stringify({ fileName: file.name, created, updated, linhasValidas, errors: errors.length }),
    },
  });

  return NextResponse.json({
    created,
    updated,
    errors,
    canceladosIgnorados,
    outraLojaIgnorados,
    otherLojaNames: [...otherLojaNames],
  });
}
