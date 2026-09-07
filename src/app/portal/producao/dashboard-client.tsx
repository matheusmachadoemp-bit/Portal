"use client";

import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { RadialProgress } from "@/components/ui/radial-progress";

export function DashboardClient({
  data,
}: {
  data: { programadas: number; concluidas: number; pendentes: number; atrasadas: number; percentConcluido: number };
}) {
  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="producao-dashboard-cards"
        cards={[
          { key: "programadas", label: "Produções Programadas", value: String(data.programadas), icon: "ClipboardList", color: "#1464F4", href: "/portal/producao/hoje" },
          { key: "concluidas", label: "Concluídas", value: String(data.concluidas), icon: "CheckCircle2", color: "#22c55e", href: "/portal/producao/hoje?status=CONCLUIDO" },
          { key: "pendentes", label: "Pendentes", value: String(data.pendentes), icon: "Clock", color: "#f59e0b", href: "/portal/producao/hoje?status=PENDENTE" },
          { key: "atrasadas", label: "Atrasadas", value: String(data.atrasadas), icon: "AlertTriangle", color: "#ef4444", href: "/portal/producao/hoje?status=ATRASADO" },
        ]}
      />

      <Section title="Produção do dia">
        <div className="flex items-center gap-6">
          <RadialProgress percent={data.percentConcluido} color="#22c55e" label={`${data.percentConcluido}%`} sublabel="concluída" />
          <p className="text-sm text-nord-gray">
            {data.concluidas} de {data.programadas} produções concluídas hoje.
          </p>
        </div>
      </Section>
    </div>
  );
}
