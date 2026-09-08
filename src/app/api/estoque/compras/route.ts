import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { logPurchaseEvent } from "@/lib/recebimento-server";
import { RECEBIMENTO_MANAGE_ROLES } from "@/lib/estoque";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const purchases = await prisma.purchase.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { data: "desc" },
    take: 300,
    include: {
      supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      items: { include: { ingredient: { select: { id: true, name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
      receiving: { select: { id: true, status: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ purchases });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não tem permissão para registrar pedidos de compra." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar pedidos de compra." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para registrar uma compra." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.supplierId || !Array.isArray(body.itens) || body.itens.length === 0) {
    return NextResponse.json({ error: "Informe o fornecedor e ao menos um item." }, { status: 400 });
  }

  if (body.enviarParaRecebimento && !body.responsavelRecebimentoId) {
    return NextResponse.json({ error: "Selecione o responsável pelo recebimento antes de enviar." }, { status: 400 });
  }

  const purchase = await prisma.purchase.create({
    data: {
      empresaId: empresa.id,
      supplierId: body.supplierId,
      numeroNota: body.numeroNota || null,
      data: body.data ? new Date(body.data) : new Date(),
      previsaoEntrega: body.previsaoEntrega ? new Date(body.previsaoEntrega) : null,
      responsavelRecebimentoId: body.responsavelRecebimentoId || null,
      recebimentoToken: body.enviarParaRecebimento ? randomBytes(16).toString("hex") : null,
      compradorResponsavel: body.compradorResponsavel || session.user.name || null,
      formaPagamento: body.formaPagamento || null,
      dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null,
      desconto: Number(body.desconto) || 0,
      frete: Number(body.frete) || 0,
      status: body.status || (body.enviarParaRecebimento ? "AGUARDANDO_ENTREGA" : "PEDIDO_REALIZADO"),
      observacoes: body.observacoes || null,
      createdById: session.user.id,
      items: {
        create: body.itens.map((it: { ingredientId: string; quantidade: number; unidade: string; valorUnitario: number }) => ({
          ingredientId: it.ingredientId,
          quantidade: Number(it.quantidade) || 0,
          unidade: it.unidade,
          valorUnitario: Number(it.valorUnitario) || 0,
          valorTotal: (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0),
        })),
      },
    },
    include: { items: true, supplier: true },
  });

  await logPurchaseEvent({
    purchaseId: purchase.id,
    empresaId: empresa.id,
    action: `Pedido criado por ${session.user.name ?? "usuário"}`,
    userId: session.user.id,
  });
  if (body.enviarParaRecebimento) {
    await logPurchaseEvent({
      purchaseId: purchase.id,
      empresaId: empresa.id,
      action: "Pedido enviado para recebimento",
      userId: session.user.id,
    });
  }

  return NextResponse.json({ purchase });
}
