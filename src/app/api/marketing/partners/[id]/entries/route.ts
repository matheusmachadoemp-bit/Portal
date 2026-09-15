import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

/**
 * Lançamentos por período de UM parceiro/influencer (Marketing > Parcerias
 * > MarketingPartnerEntry) — ex.: "em março, esse cupom gerou X vendas, foi
 * usado Y vezes e custou Z". GET lista (mais recente primeiro, com filtro
 * opcional de período via from/to); POST cria um lançamento novo. Editar ou
 * excluir um lançamento específico é em
 * /api/marketing/partners/[id]/entries/[entryId].
 *
 * Sem `requireActiveSingleEmpresa`/checagem de modo Grupo Nord aqui de
 * propósito: o parceiro já tem uma empresa fixa (não depende de qual loja
 * está ativa na tela) — o acesso é conferido via assertEmpresaAccess contra
 * a empresa do PRÓPRIO parceiro, igual PATCH/DELETE de
 * /api/marketing/partners/[id] já fazem.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Marketing." }, { status: 403 });
  }

  const { id } = await params;
  const partner = await prisma.marketingPartner.findUnique({ where: { id } });
  if (!partner) return NextResponse.json({ error: "Parceiro não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, partner.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dateFilter = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;

  const entries = await prisma.marketingPartnerEntry.findMany({
    where: { partnerId: id, ...(dateFilter ? { date: dateFilter } : {}) },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "marketing", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar dados de parceiros." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const partner = await prisma.marketingPartner.findUnique({ where: { id } });
  if (!partner) return NextResponse.json({ error: "Parceiro não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, partner.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.date) {
    return NextResponse.json({ error: "Informe a data do lançamento." }, { status: 400 });
  }

  const entry = await prisma.marketingPartnerEntry.create({
    data: {
      partnerId: id,
      date: new Date(body.date),
      quantidadeUtilizada: Number(body.quantidadeUtilizada) || 0,
      vendas: Number(body.vendas) || 0,
      gasto: Number(body.gasto) || 0,
      observacoes: body.observacoes || null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ entry });
}
