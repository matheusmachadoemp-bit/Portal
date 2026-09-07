import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { NovoPedidoClient } from "./novo-pedido-client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RECEBIMENTO_MANAGE_ROLES } from "@/lib/estoque";

export default async function NovoPedidoRecebimentoPage() {
  const session = await auth();
  if (!RECEBIMENTO_MANAGE_ROLES.includes(session?.user?.role ?? "")) redirect("/portal/estoque/recebimento");

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) redirect("/portal/estoque/recebimento");

  const [suppliers, ingredients, users] = await Promise.all([
    prisma.supplier.findMany({
      where: { empresaId: empresa.id, active: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
    }),
    prisma.ingredient.findMany({
      where: { empresaId: empresa.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unidade: true, unidadeCompra: true, precoAtual: true },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PageContainer
      title="Novo Pedido de Compra"
      subtitle="Cadastre os produtos do pedido para enviar para recebimento"
      backHref="/portal/estoque/recebimento"
      backLabel="Voltar para Recebimento"
    >
      <NovoPedidoClient
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
        ingredients={ingredients}
        users={users}
      />
    </PageContainer>
  );
}
