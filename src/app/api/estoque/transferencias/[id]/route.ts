import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const NEXT_STATUS_MOVEMENT = new Set(["ENVIADA", "RECEBIDA"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.transfer.findUnique({
    where: { id },
    include: { items: { include: { ingredient: true } }, origemEmpresa: true, destinoEmpresa: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });

  const [temAcessoOrigem, temAcessoDestino] = await Promise.all([
    assertEmpresaAccess(session.user.id, session.user.role, existing.origemEmpresaId),
    assertEmpresaAccess(session.user.id, session.user.role, existing.destinoEmpresaId),
  ]);
  if (!temAcessoOrigem && !temAcessoDestino) {
    return NextResponse.json({ error: "Sem acesso a essa transferência." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar transferências entre lojas." },
      { status: 403 }
    );
  }

  const novoStatus = body.status as string | undefined;
  const disparaSaida = novoStatus === "ENVIADA" && existing.status !== "ENVIADA" && !NEXT_STATUS_MOVEMENT.has(existing.status);
  if (disparaSaida && !temAcessoOrigem) {
    return NextResponse.json({ error: "Apenas a loja de origem pode enviar esta transferência." }, { status: 403 });
  }
  if (novoStatus === "RECEBIDA" && !temAcessoDestino) {
    return NextResponse.json({ error: "Apenas a loja de destino pode confirmar o recebimento desta transferência." }, { status: 403 });
  }

  // Antes disso, cada item da transferência virava 2-3 operações (create do
  // movimento, update do estoque do ingrediente, update da quantidade
  // recebida) empilhadas num único array passado pra `prisma.$transaction(ops)`
  // — a API de "sequential operations" do Prisma, que roda cada operação uma
  // atrás da outra dentro de uma transação interativa com timeout padrão de
  // 5s. Uma transferência pode incluir um número grande de ingredientes (até
  // o catálogo inteiro da loja), e isso derrubaria a operação inteira sem
  // nada aplicado (mesmo bug encontrado e corrigido em
  // `syncEmpresaSaiposSales`, ver `src/lib/saipos-sync.ts`). Agora o número
  // de operações dentro da transação é constante (no máximo 3), não importa
  // quantos itens a transferência tenha.
  const ops = [];

  if (disparaSaida && existing.items.length > 0) {
    const ingredientIds = existing.items.map((item) => item.ingredientId);
    const novosEstoques = existing.items.map((item) => Math.max(0, item.ingredient.estoqueAtual - item.quantidadeEnviada));

    ops.push(
      prisma.stockMovement.createMany({
        data: existing.items.map((item, idx) => ({
          ingredientId: item.ingredientId,
          empresaId: existing.origemEmpresaId,
          type: "TRANSFERENCIA",
          quantidade: item.quantidadeEnviada,
          estoqueApos: novosEstoques[idx],
          motivo: `Transferência enviada para ${existing.destinoEmpresa.name}`,
          origin: "TRANSFERENCIA_ENVIADA",
          destino: existing.destinoEmpresa.name,
          autorizadoPor: body.responsavelEnvio || session.user.name || null,
          createdById: session.user.id,
        })),
      }),
      prisma.$executeRaw`
        UPDATE "Ingredient" AS ing
        SET "estoqueAtual" = v.estoque_atual
        FROM UNNEST(${ingredientIds}::text[], ${novosEstoques}::float8[]) AS v(ingredient_id, estoque_atual)
        WHERE ing."id" = v.ingredient_id
      `
    );
  }

  if (novoStatus === "RECEBIDA" && Array.isArray(body.quantidadesRecebidas) && body.quantidadesRecebidas.length > 0) {
    const recebidas = body.quantidadesRecebidas as { itemId: string; quantidade: number }[];
    const itemIds = recebidas.map((q) => q.itemId);
    const quantidades = recebidas.map((q) => Number(q.quantidade) || 0);

    ops.push(prisma.$executeRaw`
      UPDATE "TransferItem" AS ti
      SET "quantidadeRecebida" = v.quantidade
      FROM UNNEST(${itemIds}::text[], ${quantidades}::float8[]) AS v(item_id, quantidade)
      WHERE ti."id" = v.item_id
    `);
  }

  ops.push(
    prisma.transfer.update({
      where: { id },
      data: {
        status: (novoStatus ?? undefined) as never,
        responsavelRecebimento: body.responsavelRecebimento ?? undefined,
        dataEnvio: novoStatus === "ENVIADA" ? new Date() : undefined,
        dataRecebimento: novoStatus === "RECEBIDA" ? new Date() : undefined,
        observacao: body.observacao !== undefined ? body.observacao || null : undefined,
      },
    })
  );

  const results = await prisma.$transaction(ops);
  const transfer = results[results.length - 1];

  return NextResponse.json({ transfer });
}
