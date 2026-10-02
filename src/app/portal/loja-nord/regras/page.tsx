import { PageContainer } from "@/components/page-container";
import { Construction } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";
import { prisma } from "@/lib/prisma";
import { getActiveEmpresaContext } from "@/lib/empresa";

/**
 * Lê as regras de verdade (`LojaNordPointRule`) em vez da constante estática
 * `LOJA_NORD_DEFAULT_RULES` (que virou só o conteúdo do seed inicial — ver prisma/seed.ts). Mesmo
 * filtro de loja ativa/janela de validade de `GET /api/loja-nord/regras`, repetido aqui em vez de
 * chamado via HTTP porque é um Server Component (mesmo padrão já usado por
 * .../loja-nord/gestao/page.tsx, que também consulta o Prisma direto em vez da própria API).
 *
 * Ainda sem formulário de criar/editar nesta tela (isso é Fase 2, Caio) — só a leitura já passou a
 * ser real nesta fase.
 */
export default async function RegrasPontuacaoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaId = ctx?.mode === "single" ? ctx.empresa.id : null;

  const now = new Date();
  const rules = await prisma.lojaNordPointRule.findMany({
    where: {
      active: true,
      OR: [{ validoDe: null }, { validoDe: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
  });
  const visiveis = rules.filter((r) => {
    if (r.validoAte && r.validoAte < now) return false;
    if (empresaId && r.empresaIds.length > 0 && !r.empresaIds.includes(empresaId)) return false;
    return true;
  });

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
                {visiveis.map((r) => (
                  <tr key={r.activityType} className="border-b border-nord-border/50">
                    <td className="py-2 pr-4 text-white">{r.label}</td>
                    <td className={`py-2 pr-4 font-medium ${r.pontos < 0 ? "text-nord-danger" : "text-nord-success"}`}>
                      {r.pontos > 0 ? "+" : ""}
                      {formatNumber(r.pontos)}
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-nord-gray text-sm">
                      Nenhuma regra de pontuação cadastrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
