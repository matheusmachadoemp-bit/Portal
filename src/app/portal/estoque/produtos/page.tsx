import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ProdutosClient } from "./produtos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

// Estoque > Produtos e Estoque > Categorias foram unificadas nesta única
// subcategoria ("Produtos" absorveu "Categorias" — ver DESIGN_SYSTEM.md e o
// precedente em src/app/portal/financeiro/caixa-da-empresa/). A tela mostra
// três abas internas (Produtos / Categorias / Setores); a URL
// /portal/estoque/categorias deixou de existir.

// Checagem de cargo (MANAGER_ROLES) — mesmo padrão já usado nas demais telas que expõem custo de
// insumo (Gasto por Insumo, CMV, Ficha Técnica > Produtos — ver
// src/app/portal/estoque/gasto-por-insumo/page.tsx). Achado pelo Otavio (tarefa de Ficha Técnica
// > Insumos/Recebimento) como um 3º gap da mesma classe: esta página faz a query de `Ingredient`
// (precoAtual + fornecedor) direto, só com `estoque:canView`, sem nenhuma trava de cargo — por
// isso qualquer Colaborador com o perfil padrão "Funcionário" (canView=true de fábrica) via
// quanto a empresa paga por cada insumo e de quem compra.
//
// Diferença para as telas-irmãs acima: lá o bloqueio é da PÁGINA inteira, porque a tela só existe
// pra mostrar dado sensível. Aqui NÃO — as abas "Categorias" e "Setores" desta mesma tela não têm
// nenhum campo de valor (ver `StockCategoryDTO`/`StockSectorDTO` abaixo: nome, ícone, cor, setor,
// meta de perda %, periodicidade de contagem, contagem de produtos — nada em R$) e servem pra
// organizar o estoque (setor de prateleira, categoria de produto), uso operacional legítimo pra
// um Colaborador comum mesmo sem acesso a preço — bloquear a página inteira tiraria isso sem
// necessidade. Por isso o bloqueio aqui é só dos 3 campos sensíveis (precoAtual,
// fornecedorPrincipalId, fornecedorNome) dentro de `serializedIngredients`, usados exclusivamente
// pela aba "Produtos" — ver produtos-client.tsx (prop `canViewCustos`) para como a aba lida com a
// ausência desses campos sem quebrar (coluna "Custo" mostra "—", alertas "Sem custo"/"Sem
// fornecedor" ficam desligados pra esse perfil, já que senão apareceriam em 100% das linhas).
//
// fornecedorPrincipalId entra no bloqueio junto (não só fornecedorNome): sem isso, bastaria cruzar
// o id com a prop `suppliers` (lista completa de fornecedores da loja, enviada pra alimentar o
// dropdown do formulário de criar/editar) pra descobrir o nome igual — por isso `suppliers`
// também só vai completa pra quem tem `canCreateProduto` (quem de fato usa o formulário) abaixo.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function ProdutosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }
  const canViewCustos = MANAGER_ROLES.includes(session.user.role);

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  // canCreate aqui checa o módulo "ficha-tecnica", não "estoque": o formulário da aba
  // "Produtos" (ProdutosClient) cria/edita via /api/ficha-tecnica/insumos, que é protegida
  // por "ficha-tecnica" canCreate/canEdit — precisa bater com o módulo que a API de
  // escrita realmente usa, senão o botão aparece pra quem a API vai recusar (ou some
  // pra quem a API aceitaria).
  const canManageFichaTecnica = await hasModulePermission(session.user.id, "ficha-tecnica", "canCreate");
  const canCreateProduto = ctx?.mode === "single" && canManageFichaTecnica;
  // Mesma lógica do canCreateProduto acima, mas para exclusão: a exclusão (individual
  // e em lote) da aba "Produtos" também acontece via /api/ficha-tecnica/insumos, que
  // é protegida pelo módulo "ficha-tecnica" (canDelete), não "estoque".
  const canDeleteFichaTecnica = await hasModulePermission(session.user.id, "ficha-tecnica", "canDelete");
  const canDeleteProduto = ctx?.mode === "single" && canDeleteFichaTecnica;

  // Categorias e Setores de estoque são cadastros POR LOJA desde a migration
  // 20261001120000_estoque_setores_categorias_por_loja (antes eram globais, compartilhados por
  // todas as lojas — corrigido depois de uma auditoria do Teulis mostrar que um usuário com
  // permissão de Estoque em QUALQUER loja podia renomear/excluir uma categoria/setor usado por
  // TODAS as outras lojas ao mesmo tempo). Criar uma categoria/setor agora exige loja única ativa
  // (POST /api/estoque/categorias e /api/estoque/setores recusam em modo Grupo Nord, mesmo padrão
  // de canCreateProduto acima) — por isso o "ctx?.mode === 'single'" entrou aqui também. Editar/
  // ativar-desativar continua liberado em modo Grupo Nord (a API confere o acesso à loja
  // específica de cada registro via assertEmpresaAccess, mesmo padrão de editar uma StockCount).
  const canManageEstoque = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canCreateCategoria = ctx?.mode === "single" && canManageEstoque;
  const canEditCategoria = await hasModulePermission(session.user.id, "estoque", "canEdit");
  // Setores (StockSector): exclusão de verdade (não soft-delete), protegida por um verbo à parte
  // (canDelete), diferente de criar/editar/ativar-desativar (canCreate/canEdit acima) — ver
  // DELETE /api/estoque/setores/[id].
  const canDeleteSetor = await hasModulePermission(session.user.id, "estoque", "canDelete");

  const [ingredients, categories, sectors, suppliers] = await Promise.all([
    prisma.ingredient.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      include: { category: { select: { id: true, name: true, color: true } }, fornecedorPrincipal: { select: { id: true, nomeFantasia: true, razaoSocial: true } } },
    }),
    // Uma única query: alimenta tanto o grid de gerenciamento da aba "Categorias" (nome,
    // ícone, cor, setor, meta de perda, periodicidade, ativa/inativa, contagem de produtos)
    // quanto os dropdowns de categoria da aba "Produtos" (filtro e formulário) — o client
    // deriva a lista simples (id/nome/cor) a partir desta mesma lista, sem duplicar a query.
    prisma.stockCategory.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { order: "asc" },
      include: { _count: { select: { ingredients: true } } },
    }),
    // Ativos E inativos: a aba "Setores" precisa gerenciar/reativar um setor desativado (mesmo
    // padrão da query de `categories` acima, que também traz todas independente de `active`) —
    // os dropdowns operacionais (filtro/formulário de Produtos, "Setor responsável" de
    // Categorias) filtram só os ativos dentro do próprio client (`ProdutosClient`).
    prisma.stockSector.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { order: "asc" } }),
    prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
  ]);

  const serializedIngredients = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    codigoInterno: i.codigoInterno,
    codigoBarras: i.codigoBarras,
    categoryId: i.categoryId,
    categoryName: i.category?.name ?? null,
    categoryColor: i.category?.color ?? null,
    setor: i.setor,
    unidade: i.unidade,
    unidadeCompra: i.unidadeCompra,
    fatorConversao: i.fatorConversao,
    // null pra quem não é MANAGER_ROLES — ver comentário acima de `canViewCustos`.
    precoAtual: canViewCustos ? i.precoAtual : null,
    quantidadeEmbalagem: i.quantidadeEmbalagem,
    rendimentoAproveitavel: i.rendimentoAproveitavel,
    percentualPerda: i.percentualPerda,
    estoqueAtual: i.estoqueAtual,
    estoqueMinimo: i.estoqueMinimo,
    estoqueMaximo: i.estoqueMaximo,
    pontoReposicao: i.pontoReposicao,
    localArmazenamento: i.localArmazenamento,
    // Ambos null pra quem não é MANAGER_ROLES — ver comentário acima de `canViewCustos`.
    fornecedorPrincipalId: canViewCustos ? i.fornecedorPrincipalId : null,
    fornecedorNome: canViewCustos ? (i.fornecedorPrincipal?.nomeFantasia ?? i.fornecedorPrincipal?.razaoSocial ?? null) : null,
    validade: i.validade ? i.validade.toISOString() : null,
    perecivel: i.perecivel,
    active: i.active,
  }));

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    setor: c.setor,
    metaPerdaPercent: c.metaPerdaPercent,
    periodicidadeContagem: c.periodicidadeContagem,
    active: c.active,
    produtos: c._count.ingredients,
  }));

  const serializedSectors = sectors.map((s) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    active: s.active,
  }));

  return (
    <PageContainer title="Estoque" subtitle="Produtos">
      <div className="space-y-6">
        <ProdutosClient
          initialIngredients={serializedIngredients}
          initialCategories={serializedCategories}
          initialSectors={serializedSectors}
          // Lista completa só pra quem de fato usa o formulário (criar/editar produto); pra quem
          // não tem canCreateProduto ela nem seria exibida (dropdown só existe dentro do
          // formulário), mas o valor ainda viria embutido no payload da página pra qualquer
          // Colaborador com canView — e, combinado com fornecedorPrincipalId em cada produto,
          // bastaria pra reconstruir o nome do fornecedor mesmo com fornecedorNome omitido acima.
          suppliers={canCreateProduto ? suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial })) : []}
          canCreate={canCreateProduto}
          canDelete={canDeleteProduto}
          canCreateCategoria={canCreateCategoria}
          canEditCategoria={canEditCategoria}
          canDeleteSetor={canDeleteSetor}
          canViewCustos={canViewCustos}
        />
      </div>
    </PageContainer>
  );
}
