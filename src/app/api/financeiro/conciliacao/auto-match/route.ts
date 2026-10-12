import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { autoMatchBankTransactions } from "@/lib/bank-reconciliation";
import { hasModulePermission } from "@/lib/authz";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite conciliar lançamentos bancários." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível conciliar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const bankAccountId = body?.bankAccountId as string | undefined;

  const pending = await prisma.bankTransaction.count({
    where: { empresaId: empresa.id, status: "PENDENTE", ...(bankAccountId ? { bankAccountId } : {}) },
  });
  const matched = await autoMatchBankTransactions(empresa.id, bankAccountId);

  return NextResponse.json({ matched, pending });
}
