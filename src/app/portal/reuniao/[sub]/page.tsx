import { notFound } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { ComingSoon } from "@/components/ui/coming-soon";

const SUB_MAP: Record<string, { label: string; icon: string }> = {
  salao: { label: "Reunião Salão", icon: "Utensils" },
  delivery: { label: "Reunião Delivery", icon: "Truck" },
  cozinha: { label: "Reunião Cozinha", icon: "ChefHat" },
  gerente: { label: "Reunião Gerente", icon: "Briefcase" },
  lideranca: { label: "Reunião Liderança", icon: "Crown" },
};

export default async function ReuniaoSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  const meta = SUB_MAP[sub];
  if (!meta) notFound();

  return (
    <PageContainer title="Reunião" subtitle={meta.label}>
      <ComingSoon
        icon={meta.icon}
        title="Em construção"
        description="Essa tela ainda vai ganhar a montagem automática dos números da reunião (vendas, CMV, metas e o que mais for definido) e a exportação em PDF. Assim que os detalhes do formato forem combinados, o conteúdo entra aqui."
      />
    </PageContainer>
  );
}
