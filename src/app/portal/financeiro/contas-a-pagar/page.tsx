import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { ContasPagarClient } from "./contas-pagar-client";
import { subDays } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getActiveFinancialCategories } from "@/lib/financial-categories";
import { INVOICE_SUMMARY_SELECT } from "@/lib/compra-itens-server";

export default async function ContasAPagarPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageFinanceiro = await hasModulePermission(session.user.id, "financeiro", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageFinanceiro;

  const [payables, categorias, contas, fornecedoresCadastrados, ingredients, canCreateSupplier] = await Promise.all([
    prisma.payable.findMany({
      where: { empresaId: { in: empresaIds }, dataVencimento: { gte: subDays(new Date(), 120) } },
      orderBy: { dataVencimento: "asc" },
      include: {
        categoria: true,
        bankAccount: { select: { name: true } },
        createdBy: { select: { name: true } },
        empresa: true,
        invoice: { select: INVOICE_SUMMARY_SELECT },
      },
    }),
    getActiveFinancialCategories(),
    prisma.bankAccount.findMany({
      where: { active: true, empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      // Só o que a tela usa: o registro inteiro levaria o ID da conexão com o banco e o saldo para o navegador.
      select: { id: true, name: true },
    }),
    // Cadastro de fornecedores (Estoque > Fornecedores) — usado só como SUGESTÃO no campo
    // "Fornecedor" do formulário (autocomplete via <datalist>, ver ContasPagarClient), nunca
    // trava o campo: Contas a Pagar também paga coisas que não são fornecedor de insumo (ex.
    // sócio, prestador de serviço), então o texto livre continua valendo.
    prisma.supplier.findMany({
      where: { empresaId: { in: empresaIds }, active: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
    }),
    // Insumos do Estoque para “O que foi comprado” (só faz sentido numa loja específica: é onde se lança).
    canCreate
      ? prisma.ingredient.findMany({
          where: { empresaId: { in: empresaIds }, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unidade: true, unidadeCompra: true },
        })
      : Promise.resolve([]),
    // Cadastrar fornecedor é uma ação do Estoque: só aparece o atalho para quem pode.
    canCreate ? hasModulePermission(session.user.id, "estoque", "canCreate") : Promise.resolve(false),
  ]);

  const serialized = payables.map((p) => ({
    ...p,
    dataCompetencia: p.dataCompetencia.toISOString(),
    dataVencimento: p.dataVencimento.toISOString(),
    dataPagamento: p.dataPagamento ? p.dataPagamento.toISOString() : null,
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Contas a Pagar">
      <div className="space-y-6">
        <ContasPagarClient
          initialPayables={serialized}
          categorias={categorias}
          contas={contas}
          fornecedoresCadastrados={fornecedoresCadastrados.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
          ingredients={ingredients}
          canCreateSupplier={canCreateSupplier}
          canCreate={canCreate}
          isGrupoNordMode={ctx?.mode !== "single"}
        />
      </div>
    </PageContainer>
  );
}
