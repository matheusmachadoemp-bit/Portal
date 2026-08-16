import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { RelatoriosClient } from "./relatorios-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { ingredientCostPerUnit } from "@/lib/estoque";
import { subDays } from "date-fns";

export default async function RelatoriosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const since30 = subDays(now, 30);
  const vencimentoLimite = subDays(now, -7);

  const [ingredients, categories, losses, purchases, movements, transfers, plans] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, include: { category: true }, orderBy: { name: "asc" } }),
    prisma.stockCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.loss.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { data: "desc" }, take: 500, include: { ingredient: true } }),
    prisma.purchase.findMany({ where: { empresaId: { in: empresaIds } }, include: { supplier: true, items: true }, orderBy: { data: "desc" }, take: 500 }),
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { ingredient: { select: { name: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.transfer.findMany({
      where: { OR: [{ origemEmpresaId: { in: empresaIds } }, { destinoEmpresaId: { in: empresaIds } }] },
      include: { origemEmpresa: true, destinoEmpresa: true, items: { include: { ingredient: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.actionPlan.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { createdAt: "desc" } }),
  ]);

  const movimentadosDesde = new Set(movements.filter((m) => m.createdAt >= since30).map((m) => m.ingredientId));

  const posicaoEstoque = ingredients.map((i) => ({
    Código: i.codigoInterno ?? "",
    Produto: i.name,
    Categoria: i.category?.name ?? "",
    "Estoque atual": i.estoqueAtual,
    Unidade: i.unidade,
    "Custo unitário": ingredientCostPerUnit(i),
    "Valor em estoque": i.estoqueAtual * ingredientCostPerUnit(i),
  }));

  const valorPorCategoria = categories
    .map((c) => {
      const itens = ingredients.filter((i) => i.categoryId === c.id);
      const valor = itens.reduce((s, i) => s + i.estoqueAtual * ingredientCostPerUnit(i), 0);
      return { Categoria: c.name, "Nº produtos": itens.length, "Valor em estoque": Math.round(valor * 100) / 100 };
    })
    .filter((c) => c["Nº produtos"] > 0);

  const perdasReport = losses.map((l) => ({
    Data: l.data.toISOString().slice(0, 10),
    Produto: l.ingredient.name,
    Setor: l.setor ?? "",
    Quantidade: l.quantidade,
    Motivo: l.motivo,
    "Valor estimado": l.valorEstimado,
    Responsável: l.responsavel ?? "",
  }));

  const comprasPorFornecedor = Object.values(
    purchases.reduce((acc: Record<string, { Fornecedor: string; "Nº compras": number; "Valor total": number }>, p) => {
      const key = p.supplier.nomeFantasia ?? p.supplier.razaoSocial;
      acc[key] = acc[key] ?? { Fornecedor: key, "Nº compras": 0, "Valor total": 0 };
      acc[key]["Nº compras"] += 1;
      acc[key]["Valor total"] += p.items.reduce((s, it) => s + it.valorTotal, 0) + p.frete - p.desconto;
      return acc;
    }, {})
  );

  const abaixoDoMinimo = ingredients
    .filter((i) => i.estoqueAtual <= i.estoqueMinimo)
    .map((i) => ({ Produto: i.name, "Estoque atual": i.estoqueAtual, "Estoque mínimo": i.estoqueMinimo, Unidade: i.unidade }));

  const proximosVencimento = ingredients
    .filter((i) => i.validade && i.validade <= vencimentoLimite && i.validade >= now)
    .map((i) => ({ Produto: i.name, Validade: i.validade!.toISOString().slice(0, 10) }));

  const semMovimentacao = ingredients
    .filter((i) => !movimentadosDesde.has(i.id))
    .map((i) => ({ Produto: i.name, "Estoque atual": i.estoqueAtual, Unidade: i.unidade }));

  const transferenciasReport = transfers.map((t) => ({
    Data: t.createdAt.toISOString().slice(0, 10),
    Origem: t.origemEmpresa.name,
    Destino: t.destinoEmpresa.name,
    Itens: t.items.length,
    Status: t.status,
  }));

  const curvaAbc = (() => {
    const ordered = [...posicaoEstoque].sort((a, b) => b["Valor em estoque"] - a["Valor em estoque"]);
    const total = ordered.reduce((s, i) => s + i["Valor em estoque"], 0) || 1;
    const cumulativeValues = ordered.reduce<number[]>((acc, i) => [...acc, (acc.at(-1) ?? 0) + i["Valor em estoque"]], []);
    return ordered.map((i, idx) => {
      const pctAcumulado = (cumulativeValues[idx] / total) * 100;
      const classe = pctAcumulado <= 80 ? "A" : pctAcumulado <= 95 ? "B" : "C";
      return { Produto: i.Produto, "Valor em estoque": i["Valor em estoque"], "% acumulado": Math.round(pctAcumulado * 10) / 10, Classe: classe };
    });
  })();

  const auditoria = movements.map((m) => ({
    Data: m.createdAt.toISOString().slice(0, 16).replace("T", " "),
    Produto: m.ingredient.name,
    Tipo: m.type,
    Quantidade: m.quantidade,
    "Estoque após": m.estoqueApos,
    Origem: m.origin ?? "",
    Usuário: m.createdBy.name,
  }));

  const planoAcaoReport = plans.map((p) => ({
    Problema: p.problema,
    "Causa provável": p.causaProvavel ?? "",
    "Ação corretiva": p.acaoCorretiva,
    Responsável: p.responsavel ?? "",
    Prazo: p.prazo ? p.prazo.toISOString().slice(0, 10) : "",
    Status: p.status,
  }));

  return (
    <PageContainer title="Estoque" subtitle="Relatórios">
      <div className="space-y-6">
        <RelatoriosClient
          reports={[
            { key: "posicao", title: "Posição atual do estoque", description: "Estoque atual e valor por produto.", rows: posicaoEstoque },
            { key: "categoria", title: "Valor do estoque por categoria", description: "Valor total imobilizado, agrupado por categoria.", rows: valorPorCategoria },
            { key: "perdas", title: "Perdas e desperdícios", description: "Histórico completo de perdas registradas.", rows: perdasReport },
            { key: "compras", title: "Compras por fornecedor", description: "Total comprado e nº de pedidos por fornecedor.", rows: comprasPorFornecedor },
            { key: "minimo", title: "Produtos abaixo do estoque mínimo", description: "Itens que precisam de reposição.", rows: abaixoDoMinimo },
            { key: "vencimento", title: "Produtos próximos do vencimento", description: "Itens perecíveis vencendo nos próximos 7 dias.", rows: proximosVencimento },
            { key: "semmov", title: "Produtos sem movimentação", description: "Itens sem entrada/saída nos últimos 30 dias.", rows: semMovimentacao },
            { key: "transferencias", title: "Transferências entre lojas", description: "Histórico de transferências entre Nord Pizza e Zarki Sushi.", rows: transferenciasReport },
            { key: "abc", title: "Curva ABC de estoque", description: "Classificação A/B/C pelo valor em estoque.", rows: curvaAbc },
            { key: "auditoria", title: "Auditoria de movimentações", description: "Últimas 500 movimentações registradas no sistema.", rows: auditoria },
            { key: "planoacao", title: "Plano de ação", description: "Planos de ação criados a partir do comparativo Real x Teórico.", rows: planoAcaoReport },
          ]}
        />
      </div>
    </PageContainer>
  );
}
