import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const before = await prisma.salesEntry.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, before.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "vendas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar lançamentos de vendas." },
      { status: 403 }
    );
  }

  // Campos que `syncSalesEntriesFromSaipos` (src/lib/saipos-sync.ts) recalcula/sobrescreve a
  // cada sincronização — os mesmos que precisam marcar o lançamento como MANUAL quando
  // corrigidos à mão, para não serem silenciosamente perdidos na próxima sincronização
  // (achado da Nina — mesmo padrão já usado em `PATCH /api/marketing/[id]` para
  // investimento/receita de Tráfego Pago).
  const SAIPOS_SYNCED_FIELDS = [
    "faturamentoDelivery",
    "faturamentoSalao",
    "pedidosDelivery",
    "pedidosBalcao",
    "pedidosSalao",
  ] as const;

  const data: Record<string, unknown> = {
    date: body.date ? new Date(body.date) : undefined,
    periodType: body.periodType ?? undefined,
    faturamentoDelivery: body.faturamentoDelivery !== undefined ? Number(body.faturamentoDelivery) : undefined,
    faturamentoSalao: body.faturamentoSalao !== undefined ? Number(body.faturamentoSalao) : undefined,
    pedidosDelivery: body.pedidosDelivery !== undefined ? Number(body.pedidosDelivery) : undefined,
    pedidosBalcao: body.pedidosBalcao !== undefined ? Number(body.pedidosBalcao) : undefined,
    pedidosSalao: body.pedidosSalao !== undefined ? Number(body.pedidosSalao) : undefined,
    mesasAtendidas: body.mesasAtendidas !== undefined ? Number(body.mesasAtendidas) : undefined,
    taxaServicoValor: body.taxaServicoValor !== undefined ? Number(body.taxaServicoValor) : undefined,
    metaDiaria: body.metaDiaria !== undefined ? Number(body.metaDiaria) : undefined,
    observacoes: body.observacoes ?? undefined,
  };

  // Compara o valor FINAL já calculado em `data` (não só a presença da chave no body) contra o
  // valor atual do registro — mesmo cuidado de `PATCH /api/marketing/[id]`: o formulário da
  // tela normalmente reenvia todos os campos, mesmo quando o gestor só editou "Observações" ou
  // outro campo qualquer; checar só `!== undefined` marcaria MANUAL (e passaria a bloquear a
  // sincronização automática) mesmo sem nenhum campo financeiro ter sido de fato alterado.
  const algumCampoSincronizadoMudou = SAIPOS_SYNCED_FIELDS.some(
    (f) => data[f] !== undefined && data[f] !== before[f]
  );
  if (algumCampoSincronizadoMudou) {
    data.source = "MANUAL";
  }

  const entry = await prisma.salesEntry.update({
    where: { id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: before.empresaId,
      action: "UPDATE",
      entityType: "SalesEntry",
      entityId: id,
      before: JSON.stringify(before),
      after: JSON.stringify(entry),
    },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const before = await prisma.salesEntry.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, before.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "vendas", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir lançamentos de vendas." },
      { status: 403 }
    );
  }

  await prisma.salesEntry.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      empresaId: before.empresaId,
      action: "DELETE",
      entityType: "SalesEntry",
      entityId: id,
      before: JSON.stringify(before),
    },
  });

  return NextResponse.json({ ok: true });
}
