import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const plans = await prisma.actionPlan.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    // Teto de segurança: sem `take`, esta lista crescia sem fim conforme o histórico de planos de
    // ação acumula (mesma categoria de risco já tratada em Compras/Perdas/Movimentações/Contagens,
    // `src/app/api/estoque/{compras,perdas,movimentos,contagens}/route.ts`). 300 segue o valor já
    // usado em Compras (caminho sem filtro de período) e Perdas — bem acima do volume real
    // esperado (plano de ação é criado manualmente, um por vez, nunca em massa), então não corta
    // dado de uso normal.
    take: 300,
    include: { empresa: { select: { name: true, color: true } }, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ plans });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar planos de ação." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar um plano de ação." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.problema || !body.acaoCorretiva) {
    return NextResponse.json({ error: "Descreva o problema e a ação corretiva." }, { status: 400 });
  }

  const plan = await prisma.actionPlan.create({
    data: {
      empresaId: empresa.id,
      problema: body.problema,
      causaProvavel: body.causaProvavel || null,
      acaoCorretiva: body.acaoCorretiva,
      responsavel: body.responsavel || null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      status: body.status || "PENDENTE",
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ plan });
}
