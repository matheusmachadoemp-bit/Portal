import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const accounts = await prisma.bankAccount.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const account = await prisma.bankAccount.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      bank: body.bank || null,
      agencia: body.agencia || null,
      conta: body.conta || null,
      tipo: body.tipo || "Conta Corrente",
      saldoInicial: Number(body.saldoInicial) || 0,
      saldoAtual: Number(body.saldoInicial) || 0,
      color: body.color || "#2952E3",
      icon: body.icon || "Landmark",
    },
  });

  return NextResponse.json({ account });
}
