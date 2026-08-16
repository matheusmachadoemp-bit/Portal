import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { RelatoriosClient } from "./relatorios-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, bucketFrequencia, isReativacao, STATUS_LABEL, type ClienteStatus } from "@/lib/crm";
import { computeRfv } from "@/lib/rfv";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/crm";
import { startOfMonth, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type ReportDef = { key: string; title: string; description: string; headers: string[]; rows: (string | number)[][] };

export default async function RelatoriosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [clientes, campanhas, loyaltyAccounts, npsRespostas] = await Promise.all([
    loadClientesCompletos(empresaIds),
    prisma.campaign.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { createdAt: "desc" }, include: { _count: { select: { recipients: true } } } }),
    prisma.loyaltyAccount.findMany({ where: { empresaId: { in: empresaIds } }, include: { cliente: { select: { nome: true } } }, orderBy: { pontos: "desc" } }),
    prisma.npsResponse.findMany({ where: { empresaId: { in: empresaIds } }, include: { cliente: { select: { nome: true } } }, orderBy: { createdAt: "desc" } }),
  ]);

  const metrics = computeClienteMetrics(clientes);
  const comHistorico = metrics.filter((m) => m.pedidos > 0);
  const now = new Date();

  const statusOrder: ClienteStatus[] = ["VIP", "RECORRENTE", "ATIVO", "EM_RISCO", "INATIVO", "PERDIDO"];

  // Aquisição — novos clientes por mês (12 meses)
  const aquisicao: ReportDef = {
    key: "aquisicao",
    title: "Aquisição",
    description: "Novos clientes cadastrados por mês.",
    headers: ["Mês", "Novos clientes"],
    rows: Array.from({ length: 12 }, (_, idx) => {
      const mes = startOfMonth(subMonths(now, 11 - idx));
      const mesFim = startOfMonth(subMonths(now, 10 - idx));
      const count = clientes.filter((c) => c.createdAt >= mes && c.createdAt < mesFim).length;
      return [format(mes, "MMM/yy", { locale: ptBR }), count];
    }),
  };

  // Retenção
  const retencao: ReportDef = {
    key: "retencao",
    title: "Retenção",
    description: "Distribuição de clientes por status de retenção.",
    headers: ["Status", "Clientes", "% da base"],
    rows: statusOrder.map((s) => {
      const count = metrics.filter((m) => m.status === s).length;
      return [STATUS_LABEL[s], count, metrics.length ? `${((count / metrics.length) * 100).toFixed(1)}%` : "0%"];
    }),
  };

  // Churn
  const churn: ReportDef = {
    key: "churn",
    title: "Churn",
    description: "Clientes inativos ou perdidos e o valor histórico associado.",
    headers: ["Cliente", "Dias sem comprar", "Total gasto histórico", "Status"],
    rows: metrics
      .filter((m) => m.status === "INATIVO" || m.status === "PERDIDO")
      .sort((a, b) => (b.diasDesdeUltimaCompra ?? 0) - (a.diasDesdeUltimaCompra ?? 0))
      .map((m) => [m.nome, m.diasDesdeUltimaCompra ?? "-", m.totalGasto.toFixed(2), STATUS_LABEL[m.status]]),
  };

  // Recompra / Frequência
  const frequenciaBuckets = bucketFrequencia(metrics);
  const recompra: ReportDef = {
    key: "recompra",
    title: "Recompra",
    description: "Distribuição da base por frequência de recompra.",
    headers: ["Frequência", "Clientes"],
    rows: frequenciaBuckets.map((b) => [b.label, b.count]),
  };

  // LTV por status
  const ltv: ReportDef = {
    key: "ltv",
    title: "LTV",
    description: "Valor médio ao longo da vida do cliente (LTV), por status.",
    headers: ["Status", "Clientes", "LTV médio"],
    rows: statusOrder.map((s) => {
      const grupo = comHistorico.filter((m) => m.status === s);
      const media = grupo.length ? grupo.reduce((sum, m) => sum + m.totalGasto, 0) / grupo.length : 0;
      return [STATUS_LABEL[s], grupo.length, media.toFixed(2)];
    }),
  };

  // Frequência (dias médios) por status
  const frequenciaPorStatus: ReportDef = {
    key: "frequencia",
    title: "Frequência",
    description: "Frequência média de compra (dias entre pedidos), por status.",
    headers: ["Status", "Clientes", "Frequência média (dias)"],
    rows: statusOrder.map((s) => {
      const grupo = comHistorico.filter((m) => m.status === s && m.frequenciaMediaDias !== null);
      const media = grupo.length ? grupo.reduce((sum, m) => sum + (m.frequenciaMediaDias as number), 0) / grupo.length : null;
      return [STATUS_LABEL[s], grupo.length, media !== null ? media.toFixed(0) : "-"];
    }),
  };

  // Ticket médio por status
  const ticketMedio: ReportDef = {
    key: "ticket-medio",
    title: "Ticket médio",
    description: "Ticket médio de compra, por status.",
    headers: ["Status", "Ticket médio"],
    rows: statusOrder.map((s) => {
      const grupo = comHistorico.filter((m) => m.status === s);
      const media = grupo.length ? grupo.reduce((sum, m) => sum + m.ticketMedio, 0) / grupo.length : 0;
      return [STATUS_LABEL[s], media.toFixed(2)];
    }),
  };

  // Clientes VIP
  const vip: ReportDef = {
    key: "vip",
    title: "Clientes VIP",
    description: "Base completa de clientes classificados como VIP.",
    headers: ["Cliente", "Total gasto", "Pedidos", "Ticket médio"],
    rows: metrics
      .filter((m) => m.status === "VIP")
      .sort((a, b) => b.totalGasto - a.totalGasto)
      .map((m) => [m.nome, m.totalGasto.toFixed(2), m.pedidos, m.ticketMedio.toFixed(2)]),
  };

  // Clientes inativos
  const inativos: ReportDef = {
    key: "inativos",
    title: "Clientes inativos",
    description: "Clientes inativos ou perdidos, ordenados por tempo sem comprar.",
    headers: ["Cliente", "Dias sem comprar", "Total gasto histórico"],
    rows: metrics
      .filter((m) => m.status === "INATIVO" || m.status === "PERDIDO")
      .sort((a, b) => (b.diasDesdeUltimaCompra ?? 0) - (a.diasDesdeUltimaCompra ?? 0))
      .map((m) => [m.nome, m.diasDesdeUltimaCompra ?? "-", m.totalGasto.toFixed(2)]),
  };

  // Campanhas
  const campanhasReport: ReportDef = {
    key: "campanhas",
    title: "Campanhas",
    description: "Todas as campanhas criadas e seu alcance.",
    headers: ["Campanha", "Status", "Destinatários", "Criada em"],
    rows: campanhas.map((c) => [c.name, CAMPAIGN_STATUS_LABEL[c.status], c._count.recipients, format(c.createdAt, "dd/MM/yyyy")]),
  };

  // Fidelidade
  const fidelidade: ReportDef = {
    key: "fidelidade",
    title: "Fidelidade",
    description: "Saldo de pontos e cashback dos membros do Clube Nord.",
    headers: ["Cliente", "Pontos", "Cashback"],
    rows: loyaltyAccounts.map((a) => [a.cliente.nome, a.pontos, a.cashback.toFixed(2)]),
  };

  // NPS
  const nps: ReportDef = {
    key: "nps",
    title: "NPS",
    description: "Histórico completo de respostas de satisfação.",
    headers: ["Cliente", "Nota", "Status", "Data"],
    rows: npsRespostas.map((r) => [r.cliente?.nome ?? "-", r.nota, r.status, format(r.createdAt, "dd/MM/yyyy")]),
  };

  // RFM
  const rfvInputs = comHistorico.map((m) => ({
    clienteId: m.id,
    diasDesdeUltimaCompra: m.diasDesdeUltimaCompra ?? 999,
    frequencia: m.pedidos,
    valor: m.totalGasto,
  }));
  const rfvResult = computeRfv(rfvInputs);
  const rfvById = new Map(rfvResult.map((r) => [r.clienteId, r]));
  const rfm: ReportDef = {
    key: "rfm",
    title: "RFM",
    description: "Classificação RFM completa da base de clientes.",
    headers: ["Cliente", "Segmento", "Recência (score)", "Frequência (score)", "Valor (score)"],
    rows: comHistorico.map((m) => {
      const r = rfvById.get(m.id);
      return [m.nome, r?.segmento ?? "-", r?.scoreR ?? "-", r?.scoreF ?? "-", r?.scoreV ?? "-"];
    }),
  };

  // Receita recuperada — mensal
  const vendasOrdenadasPorCliente = new Map(clientes.map((c) => [c.id, [...c.vendas].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())]));
  const receitaRecuperada: ReportDef = {
    key: "receita-recuperada",
    title: "Receita recuperada",
    description: "Receita gerada por clientes reativados (que voltaram a comprar após ficarem inativos), por mês.",
    headers: ["Mês", "Receita recuperada"],
    rows: Array.from({ length: 12 }, (_, idx) => {
      const mes = startOfMonth(subMonths(now, 11 - idx));
      const mesFim = startOfMonth(subMonths(now, 10 - idx));
      let total = 0;
      for (const c of clientes) {
        const ordenadas = vendasOrdenadasPorCliente.get(c.id) ?? [];
        for (const v of ordenadas) {
          if (v.dateTime >= mes && v.dateTime < mesFim && isReativacao(ordenadas, v)) total += v.valorTotal;
        }
      }
      return [format(mes, "MMM/yy", { locale: ptBR }), total.toFixed(2)];
    }),
  };

  const reports = [
    aquisicao,
    retencao,
    churn,
    recompra,
    ltv,
    frequenciaPorStatus,
    ticketMedio,
    vip,
    inativos,
    campanhasReport,
    fidelidade,
    nps,
    rfm,
    receitaRecuperada,
  ];

  return (
    <PageContainer title="CRM" subtitle="Relatórios">
      <div className="space-y-6">
        <RelatoriosClient reports={reports} />
      </div>
    </PageContainer>
  );
}
