import { PageContainer } from "@/components/page-container";
import { Construction } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { LOJA_NORD_DEFAULT_RULES } from "@/lib/loja-nord";
import { formatNumber } from "@/lib/calc";

export default function RegrasPontuacaoPage() {
  return (
    <PageContainer title="Regras de Pontuação" subtitle="Quantos pontos cada atividade gera na Loja Nord">
      <div className="space-y-6">
        <div className="nord-card p-4 flex items-start gap-3">
          <Construction size={20} className="text-nord-gray shrink-0 mt-0.5" />
          <p className="text-xs text-nord-gray">
            A edição das regras (limites diário/mensal, setores, lojas, validação, período de validade) ainda está
            sendo finalizada. Por enquanto, estas são as regras sugeridas de partida — a Loja Nord já está
            preparada para creditar pontos automaticamente assim que as integrações com Tarefas, Checklist e
            Cursos forem ligadas.
          </p>
        </div>

        <Section title="Regras sugeridas">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Atividade</th>
                  <th className="py-2 pr-4">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {LOJA_NORD_DEFAULT_RULES.map((r) => (
                  <tr key={r.activityType} className="border-b border-nord-border/50">
                    <td className="py-2 pr-4 text-white">{r.label}</td>
                    <td className="py-2 pr-4 text-nord-success font-medium">+{formatNumber(r.pontos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
