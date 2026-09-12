import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "producao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Produção." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para ver as configurações." }, { status: 400 });
  }

  const [settings, weights] = await Promise.all([
    prisma.productionSettings.upsert({
      where: { empresaId: empresa.id },
      update: {},
      create: { empresaId: empresa.id },
    }),
    prisma.productionWeekdayWeight.findMany({ where: { empresaId: empresa.id }, orderBy: { weekday: "asc" } }),
  ]);

  return NextResponse.json({ settings, weights });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar as configurações de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações de produção." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar as configurações." }, { status: 400 });
  }

  const body = await req.json();
  const weights: { weekday: number; percent: number }[] = Array.isArray(body.weights) ? body.weights : [];

  if (weights.length > 0) {
    const soma = weights.reduce((acc, w) => acc + Number(w.percent), 0);
    if (Math.abs(soma - 100) > 0.5) {
      return NextResponse.json({ error: `Os pesos por dia da semana precisam somar 100% (soma atual: ${soma.toFixed(1)}%).` }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (body.semanasParaMedia !== undefined || body.toleranciaAlertaPct !== undefined) {
      await tx.productionSettings.upsert({
        where: { empresaId: empresa.id },
        update: {
          semanasParaMedia: body.semanasParaMedia !== undefined ? Number(body.semanasParaMedia) : undefined,
          toleranciaAlertaPct: body.toleranciaAlertaPct !== undefined ? Number(body.toleranciaAlertaPct) : undefined,
        },
        create: {
          empresaId: empresa.id,
          semanasParaMedia: body.semanasParaMedia !== undefined ? Number(body.semanasParaMedia) : undefined,
          toleranciaAlertaPct: body.toleranciaAlertaPct !== undefined ? Number(body.toleranciaAlertaPct) : undefined,
        },
      });
    }
    for (const w of weights) {
      await tx.productionWeekdayWeight.upsert({
        where: { empresaId_weekday: { empresaId: empresa.id, weekday: w.weekday } },
        update: { percent: Number(w.percent) },
        create: { empresaId: empresa.id, weekday: w.weekday, percent: Number(w.percent) },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
