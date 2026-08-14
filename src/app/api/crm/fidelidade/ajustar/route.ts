import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const body = await req.json();
  const cliente = await prisma.cliente.findFirst({
    where: { id: body.clienteId, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const tipo: "GANHO" | "RESGATE" = body.tipo === "RESGATE" ? "RESGATE" : "GANHO";
  const pontos = Number(body.pontos) || 0;
  const cashback = Number(body.cashback) || 0;
  const sinal = tipo === "GANHO" ? 1 : -1;

  const account = await prisma.loyaltyAccount.upsert({
    where: { clienteId: cliente.id },
    update: { pontos: { increment: pontos * sinal }, cashback: { increment: cashback * sinal } },
    create: { empresaId: cliente.empresaId, clienteId: cliente.id, pontos: pontos * sinal, cashback: cashback * sinal },
  });

  await prisma.loyaltyTransaction.create({
    data: { accountId: account.id, tipo, pontos, cashback, descricao: body.descricao ?? null },
  });

  return NextResponse.json({ account });
}
