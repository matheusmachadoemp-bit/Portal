import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { TransferenciasClient } from "./transferencias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function TransferenciasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [transfers, empresas, ingredients] = await Promise.all([
    prisma.transfer.findMany({
      where: { OR: [{ origemEmpresaId: { in: empresaIds } }, { destinoEmpresaId: { in: empresaIds } }] },
      orderBy: { createdAt: "desc" },
      include: {
        origemEmpresa: { select: { id: true, name: true, color: true } },
        destinoEmpresa: { select: { id: true, name: true, color: true } },
        items: { include: { ingredient: { select: { id: true, name: true, unidade: true } } } },
      },
    }),
    prisma.empresa.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    canCreate && ctx?.mode === "single"
      ? prisma.ingredient.findMany({ where: { empresaId: ctx.empresa.id, active: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <PageContainer title="Estoque" subtitle="Transferências entre Lojas">
      <div className="space-y-6">
        <EstoqueTabs />
        <TransferenciasClient
          initialTransfers={transfers.map((t) => ({
            id: t.id,
            status: t.status,
            origemNome: t.origemEmpresa.name,
            origemCor: t.origemEmpresa.color,
            destinoNome: t.destinoEmpresa.name,
            destinoCor: t.destinoEmpresa.color,
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
          }))}
          empresas={empresas.map((e) => ({ id: e.id, name: e.name }))}
          currentEmpresaId={ctx?.mode === "single" ? ctx.empresa.id : ""}
          ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
