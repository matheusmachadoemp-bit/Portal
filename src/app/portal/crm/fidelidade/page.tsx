import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FidelidadeClient } from "./fidelidade-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeClienteMetrics } from "@/lib/crm";

export default async function FidelidadePage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [config, rewards, accounts, transacoes] = await Promise.all([
    ctx?.mode === "single" ? prisma.loyaltyConfig.findUnique({ where: { empresaId: ctx.empresa.id } }) : null,
    prisma.loyaltyReward.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { pontosNecessarios: "asc" } }),
    prisma.loyaltyAccount.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { pontos: "desc" },
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            empresaId: true,
            telefone: true,
            whatsapp: true,
            email: true,
            dataNascimento: true,
            endereco: true,
            bairro: true,
            cidade: true,
            canalPreferido: true,
            createdAt: true,
            vendas: { select: { id: true, dateTime: true, valorTotal: true, channel: true } },
          },
        },
      },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { account: { empresaId: { in: empresaIds } } },
      select: { tipo: true, pontos: true, cashback: true },
    }),
  ]);

  const pontosEmitidos = transacoes.filter((t) => t.tipo === "GANHO").reduce((s, t) => s + t.pontos, 0);
  const pontosUtilizados = transacoes.filter((t) => t.tipo === "RESGATE").reduce((s, t) => s + t.pontos, 0);
  const cashbackEmitido = transacoes.filter((t) => t.tipo === "GANHO").reduce((s, t) => s + t.cashback, 0);
  const cashbackUtilizado = transacoes.filter((t) => t.tipo === "RESGATE").reduce((s, t) => s + t.cashback, 0);

  const metrics = computeClienteMetrics(accounts.map((a) => a.cliente));
  const receitaMembros = metrics.reduce((s, m) => s + m.totalGasto, 0);
  const ticketMedioMembros = metrics.length ? metrics.reduce((s, m) => s + m.ticketMedio, 0) / metrics.length : 0;
  const frequencias = metrics.filter((m) => m.frequenciaMediaDias !== null).map((m) => m.frequenciaMediaDias as number);
  const frequenciaMedia = frequencias.length ? frequencias.reduce((s, v) => s + v, 0) / frequencias.length : null;

  const membros = accounts.map((a) => {
    const m = metrics.find((mm) => mm.id === a.cliente.id)!;
    return {
      id: a.id,
      clienteId: a.cliente.id,
      nome: a.cliente.nome,
      pontos: a.pontos,
      cashback: a.cashback,
      totalGasto: m.totalGasto,
      ticketMedio: m.ticketMedio,
      pedidos: m.pedidos,
    };
  });

  return (
    <PageContainer title="CRM" subtitle="Fidelidade — Clube Nord">
      <div className="space-y-6">
        <FidelidadeClient
          kpis={{
            participantes: accounts.length,
            pontosEmitidos,
            pontosUtilizados,
            cashbackEmitido,
            cashbackUtilizado,
            receitaMembros,
            ticketMedioMembros,
            frequenciaMedia,
          }}
          rewards={rewards.map((r) => ({ id: r.id, name: r.name, pontosNecessarios: r.pontosNecessarios, ativo: r.ativo }))}
          membros={membros}
          pontosPorReal={config?.pontosPorReal ?? 1}
          canManage={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
