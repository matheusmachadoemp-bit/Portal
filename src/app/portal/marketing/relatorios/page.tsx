import { PageContainer } from "@/components/page-container";
import { MarketingTabs } from "../marketing-tabs";
import { Section } from "@/components/ui/stat-card";
import { Download } from "lucide-react";

const REPORTS = [
  { type: "tarefas", label: "Tarefas e calendário de conteúdo", desc: "Todas as tarefas com status, prioridade, rede social e responsável." },
  { type: "campanhas", label: "Campanhas", desc: "Período, orçamento, investimento, retorno e responsável de cada campanha." },
  { type: "kpis", label: "KPIs de tráfego pago e redes sociais", desc: "Histórico mensal de investimento, ROAS, seguidores e engajamento." },
];

export default function RelatoriosPage() {
  return (
    <PageContainer title="Marketing" subtitle="Relatórios">
      <div className="space-y-6">
        <MarketingTabs />
        <Section title="Exportar dados (CSV)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REPORTS.map((r) => (
              <div key={r.type} className="nord-card p-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-white text-sm font-medium mb-1">{r.label}</h4>
                  <p className="text-xs text-nord-gray mb-4">{r.desc}</p>
                </div>
                <a
                  href={`/api/marketing/export?type=${r.type}`}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
                >
                  <Download size={13} /> Baixar CSV
                </a>
              </div>
            ))}
          </div>
          <p className="text-xs text-nord-gray mt-4">
            Exportação em PDF, PNG e Excel nativo pode ser adicionada futuramente — hoje os relatórios saem em CSV,
            compatível com Excel/Google Sheets.
          </p>
        </Section>
      </div>
    </PageContainer>
  );
}
