import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { StatCard, Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getPontosGanhosTotal,
  getPontosNoPeriodo,
  getPontosPendentesAprovacao,
  getSaldoAtual,
} from "@/lib/loja-nord-server";
import {
  LOJA_NORD_TRANSACTION_KIND_LABEL,
  LOJA_NORD_TRANSACTION_KIND_TONE,
  levelForPontos,
  nextLevelForPontos,
} from "@/lib/loja-nord";

export default async function MeusPontosPage() {
  const session = await auth();
  const userId = session?.user.id ?? "";
  const now = new Date();
  const inicioMes = startOfMonth(now);
  const fimMes = endOfMonth(now);
  const inicioMesAnterior = startOfMonth(subMonths(now, 1));
  const fimMesAnterior = endOfMonth(subMonths(now, 1));

  const [saldo, ganhosTotal, ganhosMes, ganhosMesAnterior, utilizadosMes, pendentes, transacoes, ranking] = await Promise.all([
    getSaldoAtual(userId),
    getPontosGanhosTotal(userId),
    getPontosNoPeriodo(userId, inicioMes, fimMes, "positivo"),
    getPontosNoPeriodo(userId, inicioMesAnterior, fimMesAnterior, "positivo"),
    getPontosNoPeriodo(userId, inicioMes, fimMes, "negativo"),
    getPontosPendentesAprovacao(userId),
    prisma.lojaNordPointTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { empresa: { select: { name: true } }, criadoPor: { select: { name: true } } },
    }),
    prisma.lojaNordPointTransaction.groupBy({
      by: ["userId"],
      where: { pontos: { gt: 0 } },
      _sum: { pontos: true },
    }),
  ]);

  const ranked = ranking
    .map((r) => ({ userId: r.userId, total: r._sum.pontos ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const posicao = ranked.findIndex((r) => r.userId === userId) + 1;

  const nivel = levelForPontos(ganhosTotal);
  const proximo = nextLevelForPontos(ganhosTotal);
  const progressoPercent = proximo
    ? ((ganhosTotal - nivel.minPontos) / (proximo.minPontos - nivel.minPontos)) * 100
    : 100;

  const comparativo = ganhosMesAnterior > 0 ? ((ganhosMes - ganhosMesAnterior) / ganhosMesAnterior) * 100 : ganhosMes > 0 ? 100 : 0;

  return (
    <PageContainer title="Meus Pontos" subtitle="Sua carteira de pontos na Loja Nord">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Saldo total disponível" value={`${formatNumber(saldo)} pts`} icon="Wallet" color="#1464F4" />
          <StatCard
            label="Pontos conquistados no mês"
            value={`${formatNumber(ganhosMes)} pts`}
            icon="TrendingUp"
            color="#22c55e"
            delta={comparativo}
          />
          <StatCard label="Pontos utilizados no mês" value={`${formatNumber(Math.abs(utilizadosMes))} pts`} icon="ShoppingBag" color="#ef4444" />
          <StatCard
            label="Pontos pendentes de validação"
            value={`${formatNumber(pendentes)} pts`}
            icon="Clock"
            color="#f59e0b"
            hint="Em resgates aguardando aprovação"
          />
        </div>

        <Section title="Nível de reconhecimento">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: nivel.color }} />
              <span className="text-white font-semibold">{nivel.label}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-nord-gray">
              {posicao > 0 && <span>Posição no ranking: <span className="text-white font-medium">#{posicao}</span></span>}
              <span>{formatNumber(ganhosTotal)} pts ganhos no total</span>
            </div>
          </div>
          <ProgressBar percent={progressoPercent} color={nivel.color} />
          <p className="text-xs text-nord-gray mt-2">
            {proximo
              ? `Faltam ${formatNumber(proximo.minPontos - ganhosTotal)} pontos para o nível ${proximo.label}`
              : "Você atingiu o nível máximo de reconhecimento!"}
          </p>
        </Section>

        <Section title="Histórico de pontos">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Atividade</th>
                  <th className="py-2 pr-4">Origem</th>
                  <th className="py-2 pr-4">Loja</th>
                  <th className="py-2 pr-4">Setor</th>
                  <th className="py-2 pr-4">Pontos</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {transacoes.map((t) => (
                  <tr key={t.id} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2 pr-4 text-nord-gray whitespace-nowrap">
                      {format(t.createdAt, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="py-2 pr-4 text-white">{t.descricao}</td>
                    <td className="py-2 pr-4 text-nord-gray">{t.origem}</td>
                    <td className="py-2 pr-4 text-nord-gray">{t.empresa.name}</td>
                    <td className="py-2 pr-4 text-nord-gray">{t.setor ?? "-"}</td>
                    <td className={`py-2 pr-4 font-medium ${t.pontos >= 0 ? "text-nord-success" : "text-nord-danger"}`}>
                      {t.pontos >= 0 ? "+" : ""}
                      {formatNumber(t.pontos)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={LOJA_NORD_TRANSACTION_KIND_TONE[t.kind] ?? "default"}>
                        {LOJA_NORD_TRANSACTION_KIND_LABEL[t.kind] ?? t.kind}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-nord-gray">{t.criadoPor?.name ?? "-"}</td>
                  </tr>
                ))}
                {transacoes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-nord-gray text-sm">
                      Nenhuma movimentação de pontos ainda.
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
