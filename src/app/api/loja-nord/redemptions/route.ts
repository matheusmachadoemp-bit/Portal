import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { criarResgate } from "@/lib/loja-nord-server";

/** Meus resgates (colaborador logado). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redemptions = await prisma.lojaNordRedemption.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      reward: { select: { nome: true, imagemUrl: true, categoria: true } },
      aprovadoPor: { select: { name: true } },
    },
  });

  return NextResponse.json({ redemptions });
}

/** Solicita o resgate de um brinde. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para resgatar." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rewardId = body?.rewardId;
  if (!rewardId || typeof rewardId !== "string") {
    return NextResponse.json({ error: "Brinde inválido." }, { status: 400 });
  }

  const result = await criarResgate({ userId: session.user.id, empresaId: empresa.id, rewardId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, redemptionId: result.redemptionId });
}
