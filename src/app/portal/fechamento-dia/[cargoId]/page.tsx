import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FormularioClient } from "./formulario-client";

/**
 * Formulário do cargo (Gerente/Chef de Salão/Chef de Cozinha) — uma tela só,
 * dirigida pelos dados de GET /api/fechamento-dia/cargos/[cargoId]/perguntas
 * (buscada pelo FormularioClient no cliente). A autorização de quem pode
 * ver/preencher ESTE cargo é 100% daquela rota (404/403 tratados na tela); o
 * único papel deste componente de servidor é resolver `cargo.empresaId` —
 * só para escopar a lista de produtos do seletor da pergunta tipo PRODUTO —
 * e listar os colaboradores para a pergunta tipo COLABORADOR (mesmo padrão
 * de leitura direta usado em src/app/portal/manutencao/chamados/page.tsx
 * para preencher o `<select>` de responsável).
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
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <PageContainer
      title="Fechamento do Dia"
      subtitle="Formulário do dia"
      backHref="/portal/fechamento-dia"
      backLabel="Status do dia"
    >
      <FormularioClient cargoId={cargoId} produtos={produtos} colaboradores={colaboradores} />
    </PageContainer>
  );
}
