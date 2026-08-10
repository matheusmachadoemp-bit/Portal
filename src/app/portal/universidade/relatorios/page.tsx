import { PageContainer } from "@/components/page-container";
import { UniversityTabs } from "../university-tabs";
import { Section } from "@/components/ui/stat-card";
import { Download } from "lucide-react";

const REPORTS = [
  { type: "treinamentos", label: "Treinamentos realizados e pendências", desc: "Status, progresso e datas de cada matrícula por colaborador." },
  { type: "certificados", label: "Certificados emitidos", desc: "Código, colaborador, curso e data de emissão de cada certificado." },
  { type: "ranking", label: "Ranking de XP", desc: "Pontuação total acumulada por colaborador." },
];

export default function RelatoriosPage() {
  return (
    <PageContainer title="Universidade Grupo Nord" subtitle="Relatórios">
      <div className="space-y-6">
        <UniversityTabs />
        <Section title="Exportar dados (CSV)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REPORTS.map((r) => (
              <div key={r.type} className="nord-card p-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-white text-sm font-medium mb-1">{r.label}</h4>
                  <p className="text-xs text-nord-gray mb-4">{r.desc}</p>
                </div>
                <a
                  href={`/api/university/export?type=${r.type}`}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
                >
                  <Download size={13} /> Baixar CSV
                </a>
              </div>
            ))}
          </div>
          <p className="text-xs text-nord-gray mt-4">
            Exportação em PDF e Excel nativo pode ser adicionada futuramente — hoje os relatórios saem em CSV,
            compatível com Excel/Google Sheets.
          </p>
        </Section>
      </div>
    </PageContainer>
  );
}
