import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { HistoricoContagensClient } from "./historico-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { ingredientCostPerUnit } from "@/lib/estoque";

export default async function HistoricoContagensPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const counts = await prisma.stockCount.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { dataContagem: "desc" },
    take: 100,
    include: {
      empresa: { select: { name: true, color: true } },
      items: { include: { ingredient: { select: { name: true, unidade: true, precoAtual: true, quantidadeEmbalagem: true } } } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <PageContainer title="Estoque" subtitle="Histórico de Contagens">
      <div className="space-y-6">
        <EstoqueTabs />
        <HistoricoContagensClient
          counts={counts.map((c) => {
            const valorDiferenca = c.items.reduce((sum, it) => {
              const custo = ingredientCostPerUnit(it.ingredient);
              const diff = (it.quantidadeContada ?? it.estoqueEsperado) - it.estoqueEsperado;
              return sum + diff * custo;
            }, 0);
            return {
              id: c.id,
              empresaNome: c.empresa.name,
              empresaCor: c.empresa.color,
              type: c.type,
              setor: c.setor,
              mes: c.mes,
              semana: c.semana,
              ano: c.ano,
              dataContagem: c.dataContagem.toISOString(),
              responsavel: c.responsavel,
              status: c.status,
              totalItens: c.items.length,
              divergencias: c.items.filter((i) => i.status === "DIVERGENCIA").length,
              valorDiferenca,
              aprovadoPor: c.aprovadoPor,
              aprovadoEm: c.aprovadoEm ? c.aprovadoEm.toISOString() : null,
              createdByName: c.createdBy.name,
              items: c.items.map((it) => ({
                nome: it.ingredient.name,
                unidade: it.ingredient.unidade,
                esperado: it.estoqueEsperado,
                contado: it.quantidadeContada,
                diferencaPercent: it.diferencaPercent,
                status: it.status,
                observacao: it.observacao,
                justificativa: it.justificativa,
              })),
            };
          })}
        />
      </div>
    </PageContainer>
  );
}
