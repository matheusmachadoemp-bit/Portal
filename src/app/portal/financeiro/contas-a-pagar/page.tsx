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
import { REFRESH_WINDOW_DAYS } from "@/lib/due-date-filter";

export default async function ContasAPagarPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageFinanceiro = await hasModulePermission(session.user.id, "financeiro", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageFinanceiro;
  // Editar uma conta já existente age sobre o `empresaId` dela mesma (ver `assertEmpresaAccess` em
  // `PATCH /api/financeiro/pagar/[id]`), diferente de criar (que exige uma loja ativa única, ver
  // `requireActiveSingleEmpresa` no POST) — por isso `canEdit` NÃO depende do modo Grupo Nord, só
  // da permissão do perfil.
  const canEdit = await hasModulePermission(session.user.id, "financeiro", "canEdit");
  // Espelha exatamente a checagem do `DELETE /api/financeiro/pagar/[id]`: exige a permissão
  // `canDelete` do módulo E o cargo do usuário estar em MANAGER_ROLES — nenhuma das duas sozinha
  // basta lá, então nenhuma das duas sozinha deve bastar aqui pra mostrar o botão de excluir.
  const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];
  const canDelete =
    MANAGER_ROLES.includes(session.user.role) &&
    (await hasModulePermission(session.user.id, "financeiro", "canDelete"));

  const [payables, categorias, contas, fornecedoresCadastrados, ingredients, canCreateSupplier, employees] = await Promise.all([
    prisma.payable.findMany({
      where: { empresaId: { in: empresaIds }, dataVencimento: { gte: subDays(new Date(), REFRESH_WINDOW_DAYS) } },
      orderBy: { dataVencimento: "asc" },
      include: {
        categoria: true,
        bankAccount: { select: { name: true } },
        createdBy: { select: { name: true } },
        // Só o que a tela usa: o registro inteiro da loja leva códigos de integração ao navegador.
        empresa: { select: { id: true, name: true, color: true } },
        invoice: { select: INVOICE_SUMMARY_SELECT },
        employee: { select: { id: true, name: true } },
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
    // Insumos do Estoque para “O que foi comprado” (só numa loja específica, que é onde se lança, e para
    // quem pode ver o Estoque).
    canCreate && (await hasModulePermission(session.user.id, "estoque", "canView"))
      ? prisma.ingredient.findMany({
          where: { empresaId: { in: empresaIds }, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unidade: true, unidadeCompra: true },
        })
      : Promise.resolve([]),
    // Cadastrar fornecedor é uma ação do Estoque: só aparece o atalho para quem pode.
    canCreate ? hasModulePermission(session.user.id, "estoque", "canCreate") : Promise.resolve(false),
    // Colaboradores ATIVOS (RH) para o select opcional "Colaborador" do formulário — usado quando o
    // lançamento é na verdade um pagamento a colaborador (folha, bonificação), não fornecedor de
    // insumo (ver `employeeId` em `schema.prisma`). Mesmo filtro `status: "ATIVO"` já usado em
    // outros selects de colaborador do Portal (ex. `rh/escala-folgas/page.tsx`).
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds }, status: "ATIVO" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
          employees={employees}
          ingredients={ingredients}
          canCreateSupplier={canCreateSupplier}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          isGrupoNordMode={ctx?.mode !== "single"}
        />
      </div>
    </PageContainer>
  );
}
