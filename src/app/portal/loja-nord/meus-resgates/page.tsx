import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { MeusResgatesClient } from "./meus-resgates-client";

export default async function MeusResgatesPage() {
  const session = await auth();
  const userId = session?.user.id ?? "";

  const redemptions = await prisma.lojaNordRedemption.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      reward: { select: { nome: true, imagemUrl: true, categoria: true } },
      aprovadoPor: { select: { name: true } },
    },
  });

  return (
    <PageContainer title="Meus Resgates" subtitle="Acompanhe o status das suas solicitações de resgate">
      <MeusResgatesClient
        initialRedemptions={redemptions.map((r) => ({
          id: r.id,
          rewardNome: r.reward.nome,
          rewardImagemUrl: r.reward.imagemUrl,
          pontos: r.pontos,
          status: r.status,
          dataPrevista: r.dataPrevista?.toISOString() ?? null,
          aprovadoPorNome: r.aprovadoPor?.name ?? null,
          motivoRecusa: r.motivoRecusa,
          observacoes: r.observacoes,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </PageContainer>
  );
}
