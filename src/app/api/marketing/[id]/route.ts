import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const numFields = [
    "investimentoTrafego",
    "receitaTrafego",
    "pedidosCampanha",
    "visitasSite",
    "conversoes",
    "seguidoresInicio",
    "seguidoresFim",
    "curtidas",
    "comentarios",
    "compartilhamentos",
    "salvamentos",
    "alcance",
    "impressoes",
  ] as const;

  const data: Record<string, unknown> = {};
  if (body.date) data.date = new Date(body.date);
  if (body.observacoes !== undefined) data.observacoes = body.observacoes;
  if (body.planoDeAcao !== undefined) data.planoDeAcao = body.planoDeAcao;
  for (const f of numFields) {
    if (body[f] !== undefined) data[f] = Number(body[f]) || 0;
  }

  const entry = await prisma.marketingEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.marketingEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
