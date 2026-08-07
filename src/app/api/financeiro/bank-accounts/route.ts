import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accounts = await prisma.bankAccount.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const account = await prisma.bankAccount.create({
    data: {
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
