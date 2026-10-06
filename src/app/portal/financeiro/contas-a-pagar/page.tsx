import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { ContasPagarClient } from "./contas-pagar-client";
import { subDays } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getActiveFinancialCategories } from "@/lib/financial-categories";

export default async function ContasAPagarPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageFinanceiro = await hasModulePermission(session.user.id, "financeiro", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageFinanceiro;

  const [payables, categorias, contas, fornecedoresCadastrados] = await Promise.all([
    prisma.payable.findMany({
      where: { empresaId: { in: empresaIds }, dataVencimento: { gte: subDays(new Date(), 120) } },
      orderBy: { dataVencimento: "asc" },
      include: { categoria: true, bankAccount: true, createdBy: { select: { name: true } }, empresa: true },
    }),
    getActiveFinancialCategories(),
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    // Cadastro de fornecedores (Estoque > Fornecedores) — usado só como SUGESTÃO no campo
    // "Fornecedor" do formulário (autocomplete via <datalist>, ver ContasPagarClient), nunca
    // trava o campo: Contas a Pagar também paga coisas que não são fornecedor de insumo (ex.
    // sócio, prestador de serviço), então o texto livre continua valendo.
    prisma.supplier.findMany({
      where: { empresaId: { in: empresaIds }, active: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
    }),
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
          canCreate={canCreate}
          isGrupoNordMode={ctx?.mode !== "single"}
        />
      </div>
    </PageContainer>
  );
}
