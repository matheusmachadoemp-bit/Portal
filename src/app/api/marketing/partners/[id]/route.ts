import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// quantidadeUtilizada/vendas/gasto saíram daqui — não são mais colunas de
// MarketingPartner (viraram lançamentos, ver MarketingPartnerEntry). Editar
// um lançamento é em /api/marketing/partners/[id]/entries/[entryId]; este
// PATCH agora só edita o cadastro do parceiro (nome/cupom/observações).
const STR_FIELDS = ["nome", "cupom", "observacoes"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingPartner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar parceiros." },
      { status: 403 }
    );
  }
  const body = await req.json();

  // nome/cupom são String obrigatório no schema (diferente de observacoes,
  // que é opcional) — mesma validação do POST acima, senão um nome/cupom
  // limpo pro vazio vira `data.nome = null` e o Prisma lança erro de
  // validação (500 com corpo vazio) em vez de um 400 com mensagem clara.
  if (body.nome !== undefined && (!body.nome || !String(body.nome).trim())) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  if (body.cupom !== undefined && (!body.cupom || !String(body.cupom).trim())) {
    return NextResponse.json({ error: "Cupom é obrigatório." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const f of STR_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }

  const partner = await prisma.marketingPartner.update({ where: { id }, data });
  return NextResponse.json({ partner });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingPartner.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir parceiros." },
      { status: 403 }
    );
  }
  await prisma.marketingPartner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
