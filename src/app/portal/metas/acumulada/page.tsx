import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { VendaAcumuladaClient } from "./venda-acumulada-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function VendaAcumuladaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "metas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  // "Lançar venda" deixa escolher QUALQUER garçom da loja no dropdown (não é o próprio
  // colaborador lançando a própria venda — é sempre um gestor registrando em nome de outro), então
  // só quem realmente pode criar (metas:canCreate) precisa da lista completa de colaboradores
  // ativos (nome + `id`). Achado ALTO de auditoria (Jonas): antes desta correção essa lista ia pro
  // client (e pro HTML/DevTools) pra qualquer usuário com metas:canView — que é `true` de fábrica
  // pro perfil "Funcionário" padrão — expondo o `id` de qualquer colega, inclusive o suficiente
  // para montar a URL de /portal/rh/colaboradores/<id>. O ranking em si (que todo mundo deve
  // continuar vendo, é a própria motivação da tela) não depende dessa lista — só usa `entries`.
  const canManageMetas = await hasModulePermission(session.user.id, "metas", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageMetas;

  const [entries, employees] = await Promise.all([
    prisma.waiterSaleEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { employee: { select: { id: true, name: true, cargo: true, photoUrl: true } } },
      orderBy: { date: "desc" },
    }),
    canCreate
      ? prisma.employee.findMany({
          where: { empresaId: { in: empresaIds }, status: "ATIVO" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, cargo: true, photoUrl: true },
        })
      : Promise.resolve([]),
  ]);

  const serializedEntries = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    employeeName: e.employee.name,
    employeePhoto: e.employee.photoUrl,
    amount: e.amount,
    date: e.date.toISOString(),
    note: e.note,
  }));

  return (
    <PageContainer title="Metas" subtitle="Venda Acumulada" backHref="/portal/metas" backLabel="Visão geral de metas">
      <VendaAcumuladaClient
        initialEntries={serializedEntries}
        employees={employees}
        canCreate={canCreate}
        canManageMetas={canManageMetas}
      />
    </PageContainer>
  );
}
