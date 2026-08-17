import { prisma } from "@/lib/prisma";
import { syncEmpresaSaiposSales } from "@/lib/saipos-sync";
import { SALE_CHANNEL_LABEL, SALE_PLATFORM_LABEL } from "@/lib/vendas-analytics";
import type { SaleChannel } from "@prisma/client";

// Não vale a pena reconsultar a API da Saipos a cada poll do navegador (a
// tela atualiza a cada 15s); resincroniza no máximo 1x por minuto por loja.
const MIN_RESYNC_INTERVAL_MS = 60_000;

// O servidor roda em UTC, mas o "dia" da loja segue o horário de Brasília
// (America/Sao_Paulo, UTC-3) — usar meia-noite em UTC como início do dia
// exclui pedidos do turno da noite (que já viraram "amanhã" em UTC a partir
// das 21h de Brasília, mas ainda são "hoje" para a Saipos/loja).
function hojeShiftDateBoundary(date: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export type PainelAoVivoPayload = {
  syncedAt: string;
  integrado: boolean;
  pedidosHoje: number;
  faturamentoHoje: number;
  ticketMedioHoje: number;
  recorde: { pedidos: number; date: string } | null;
  porCanal: { channel: string; label: string; pedidos: number; valor: number }[];
  recentes: {
    id: string;
    saleNumber: number | null;
    customerName: string | null;
    district: string | null;
    dateTime: string;
    valorTotal: number;
    channel: string;
    channelLabel: string;
    platform: string;
    platformLabel: string;
    formaPagamento: string;
  }[];
  producaoDisponivel: boolean;
};

export async function computePainelAoVivo(empresaIds: string[]): Promise<PainelAoVivoPayload> {
  const empresas = await prisma.empresa.findMany({
    where: { id: { in: empresaIds } },
    select: { id: true, saiposApiToken: true, saiposSyncEnabled: true, saiposLastSyncAt: true },
  });

  const integradas = empresas.filter((e) => e.saiposApiToken && e.saiposSyncEnabled);

  // Resincroniza (em segundo plano, sem travar a resposta em caso de erro) as
  // vendas do dia para as lojas com integração Saipos ativa e que não foram
  // sincronizadas nos últimos 60s.
  const now = new Date();
  await Promise.all(
    integradas
      .filter((e) => !e.saiposLastSyncAt || now.getTime() - e.saiposLastSyncAt.getTime() > MIN_RESYNC_INTERVAL_MS)
      .map((e) =>
        syncEmpresaSaiposSales(
          { id: e.id, saiposApiToken: e.saiposApiToken },
          { start: hojeShiftDateBoundary(now), end: now }
        ).catch(() => null)
      )
  );

  const hojeInicio = hojeShiftDateBoundary(now);

  const [vendasHoje, entriesRecentes] = await Promise.all([
    prisma.saiposSale.findMany({
      where: { empresaId: { in: empresaIds }, shiftDate: { gte: hojeInicio }, cancelado: false },
      orderBy: { dateTime: "desc" },
      select: {
        id: true,
        saleNumber: true,
        customerName: true,
        district: true,
        dateTime: true,
        valorTotal: true,
        channel: true,
        platform: true,
        formaPagamento: true,
      },
    }),
    prisma.salesEntry.findMany({
      where: { empresaId: { in: empresaIds }, periodType: "DIARIO" },
      select: { date: true, pedidosDelivery: true, pedidosSalao: true, pedidosBalcao: true },
    }),
  ]);

  const pedidosHoje = vendasHoje.length;
  const faturamentoHoje = vendasHoje.reduce((sum, v) => sum + v.valorTotal, 0);
  const ticketMedioHoje = pedidosHoje ? faturamentoHoje / pedidosHoje : 0;

  const porDia = new Map<string, number>();
  for (const entry of entriesRecentes) {
    const key = entry.date.toISOString().slice(0, 10);
    const total = entry.pedidosDelivery + entry.pedidosSalao + entry.pedidosBalcao;
    porDia.set(key, (porDia.get(key) ?? 0) + total);
  }
  // O dia de hoje ainda não fechou no SalesEntry; usa a contagem ao vivo em vez do valor agregado.
  porDia.set(hojeInicio.toISOString().slice(0, 10), pedidosHoje);

  let recorde: { pedidos: number; date: string } | null = null;
  for (const [date, pedidos] of porDia) {
    if (!recorde || pedidos > recorde.pedidos) recorde = { pedidos, date };
  }

  const porCanalMap = new Map<SaleChannel, { pedidos: number; valor: number }>();
  for (const v of vendasHoje) {
    const acc = porCanalMap.get(v.channel) ?? { pedidos: 0, valor: 0 };
    acc.pedidos += 1;
    acc.valor += v.valorTotal;
    porCanalMap.set(v.channel, acc);
  }
  const porCanal = Array.from(porCanalMap.entries())
    .map(([channel, acc]) => ({ channel, label: SALE_CHANNEL_LABEL[channel] ?? channel, ...acc }))
    .sort((a, b) => b.pedidos - a.pedidos);

  // A coluna "Pedido" do painel público é ordenada só pelo número do pedido
  // (saleNumber), não por horário — pedidos sem número (ex.: sincronizados
  // antes desse campo existir) vão para o final.
  const recentes = [...vendasHoje]
    .sort((a, b) => (b.saleNumber ?? -1) - (a.saleNumber ?? -1))
    .slice(0, 30)
    .map((v) => ({
      id: v.id,
      saleNumber: v.saleNumber,
      customerName: v.customerName,
      district: v.district,
      dateTime: v.dateTime.toISOString(),
      valorTotal: v.valorTotal,
      channel: v.channel,
      channelLabel: SALE_CHANNEL_LABEL[v.channel] ?? v.channel,
      platform: v.platform,
      platformLabel: SALE_PLATFORM_LABEL[v.platform] ?? v.platform,
      formaPagamento: v.formaPagamento,
    }));

  return {
    syncedAt: now.toISOString(),
    integrado: integradas.length > 0,
    pedidosHoje,
    faturamentoHoje,
    ticketMedioHoje,
    recorde,
    porCanal,
    recentes,
    producaoDisponivel: false,
  };
}
