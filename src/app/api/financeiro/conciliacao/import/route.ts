import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { parseBankStatement, StatementFormatError, type ParsedStatement } from "@/lib/bank-statement";

// A leitura do arquivo (descobrir o formato, a codificação, o separador, a linha do cabeçalho, o
// papel de cada coluna, datas e valores) vive em `@/lib/bank-statement` — aqui só autoriza, valida
// a conta bancária e grava. Datas ficam ancoradas em meia-noite de SÃO PAULO (ver `parseDateCell`
// e o comentário histórico em rh/employees/import/route.ts): a tela de conciliação formata com
// `format(new Date(t.date), "dd/MM/yyyy")` no fuso local do navegador.

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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const bankAccountId = formData.get("bankAccountId") as string | null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });
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
    return NextResponse.json({ error: "Não foi possível ler este arquivo." }, { status: 400 });
  }

  const { transactions: parsedRows, errors } = statement;
  if (parsedRows.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma linha válida encontrada no arquivo.", errors, detected: statement.detected },
      { status: 400 }
    );
  }

  const totalEntradas = parsedRows.filter((r) => r.direction === "ENTRADA").reduce((s, r) => s + r.valor, 0);
  const totalSaidas = parsedRows.filter((r) => r.direction === "SAIDA").reduce((s, r) => s + r.valor, 0);

  const result = await prisma.bankReconciliationImport.create({
    data: {
      empresaId: empresa.id,
      bankAccountId,
      fileName: file.name,
      totalEntradas,
      totalSaidas,
      totalLinhas: parsedRows.length,
      createdById: session.user.id,
      transactions: {
        create: parsedRows.map((r) => ({
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
    imported: parsedRows.length,
    errors,
    format: statement.format,
    detected: statement.detected,
    ignored: statement.ignored,
    totalEntradas,
    totalSaidas,
  });
}
