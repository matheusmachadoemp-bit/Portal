import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { logPurchaseEvent, notifyReceivingCompleted, notifyReceivingDivergence } from "@/lib/recebimento-server";
import { RECEIVING_DIVERGENCE_LABEL } from "@/lib/estoque";

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
  const empresaIds = empresaIdsForContext(ctx);

  const [pendentes, recebimentos] = await Promise.all([
    prisma.purchase.findMany({
      where: { empresaId: { in: empresaIds }, status: { in: ["PEDIDO_REALIZADO", "AGUARDANDO_ENTREGA", "EM_CONFERENCIA", "RECEBIDO_PARCIAL"] } },
      orderBy: { data: "desc" },
      include: {
        supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unidade: true } } } },
        responsavelRecebimento: { select: { name: true } },
      },
    }),
    prisma.receiving.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dataHora: "desc" },
      take: 200,
      include: {
        purchase: {
          include: {
            supplier: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            items: { include: { ingredient: { select: { id: true, name: true, unidade: true } } } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({ pendentes, recebimentos });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.purchaseId) return NextResponse.json({ error: "Informe o pedido de compra." }, { status: 400 });

  const purchase = await prisma.purchase.findUnique({
    where: { id: body.purchaseId },
    include: { items: { include: { ingredient: true } }, supplier: true, receiving: true },
  });
  if (!purchase) return NextResponse.json({ error: "Pedido de compra não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, purchase.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  // Este POST sempre cria um Receiving novo para o pedido (a linha acima já barra o caso de já
  // existir um) — nunca atualiza um recebimento existente (isso é feito na tela de divergências).
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar recebimentos." },
      { status: 403 }
    );
  }
  if (purchase.receiving) return NextResponse.json({ error: "Este pedido já possui um recebimento registrado." }, { status: 400 });

  const status = body.status || "APROVADO";
  const houveDivergencia = ["APROVADO_RESSALVA", "RECEBIDO_PARCIAL", "RECUSADO", "AGUARDANDO_SOLUCAO"].includes(status);
  const gerarMovimentos = status === "APROVADO" || status === "APROVADO_RESSALVA" || status === "RECEBIDO_PARCIAL";

  const [receiving] = await prisma.$transaction([
    prisma.receiving.create({
      data: {
        purchaseId: purchase.id,
        empresaId: purchase.empresaId,
        responsavel: body.responsavel || session.user.name || null,
        status,
        divergencias: Array.isArray(body.divergencias) ? body.divergencias.join(",") : null,
        detalhes: body.detalhes ? JSON.stringify(body.detalhes) : null,
        fotoMercadoriaUrl: body.fotoMercadoriaUrl || null,
        fotoNotaUrl: body.fotoNotaUrl || null,
        observacao: body.observacao || null,
      },
    }),
    prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: status === "RECUSADO" ? "DIVERGENCIA" : status === "RECEBIDO_PARCIAL" ? "RECEBIDO_PARCIAL" : "RECEBIDO" },
    }),
    ...(gerarMovimentos
      ? purchase.items.flatMap((item) => {
          const quantidadeRecebida = body.quantidadesRecebidas?.[item.id] !== undefined ? Number(body.quantidadesRecebidas[item.id]) : item.quantidade;
          return [
            prisma.stockMovement.create({
              data: {
                ingredientId: item.ingredientId,
                empresaId: purchase.empresaId,
                type: "ENTRADA",
                quantidade: quantidadeRecebida,
                estoqueApos: item.ingredient.estoqueAtual + quantidadeRecebida,
                motivo: `Recebimento NF ${purchase.numeroNota ?? purchase.id.slice(0, 8)} — ${purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial}`,
                origin: "COMPRA",
                origem: purchase.supplier.nomeFantasia ?? purchase.supplier.razaoSocial,
                autorizadoPor: body.responsavel || session.user.name || null,
                createdById: session.user.id,
              },
            }),
            prisma.ingredient.update({
              where: { id: item.ingredientId },
              data: { estoqueAtual: { increment: quantidadeRecebida }, precoAtual: item.valorUnitario, lastPurchaseDate: new Date() },
            }),
          ];
        })
      : []),
  ]);

  await logPurchaseEvent({
    purchaseId: purchase.id,
    empresaId: purchase.empresaId,
    action: houveDivergencia ? "Recebimento finalizado com divergência" : "Recebimento finalizado",
    userId: session.user.id,
  });

  // Notifica gerente(s) da loja + quem criou o pedido do resultado do recebimento — mesmo
  // aviso que já existia (mas só era disparado) no fluxo do link público de recebimento.
  if (houveDivergencia) {
    const tipos = Array.isArray(body.divergencias)
      ? body.divergencias.map((key: string) => RECEIVING_DIVERGENCE_LABEL[key] ?? key)
      : [];
    await notifyReceivingDivergence(purchase, {
      totalItens: purchase.items.length,
      divergencias: null,
      impactoFinanceiro: null,
      tipos,
    });
    await logPurchaseEvent({
      purchaseId: purchase.id,
      empresaId: purchase.empresaId,
      action: "Gerente notificado sobre divergência",
      userId: session.user.id,
    });
  } else {
    await notifyReceivingCompleted(purchase, { totalItens: purchase.items.length });
    await logPurchaseEvent({
      purchaseId: purchase.id,
      empresaId: purchase.empresaId,
      action: "Gerente notificado sobre recebimento concluído",
      userId: session.user.id,
    });
  }

  return NextResponse.json({ receiving, houveDivergencia });
}
