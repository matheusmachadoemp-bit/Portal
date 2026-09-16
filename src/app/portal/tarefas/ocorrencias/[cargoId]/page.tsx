import { prisma } from "@/lib/prisma";
import { getSelectableTeamMembers } from "@/lib/empresa";
import { PageContainer } from "@/components/page-container";
import { FormularioClient } from "./formulario-client";

/**
 * Formulário do cargo (Gerente/Chef de Salão/Chef de Cozinha) — uma tela só,
 * dirigida pelos dados de GET /api/fechamento-dia/cargos/[cargoId]/perguntas
 * (buscada pelo FormularioClient no cliente). A autorização de quem pode
 * ver/preencher ESTE cargo é 100% daquela rota (404/403 tratados na tela); o
 * único papel deste componente de servidor é resolver `cargo.empresaId` —
 * usado tanto para escopar a lista de produtos do seletor da pergunta tipo
 * PRODUTO quanto para listar só os colaboradores com acesso a ESSA loja
 * para a pergunta tipo COLABORADOR (antes buscava todo usuário ativo da
 * rede, sem filtro nenhum de loja — ver `getSelectableTeamMembers`).
 *
 * Vive em /portal/tarefas/ocorrencias/[cargoId] — "dentro" da subcategoria Ocorrências (que
 * passou a concentrar Status do dia + Ocorrências, ver ../page.tsx), já que preencher o
 * fechamento de um cargo é o que gera as ocorrências daquele dia.
 */
export default async function FechamentoCargoFormPage({ params }: { params: Promise<{ cargoId: string }> }) {
  const { cargoId } = await params;

  const cargo = await prisma.fechamentoCargo.findUnique({
    where: { id: cargoId },
    select: { empresaId: true },
  });

  const [produtos, colaboradores] = await Promise.all([
    cargo
      ? prisma.product.findMany({
          where: { empresaId: cargo.empresaId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    cargo ? getSelectableTeamMembers([cargo.empresaId]) : Promise.resolve([]),
  ]);

  return (
    <PageContainer
      title="Ocorrências"
      subtitle="Formulário do dia"
      backHref="/portal/tarefas/ocorrencias"
      backLabel="Status do dia e ocorrências"
    >
      <FormularioClient cargoId={cargoId} produtos={produtos} colaboradores={colaboradores} />
    </PageContainer>
  );
}
