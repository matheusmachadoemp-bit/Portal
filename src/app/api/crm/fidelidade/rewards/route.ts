import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) return NextResponse.json({ error: "Selecione uma loja específica." }, { status: 400 });

  const body = await req.json();
  if (!body.name || !body.pontosNecessarios) {
    return NextResponse.json({ error: "Nome e pontos necessários são obrigatórios." }, { status: 400 });
  }

  const reward = await prisma.loyaltyReward.create({
    data: {
      empresaId: empresa.id,
      name: String(body.name).trim(),
      pontosNecessarios: Number(body.pontosNecessarios),
      ativo: true,
    },
  });

  return NextResponse.json({ reward });
}
