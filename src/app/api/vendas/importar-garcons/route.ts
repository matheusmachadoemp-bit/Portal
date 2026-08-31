import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import * as XLSX from "xlsx";
import type { ProductCategory } from "@prisma/client";

const INSERT_CHUNK_SIZE = 1000;

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function parseBrDate(raw: string): Date | null {
  const s = raw.trim();
  const br = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (br) return new Date(Date.UTC(Number(br[1]), Number(br[2]) - 1, Number(br[3])));
  const br2 = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (br2) {
    const year = br2[3].length === 2 ? Number(`20${br2[3]}`) : Number(br2[3]);
    return new Date(Date.UTC(year, Number(br2[2]) - 1, Number(br2[1])));
  }
  return null;
}

function mapCategoria(raw: string): ProductCategory | null {
  const c = normalizeText(raw);
  const isDoce = c.includes("doce");
  if (c.includes("bebida")) return "BEBIDA";
  if (c.includes("drink")) return "DRINK";
  if (c.includes("sobremesa")) return "SOBREMESA";
  if (c.includes("combo")) return "COMBO";
  if (c.includes("burger")) return "BURGER";
  if (c.includes("acompanhamento")) return "ACOMPANHAMENTO";
  if (c.includes("esfiha")) return isDoce ? "ESFIHA_DOCE" : "ESFIHA_SALGADA";
  if (c.includes("pizza")) return isDoce ? "PIZZA_DOCE" : "PIZZA_SALGADA";
  return null;
}

function rowsFromWorkbook(buffer: Buffer): (string | number)[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: "" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível importar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const periodFromRaw = formData.get("periodFrom") as string | null;
  const periodToRaw = formData.get("periodTo") as string | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const periodFrom = periodFromRaw ? parseBrDate(periodFromRaw) : null;
  const periodTo = periodToRaw ? parseBrDate(periodToRaw) : null;
  if (!periodFrom || !periodTo) {
    return NextResponse.json({ error: "Informe o período (data inicial e final) que o relatório cobre." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: (string | number)[][];
  try {
    rows = rowsFromWorkbook(buffer);
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo. Confira se é um .xlsx válido." }, { status: 400 });
  }

  if (rows.length < 2) {
    return NextResponse.json({ error: "Arquivo vazio ou sem linhas de dados." }, { status: 400 });
  }

  const header = rows[0].map((h) => normalizeText(String(h)));
  const idx = {
    garcom: header.indexOf("garcom"),
    categoria: header.indexOf("categoria"),
    item: header.indexOf("item"),
    quantidade: header.indexOf("quantidade"),
    valor: header.indexOf("valor_total"),
  };
  if (idx.garcom === -1 || idx.item === -1 || idx.valor === -1) {
    return NextResponse.json(
      {
        error:
          'Cabeçalho não reconhecido. Envie o relatório "Desempenho por garçom" exportado do Saipos (colunas LOJA, GARCOM, CATEGORIA, ITEM, QUANTIDADE, VALOR_TOTAL).',
      },
      { status: 400 }
    );
  }

  const dataRows = rows.slice(1).filter((r) => String(r[idx.garcom] ?? "").trim() !== "");
  if (dataRows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha encontrada no arquivo." }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({
    where: { empresaId: empresa.id },
    select: { id: true, name: true },
  });
  const employeeByName = new Map(employees.map((e) => [normalizeText(e.name), e.id]));

  const insertRows = dataRows.map((r) => {
    const garcomNome = String(r[idx.garcom]).trim();
    const categoriaRaw = idx.categoria !== -1 ? String(r[idx.categoria] ?? "") : "";
    return {
      id: randomUUID(),
      empresaId: empresa.id,
      employeeId: employeeByName.get(normalizeText(garcomNome)) ?? null,
      garcomNome,
      categoria: mapCategoria(categoriaRaw),
      item: String(r[idx.item]).trim(),
      quantidade: Number(r[idx.quantidade]) || 0,
      faturamento: Number(r[idx.valor]) || 0,
      periodFrom,
      periodTo,
    };
  });

  await prisma.importedGarcomItem.deleteMany({
    where: { empresaId: empresa.id, periodFrom, periodTo },
  });

  for (let i = 0; i < insertRows.length; i += INSERT_CHUNK_SIZE) {
    await prisma.importedGarcomItem.createMany({ data: insertRows.slice(i, i + INSERT_CHUNK_SIZE) });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "IMPORT",
      entityType: "ImportedGarcomItem",
      entityId: file.name,
      after: JSON.stringify({ fileName: file.name, itens: insertRows.length, periodFrom, periodTo }),
    },
  });

  const faturamentoTotal = insertRows.reduce((sum, r) => sum + r.faturamento, 0);
  const garcons = new Set(insertRows.map((r) => r.garcomNome));
  const semGarcomCadastrado = new Set(insertRows.filter((r) => !r.employeeId).map((r) => r.garcomNome));

  return NextResponse.json({
    itens: insertRows.length,
    faturamentoTotal,
    garcons: garcons.size,
    semGarcomCadastrado: [...semGarcomCadastrado],
  });
}
