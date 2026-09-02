import { notFound } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { Section } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";

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
      <Section title={meta.label}>
        <div className="flex flex-col items-center text-center gap-3 py-12">
          <div className="w-14 h-14 rounded-2xl bg-nord-blue/15 flex items-center justify-center">
            <DynamicIcon name={meta.icon} size={26} className="text-nord-blue-light" />
          </div>
          <p className="text-white font-medium">Em construção</p>
          <p className="text-sm text-nord-gray max-w-md">
            Essa tela ainda vai ganhar a montagem automática dos números da reunião (vendas, CMV, metas e o que
            mais for definido) e a exportação em PDF. Assim que os detalhes do formato forem combinados, o
            conteúdo entra aqui.
          </p>
        </div>
      </Section>
    </PageContainer>
  );
}
