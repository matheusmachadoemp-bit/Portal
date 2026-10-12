import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { parseBankStatement, StatementFormatError, type ParsedStatement } from "@/lib/bank-statement";
import { pairTransactions, toCents } from "@/lib/bank-sync";
import { spDateKey } from "@/lib/timezone";

// A leitura do arquivo (descobrir o formato, a codificação, o separador, a linha do cabeçalho, o
// papel de cada coluna, datas e valores) vive em `@/lib/bank-statement` — aqui só autoriza, valida
// a conta bancária e grava. Datas ficam ancoradas em meia-noite de SÃO PAULO (ver `parseDateCell`
// e o comentário histórico em rh/employees/import/route.ts): a tela de conciliação formata com
// `format(new Date(t.date), "dd/MM/yyyy")` no fuso local do navegador.

// Teto de tamanho do arquivo (um extrato mensal, mesmo em PDF, tem poucos MB) e de tempo da rota.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite importar extratos bancários." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível importar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Não foi possível receber o arquivo (talvez seja grande demais). Tente um arquivo menor." },
      { status: 400 }
    );
  }
  const file = formData.get("file");
  const bankAccountId = formData.get("bankAccountId") as string | null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Arquivo grande demais (máximo 8 MB). Importe um período menor ou baixe o extrato em OFX." },
      { status: 413 }
    );
  }
  if (!bankAccountId) return NextResponse.json({ error: "Selecione a conta bancária do extrato." }, { status: 400 });

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, empresaId: empresa.id },
  });
  if (!bankAccount) return NextResponse.json({ error: "Conta bancária inválida." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let statement: ParsedStatement;
  try {
    statement = await parseBankStatement(buffer);
  } catch (err) {
    if (err instanceof StatementFormatError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[conciliacao/import] erro inesperado ao ler o extrato:", err);
    return NextResponse.json({ error: "Não foi possível ler este arquivo." }, { status: 500 });
  }

  const { transactions: parsedRows, errors } = statement;
  if (parsedRows.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma linha válida encontrada no arquivo.", errors, detected: statement.detected },
      { status: 400 }
    );
  }

  // Faixa do arquivo (dias de São Paulo): a tela ajusta o filtro de período para mostrar o que entrou.
  const dayKeys = parsedRows.map((r) => spDateKey(r.date)).sort();
  const firstDate = dayKeys[0];
  const lastDate = dayKeys[dayKeys.length - 1];

  // Conta ligada à conexão com o banco: o que o banco já trouxe (mesmo dia, sentido e valor) não é
  // importado de novo — senão a movimentação apareceria duas vezes e os totais dobrariam.
  let rowsToImport = parsedRows;
  let skippedCovered = 0;
  if (bankAccount.openFinanceAccountId) {
    const dayMs = 24 * 60 * 60 * 1000;
    const times = parsedRows.map((r) => r.date.getTime());
    const bankRows = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId,
        externalId: { not: null },
        date: { gte: new Date(Math.min(...times) - dayMs), lte: new Date(Math.max(...times) + dayMs) },
      },
      select: { date: true, direction: true, valor: true, descricao: true, counterpart: true },
    });
    if (bankRows.length > 0) {
      const pairs = pairTransactions(
        parsedRows.map((r, i) => ({
          dateKey: spDateKey(r.date),
          direction: r.direction,
          cents: toCents(r.valor),
          text: r.descricao,
          order: i,
        })),
        bankRows.map((b, i) => ({
          dateKey: spDateKey(b.date),
          direction: b.direction,
          cents: toCents(b.valor),
          text: `${b.counterpart ?? ""} ${b.descricao}`,
          order: i,
        }))
      );
      const covered = new Set(pairs.map((p) => p.left));
      skippedCovered = covered.size;
      rowsToImport = parsedRows.filter((_, i) => !covered.has(i));
    }
  }

  if (rowsToImport.length === 0) {
    return NextResponse.json({
      import: null,
      imported: 0,
      skippedCovered,
      firstDate,
      lastDate,
      errors,
      format: statement.format,
      detected: statement.detected,
      ignored: statement.ignored,
      ignoredSamples: statement.ignoredSamples,
      balanceCheck: statement.balanceCheck,
      totalsCheck: statement.totalsCheck,
      totalEntradas: 0,
      totalSaidas: 0,
    });
  }

  const totalEntradas = rowsToImport.filter((r) => r.direction === "ENTRADA").reduce((s, r) => s + r.valor, 0);
  const totalSaidas = rowsToImport.filter((r) => r.direction === "SAIDA").reduce((s, r) => s + r.valor, 0);

  const result = await prisma.bankReconciliationImport.create({
    data: {
      empresaId: empresa.id,
      bankAccountId,
      fileName: file.name,
      totalEntradas,
      totalSaidas,
      totalLinhas: rowsToImport.length,
      createdById: session.user.id,
      transactions: {
        create: rowsToImport.map((r) => ({
          empresaId: empresa.id,
          bankAccountId,
          date: r.date,
          descricao: r.descricao,
          direction: r.direction,
          valor: r.valor,
        })),
      },
    },
  });

  return NextResponse.json({
    import: result,
    imported: rowsToImport.length,
    skippedCovered,
    firstDate,
    lastDate,
    errors,
    format: statement.format,
    detected: statement.detected,
    ignored: statement.ignored,
    ignoredSamples: statement.ignoredSamples,
    balanceCheck: statement.balanceCheck,
    totalsCheck: statement.totalsCheck,
    totalEntradas,
    totalSaidas,
  });
}
