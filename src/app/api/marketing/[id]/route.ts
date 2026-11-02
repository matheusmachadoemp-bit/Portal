import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar dados de marketing." },
      { status: 403 }
    );
  }
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

  // Edição manual de investimento/receita marca o lançamento como MANUAL,
  // pra `syncMarketingEntryFromMetaAds` (src/lib/meta-ads-sync.ts) parar de
  // sobrescrever esses dois campos no próximo sync do Meta Ads (achado
  // #173 — antes, a correção manual "sumia" no cron do dia seguinte).
  //
  // Importante: compara o valor FINAL já calculado em `data` (não só a
  // presença da chave no body) contra o valor atual do registro. O
  // formulário da tela (`openEdit` em trafego-pago-client.tsx) sempre
  // pré-popula e reenvia todos os campos no PATCH, mesmo quando o gestor só
  // editou "Observações" ou outro campo qualquer — checar só `!== undefined`
  // marcaria MANUAL (e congelaria investimento/receita pra sempre) em
  // qualquer edição, mesmo sem o gestor ter tocado nesses dois campos
  // (achado do Teulis na revisão).
  const investimentoMudou = data.investimentoTrafego !== undefined && data.investimentoTrafego !== existing.investimentoTrafego;
  const receitaMudou = data.receitaTrafego !== undefined && data.receitaTrafego !== existing.receitaTrafego;
  if (investimentoMudou || receitaMudou) {
    data.source = "MANUAL";
  }

  const entry = await prisma.marketingEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.marketingEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "marketing", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir dados de marketing." },
      { status: 403 }
    );
  }
  await prisma.marketingEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
