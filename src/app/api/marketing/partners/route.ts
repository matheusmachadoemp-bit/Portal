import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { findPartnersWithTotals } from "@/lib/marketing-partners";

/**
 * Marketing > Parcerias. `quantidadeUtilizada`/`vendas`/`gasto` não são mais
 * colunas fixas de MarketingPartner — cada parceiro tem 0+ lançamentos
 * (MarketingPartnerEntry, com data própria) e os números aqui devolvidos são
 * a SOMA dos lançamentos dentro do período pedido (ver
 * prisma/migrations/20260915140000_marketing_partner_entries). Criar/editar
 * um lançamento é em /api/marketing/partners/[id]/entries.
 *
 * Filtro de período: mesmo padrão (`key`/`from`/`to`) de
 * src/app/api/marketing/redes-sociais/route.ts e do <PeriodFilterBar> — sem
 * `key` cai no default "mes-atual" (mesmo período que
 * src/app/portal/marketing/parcerias/page.tsx usa na carga inicial).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Marketing." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") ?? "mes-atual") as RollingPeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const dateFilter = resolveRollingPeriod(key, { from, to });

  const partners = await findPartnersWithTotals(empresaIdsForContext(ctx), dateFilter);

  return NextResponse.json({ partners });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "marketing", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar parceiros." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível criar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.nome || !String(body.nome).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }
  if (!body.cupom || !String(body.cupom).trim()) {
    return NextResponse.json({ error: "Cupom é obrigatório." }, { status: 400 });
  }

  // Unicidade de cupom é por loja, não global: a mesma loja não pode ter
  // duas parcerias com o cupom idêntico (venda ficaria ambígua na hora de
  // atribuir), mas lojas diferentes podem repetir o código entre si (times
  // e redes sociais separados). Comparação case-insensitive mesmo o client
  // já forçando maiúsculas (partners-client.tsx), pra não abrir brecha pra
  // quem enviar direto pela API.
  const cupomTrim = String(body.cupom).trim();
  const existingCupom = await prisma.marketingPartner.findFirst({
    where: { empresaId: empresa.id, cupom: { equals: cupomTrim, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingCupom) {
    return NextResponse.json({ error: "Já existe uma parceria com este cupom nesta loja." }, { status: 400 });
  }

  const partner = await prisma.marketingPartner.create({
    data: {
      empresaId: empresa.id,
      nome: body.nome,
      cupom: body.cupom,
      observacoes: body.observacoes || null,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "MarketingPartner",
      entityId: partner.id,
      after: partner.nome,
    },
  });

  return NextResponse.json({ partner });
}
