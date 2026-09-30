import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MovimentacoesClient } from "./movimentacoes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function MovimentacoesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageEstoque = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageEstoque;

  const [movements, ingredients, transfers, empresas] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { ingredient: { select: { id: true, name: true, unidade: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    // Transferências entre lojas (model `Transfer`/`TransferItem`, reaproveitado da extinta tela
    // /portal/estoque/transferencias — ver seed.ts e migration de remoção da subcategoria):
    // aparecem/são gerenciadas aqui dentro de Movimentações. Mesmo filtro OR de sempre (loja ativa
    // é origem OU destino), pra quem recebe também ver a transferência chegando.
    prisma.transfer.findMany({
      where: { OR: [{ origemEmpresaId: { in: empresaIds } }, { destinoEmpresaId: { in: empresaIds } }] },
      orderBy: { createdAt: "desc" },
      include: {
        origemEmpresa: { select: { id: true, name: true } },
        destinoEmpresa: { select: { id: true, name: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unidade: true } } } },
      },
    }),
    // Lista completa de lojas ativas, pra oferecer como opção de "loja de destino" ao solicitar
    // uma transferência (igual à extinta tela de Transferências) — não é escopada por empresaIds
    // porque a loja de destino é, por definição, diferente da(s) loja(s) do contexto ativo.
    prisma.empresa.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  const serializedMovements = movements.map((m) => ({
    id: m.id,
    ingredientId: m.ingredientId,
    ingredientName: m.ingredient.name,
    unidade: m.ingredient.unidade,
    type: m.type,
    quantidade: m.quantidade,
    estoqueApos: m.estoqueApos,
    motivo: m.motivo,
    createdByName: m.createdBy.name,
    createdAt: m.createdAt.toISOString(),
  }));

  const serializedIngredients = ingredients.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade, estoqueAtual: i.estoqueAtual }));

  const serializedTransfers = transfers.map((t) => ({
    id: t.id,
    status: t.status,
    origemNome: t.origemEmpresa.name,
    destinoNome: t.destinoEmpresa.name,
    origemEmpresaId: t.origemEmpresaId,
    destinoEmpresaId: t.destinoEmpresaId,
    responsavelEnvio: t.responsavelEnvio,
    responsavelRecebimento: t.responsavelRecebimento,
    dataEnvio: t.dataEnvio ? t.dataEnvio.toISOString() : null,
    dataRecebimento: t.dataRecebimento ? t.dataRecebimento.toISOString() : null,
    observacao: t.observacao,
    createdAt: t.createdAt.toISOString(),
    items: t.items.map((it) => ({
      id: it.id,
      ingredientName: it.ingredient.name,
      unidade: it.unidade,
      quantidadeEnviada: it.quantidadeEnviada,
      quantidadeRecebida: it.quantidadeRecebida,
    })),
  }));

  return (
    <PageContainer title="Estoque" subtitle="Movimentações">
      <div className="space-y-6">
        <MovimentacoesClient
          initialMovements={serializedMovements}
          ingredients={serializedIngredients}
          canCreate={canCreate}
          isGrupoNordMode={ctx?.mode !== "single"}
          initialTransfers={serializedTransfers}
          empresas={empresas.map((e) => ({ id: e.id, name: e.name }))}
          currentEmpresaId={ctx?.mode === "single" ? ctx.empresa.id : ""}
        />
      </div>
    </PageContainer>
  );
}
