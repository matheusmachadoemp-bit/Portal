import { differenceInCalendarDays, differenceInCalendarYears, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";

export type CrmPeriodKey = "hoje" | "7dias" | "30dias" | "mes" | "90dias" | "12meses" | "personalizado";

export const CRM_PERIOD_OPTIONS: { key: CrmPeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "7 dias" },
  { key: "30dias", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "90dias", label: "90 dias" },
  { key: "12meses", label: "12 meses" },
  { key: "personalizado", label: "Personalizado" },
];

export function resolveCrmPeriod(
  key: CrmPeriodKey,
  custom?: { from?: string; to?: string },
  now: Date = new Date()
): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  switch (key) {
    case "hoje":
      return { from: startOfDay(now), to: endOfDay(now), prevFrom: startOfDay(subDays(now, 1)), prevTo: endOfDay(subDays(now, 1)) };
    case "7dias":
      return {
        from: startOfDay(subDays(now, 6)),
        to: endOfDay(now),
        prevFrom: startOfDay(subDays(now, 13)),
        prevTo: endOfDay(subDays(now, 7)),
      };
    case "30dias":
      return {
        from: startOfDay(subDays(now, 29)),
        to: endOfDay(now),
        prevFrom: startOfDay(subDays(now, 59)),
        prevTo: endOfDay(subDays(now, 30)),
      };
    case "90dias":
      return {
        from: startOfDay(subDays(now, 89)),
        to: endOfDay(now),
        prevFrom: startOfDay(subDays(now, 179)),
        prevTo: endOfDay(subDays(now, 90)),
      };
    case "12meses":
      return {
        from: startOfDay(subDays(now, 364)),
        to: endOfDay(now),
        prevFrom: startOfDay(subDays(now, 729)),
        prevTo: endOfDay(subDays(now, 365)),
      };
    case "personalizado":
      if (custom?.from && custom?.to) {
        const from = startOfDay(new Date(custom.from));
        const to = endOfDay(new Date(custom.to));
        const diff = to.getTime() - from.getTime();
        return { from, to, prevFrom: new Date(from.getTime() - diff), prevTo: new Date(from.getTime() - 1) };
      }
    case "mes":
    default:
      return {
        from: startOfMonth(now),
        to: endOfMonth(now),
        prevFrom: startOfMonth(subMonths(now, 1)),
        prevTo: endOfMonth(subMonths(now, 1)),
      };
  }
}

export type ClienteStatus = "VIP" | "RECORRENTE" | "ATIVO" | "EM_RISCO" | "INATIVO" | "PERDIDO";

export const STATUS_LABEL: Record<ClienteStatus, string> = {
  VIP: "VIP",
  RECORRENTE: "Recorrente",
  ATIVO: "Ativo",
  EM_RISCO: "Em risco",
  INATIVO: "Inativo",
  PERDIDO: "Perdido",
};

export const STATUS_TONE: Record<ClienteStatus, "default" | "success" | "warning" | "danger" | "info"> = {
  VIP: "info",
  RECORRENTE: "info",
  ATIVO: "success",
  EM_RISCO: "warning",
  INATIVO: "danger",
  PERDIDO: "default",
};

export const STATUS_DOT: Record<ClienteStatus, string> = {
  ATIVO: "#22c55e",
  RECORRENTE: "#2952E3",
  VIP: "#a855f7",
  EM_RISCO: "#f59e0b",
  INATIVO: "#ef4444",
  PERDIDO: "#6b7280",
};

export type VendaResumo = {
  id: string;
  dateTime: Date;
  valorTotal: number;
  channel?: string;
};

export type ClienteBase = {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  dataNascimento: Date | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  canalPreferido: string | null;
  createdAt: Date;
  empresaId: string;
};

export type ClienteMetrics = ClienteBase & {
  pedidos: number;
  totalGasto: number;
  ticketMedio: number;
  primeiraCompra: Date | null;
  ultimaCompra: Date | null;
  diasDesdeUltimaCompra: number | null;
  frequenciaMediaDias: number | null;
  status: ClienteStatus;
  ehNovo: boolean;
};

/** Percentil 75 simples de um array de números (para o corte de "alto ticket" / VIP). */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function classifyStatus(params: {
  pedidos: number;
  totalGasto: number;
  diasDesdeUltimaCompra: number | null;
  vipGastoThreshold: number;
}): ClienteStatus {
  const { pedidos, totalGasto, diasDesdeUltimaCompra, vipGastoThreshold } = params;
  if (pedidos === 0 || diasDesdeUltimaCompra === null) return "PERDIDO";
  if (diasDesdeUltimaCompra > 180) return "PERDIDO";
  if (diasDesdeUltimaCompra > 90) return "INATIVO";
  if (diasDesdeUltimaCompra > 45) return "EM_RISCO";
  if (pedidos >= 6 && totalGasto >= vipGastoThreshold && vipGastoThreshold > 0) return "VIP";
  if (pedidos >= 3) return "RECORRENTE";
  return "ATIVO";
}

/**
 * Calcula as métricas completas de cada cliente a partir do histórico de vendas.
 * O corte de VIP é o percentil 75 do gasto total entre clientes com pelo menos
 * uma compra — não existe um valor "oficial", então usamos a distribuição real
 * da base para se adaptar a cada loja.
 */
export function computeClienteMetrics(
  clientes: (ClienteBase & { vendas: VendaResumo[] })[],
  now: Date = new Date()
): ClienteMetrics[] {
  const totaisComHistorico = clientes
    .filter((c) => c.vendas.length > 0)
    .map((c) => c.vendas.reduce((sum, v) => sum + v.valorTotal, 0));
  const vipGastoThreshold = percentile(totaisComHistorico, 75);

  return clientes.map((c) => {
    const vendas = [...c.vendas].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const pedidos = vendas.length;
    const totalGasto = vendas.reduce((sum, v) => sum + v.valorTotal, 0);
    const ticketMedio = pedidos ? totalGasto / pedidos : 0;
    const primeiraCompra = vendas[0]?.dateTime ?? null;
    const ultimaCompra = vendas[pedidos - 1]?.dateTime ?? null;
    const diasDesdeUltimaCompra = ultimaCompra ? differenceInCalendarDays(now, ultimaCompra) : null;

    let frequenciaMediaDias: number | null = null;
    if (pedidos >= 2 && primeiraCompra && ultimaCompra) {
      frequenciaMediaDias = differenceInCalendarDays(ultimaCompra, primeiraCompra) / (pedidos - 1);
    }

    const status = classifyStatus({ pedidos, totalGasto, diasDesdeUltimaCompra, vipGastoThreshold });
    const ehNovo = primeiraCompra ? differenceInCalendarDays(now, primeiraCompra) <= 30 : false;

    return {
      ...c,
      pedidos,
      totalGasto,
      ticketMedio,
      primeiraCompra,
      ultimaCompra,
      diasDesdeUltimaCompra,
      frequenciaMediaDias,
      status,
      ehNovo,
    };
  });
}

export function frequenciaLabel(dias: number | null): string {
  if (dias === null) return "Sem histórico suficiente";
  if (dias <= 9) return "Semanal";
  if (dias <= 20) return "Quinzenal";
  if (dias <= 40) return "Mensal";
  if (dias <= 75) return "A cada 60 dias";
  return "Esporádica";
}

export function proximoAniversario(dataNascimento: Date, now: Date = new Date()): Date {
  const next = new Date(now.getFullYear(), dataNascimento.getMonth(), dataNascimento.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next.setFullYear(now.getFullYear() + 1);
  }
  return next;
}

export function idade(dataNascimento: Date, now: Date = new Date()): number {
  return differenceInCalendarYears(now, dataNascimento);
}

export type FunilStage = { key: string; label: string; count: number };

/**
 * Funil: Novos -> Segunda compra -> Recorrentes (3+) -> Fiéis (5+) -> VIP.
 * Calculado sobre a base completa de clientes com histórico de compras.
 */
export function computeFunil(clientes: ClienteMetrics[]): FunilStage[] {
  const comCompra = clientes.filter((c) => c.pedidos >= 1);
  const segundaCompra = clientes.filter((c) => c.pedidos >= 2);
  const recorrentes = clientes.filter((c) => c.pedidos >= 3);
  const fieis = clientes.filter((c) => c.pedidos >= 5);
  const vip = clientes.filter((c) => c.status === "VIP");

  return [
    { key: "novos", label: "Novos clientes", count: comCompra.length },
    { key: "segunda", label: "Segunda compra", count: segundaCompra.length },
    { key: "recorrentes", label: "Recorrentes", count: recorrentes.length },
    { key: "fieis", label: "Fiéis", count: fieis.length },
    { key: "vip", label: "VIP", count: vip.length },
  ];
}

export type SegmentCriteria = {
  clienteIds?: string[];
  lojas?: string[];
  produtos?: string[];
  minGasto?: number;
  maxGasto?: number;
  minPedidos?: number;
  maxPedidos?: number;
  semCompraDiasMin?: number;
  semCompraDiasMax?: number;
  status?: ClienteStatus[];
  ehNovo?: boolean;
  maxFrequenciaDias?: number;
};

export type MatchableCliente = Pick<
  ClienteMetrics,
  "id" | "empresaId" | "totalGasto" | "pedidos" | "diasDesdeUltimaCompra" | "status" | "ehNovo" | "frequenciaMediaDias"
>;

export function matchesCriteria(
  cliente: MatchableCliente,
  criteria: SegmentCriteria,
  produtosPorCliente?: Set<string>
): boolean {
  if (criteria.clienteIds && criteria.clienteIds.length > 0) {
    return criteria.clienteIds.includes(cliente.id);
  }
  if (criteria.lojas && criteria.lojas.length > 0 && !criteria.lojas.includes(cliente.empresaId)) return false;
  if (criteria.minGasto !== undefined && cliente.totalGasto < criteria.minGasto) return false;
  if (criteria.maxGasto !== undefined && cliente.totalGasto > criteria.maxGasto) return false;
  if (criteria.minPedidos !== undefined && cliente.pedidos < criteria.minPedidos) return false;
  if (criteria.maxPedidos !== undefined && cliente.pedidos > criteria.maxPedidos) return false;
  if (criteria.semCompraDiasMin !== undefined) {
    if (cliente.diasDesdeUltimaCompra === null || cliente.diasDesdeUltimaCompra < criteria.semCompraDiasMin) return false;
  }
  if (criteria.semCompraDiasMax !== undefined) {
    if (cliente.diasDesdeUltimaCompra === null || cliente.diasDesdeUltimaCompra > criteria.semCompraDiasMax) return false;
  }
  if (criteria.status && criteria.status.length > 0 && !criteria.status.includes(cliente.status)) return false;
  if (criteria.ehNovo !== undefined && cliente.ehNovo !== criteria.ehNovo) return false;
  if (criteria.maxFrequenciaDias !== undefined) {
    if (cliente.frequenciaMediaDias === null || cliente.frequenciaMediaDias > criteria.maxFrequenciaDias) return false;
  }
  if (criteria.produtos && criteria.produtos.length > 0) {
    if (!produtosPorCliente || !criteria.produtos.some((p) => produtosPorCliente.has(p))) return false;
  }
  return true;
}

export type Insight = {
  id: string;
  icon: string;
  tone: "danger" | "warning" | "info" | "success";
  title: string;
  description: string;
  action?: { label: string; href: string };
};

export function buildInsights(clientes: ClienteMetrics[]): Insight[] {
  const insights: Insight[] = [];

  const emRiscoOuInativo = clientes.filter(
    (c) => (c.status === "EM_RISCO" || c.status === "INATIVO") && (c.diasDesdeUltimaCompra ?? 0) > 45
  );
  if (emRiscoOuInativo.length > 0) {
    const receita = emRiscoOuInativo.reduce((s, c) => s + c.totalGasto, 0);
    const ticket = receita / emRiscoOuInativo.length;
    insights.push({
      id: "reativacao",
      icon: "AlertTriangle",
      tone: "danger",
      title: `${emRiscoOuInativo.length} clientes estão há mais de 45 dias sem comprar`,
      description: `Receita histórica desses clientes: ${formatCurrencyBRL(receita)} · Ticket médio: ${formatCurrencyBRL(ticket)}`,
      action: { label: "Criar campanha de reativação", href: "/portal/crm/campanhas/novo?segmento=inativos45" },
    });
  }

  const vipProximos = clientes.filter((c) => {
    if (c.status !== "VIP" || !c.frequenciaMediaDias || c.diasDesdeUltimaCompra === null) return false;
    return c.diasDesdeUltimaCompra >= c.frequenciaMediaDias * 0.8 && c.diasDesdeUltimaCompra <= c.frequenciaMediaDias * 1.2;
  });
  if (vipProximos.length > 0) {
    insights.push({
      id: "vip-proximos",
      icon: "Sparkles",
      tone: "info",
      title: `${vipProximos.length} clientes VIP estão próximos do período médio esperado para uma nova compra`,
      description: "Uma oferta personalizada agora pode antecipar a recompra e reforçar a fidelidade.",
      action: { label: "Criar campanha", href: "/portal/crm/campanhas/novo?segmento=vip-proximos" },
    });
  }

  const primeiraSemSegunda = clientes.filter((c) => c.pedidos === 1 && c.ehNovo);
  if (primeiraSemSegunda.length > 0) {
    insights.push({
      id: "segunda-compra",
      icon: "TrendingUp",
      tone: "success",
      title: "Clientes que realizam a segunda compra em até 15 dias apresentam maior recorrência",
      description: `${primeiraSemSegunda.length} novos clientes ainda não fizeram a segunda compra. Uma automação de incentivo pode aumentar a recorrência.`,
      action: { label: "Criar automação", href: "/portal/crm/automacoes?novo=segunda-compra" },
    });
  }

  const aumentandoFrequencia = clientes.filter(
    (c) => c.status === "RECORRENTE" && c.frequenciaMediaDias !== null && c.frequenciaMediaDias <= 20
  );
  if (aumentandoFrequencia.length > 0) {
    insights.push({
      id: "alta-frequencia",
      icon: "Rocket",
      tone: "success",
      title: `${aumentandoFrequencia.length} clientes compram com alta frequência`,
      description: "Considere incluí-los em uma campanha de fidelidade para reforçar o hábito de compra.",
      action: { label: "Ver clientes", href: "/portal/crm/clientes?status=RECORRENTE" },
    });
  }

  return insights;
}

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export type RiskBucket = { key: string; label: string; count: number; tone: "success" | "warning" | "danger" };

export function bucketRiskDistribution(clientes: ClienteMetrics[]): RiskBucket[] {
  let ativos = 0;
  let comecandoInativar = 0;
  let emRisco = 0;
  let inativos = 0;
  let perdidos = 0;

  for (const c of clientes) {
    if (c.pedidos === 0) continue;
    const dias = c.diasDesdeUltimaCompra ?? 9999;
    if (dias > 180) perdidos++;
    else if (dias > 90) inativos++;
    else if (dias > 60) emRisco++;
    else if (dias > 45) comecandoInativar++;
    else ativos++;
  }

  return [
    { key: "ativos", label: "Ativos", count: ativos, tone: "success" },
    { key: "comecando", label: "Começando a ficar inativos", count: comecandoInativar, tone: "warning" },
    { key: "risco", label: "Em risco", count: emRisco, tone: "warning" },
    { key: "inativos", label: "Inativos", count: inativos, tone: "danger" },
    { key: "perdidos", label: "Perdidos", count: perdidos, tone: "danger" },
  ];
}

export type FrequencyBucket = { key: string; label: string; count: number };

export function bucketFrequencia(clientes: ClienteMetrics[]): FrequencyBucket[] {
  const buckets: Record<string, number> = {
    Semanal: 0,
    Quinzenal: 0,
    Mensal: 0,
    "A cada 60 dias": 0,
    Esporádica: 0,
  };
  for (const c of clientes) {
    if (c.pedidos < 2) continue;
    const label = frequenciaLabel(c.frequenciaMediaDias);
    if (label in buckets) buckets[label]++;
  }
  return Object.entries(buckets).map(([label, count]) => ({ key: label, label, count }));
}

export type DashboardSummary = {
  totalClientes: number;
  clientesAtivosPeriodo: number;
  novosClientes: number;
  clientesRecorrentes: number;
  clientesReativados: number;
  clientesInativos: number;
  taxaRecompra: number;
  ticketMedio: number;
  frequenciaMedia: number | null;
  ltvMedio: number;
  receitaBase: number;
  receitaRecuperada: number;
};

function inPeriod(date: Date, from: Date, to: Date): boolean {
  return date >= from && date <= to;
}

/**
 * Reativado = cliente comprou dentro do período, mas a compra imediatamente
 * anterior (se houver) ocorreu há mais de 45 dias do início da compra atual —
 * ou seja, ele estava "em risco/inativo" e voltou a comprar.
 */
export function isReativacao(vendasOrdenadas: VendaResumo[], vendaAtual: VendaResumo): boolean {
  const idx = vendasOrdenadas.findIndex((v) => v.id === vendaAtual.id);
  if (idx <= 0) return false;
  const anterior = vendasOrdenadas[idx - 1];
  return differenceInCalendarDays(vendaAtual.dateTime, anterior.dateTime) > 45;
}

export function computeDashboardSummary(
  clientesComVendas: (ClienteBase & { vendas: VendaResumo[] })[],
  from: Date,
  to: Date,
  now: Date = new Date()
): DashboardSummary {
  const metrics = computeClienteMetrics(clientesComVendas, now);
  const metricsById = new Map(metrics.map((m) => [m.id, m]));

  let clientesAtivosPeriodo = 0;
  let novosClientes = 0;
  let clientesRecorrentes = 0;
  let clientesReativados = 0;
  let receitaBase = 0;
  let receitaRecuperada = 0;
  let vendasNoPeriodo = 0;

  for (const c of clientesComVendas) {
    const vendasOrdenadas = [...c.vendas].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const vendasPeriodo = vendasOrdenadas.filter((v) => inPeriod(v.dateTime, from, to));
    if (vendasPeriodo.length === 0) continue;

    clientesAtivosPeriodo++;
    vendasNoPeriodo += vendasPeriodo.length;
    const receitaCliente = vendasPeriodo.reduce((s, v) => s + v.valorTotal, 0);
    receitaBase += receitaCliente;

    const metric = metricsById.get(c.id);
    if (metric && (metric.pedidos ?? 0) >= 2) clientesRecorrentes++;
    if (inPeriod(c.createdAt, from, to)) novosClientes++;

    const reativou = vendasPeriodo.some((v) => isReativacao(vendasOrdenadas, v));
    if (reativou) {
      clientesReativados++;
      receitaRecuperada += receitaCliente;
    }
  }

  const clientesInativos = metrics.filter((m) => m.status === "INATIVO" || m.status === "PERDIDO").length;
  const comHistorico = metrics.filter((m) => m.pedidos > 0);
  const frequencias = comHistorico.filter((m) => m.frequenciaMediaDias !== null).map((m) => m.frequenciaMediaDias as number);
  const frequenciaMedia = frequencias.length ? frequencias.reduce((s, v) => s + v, 0) / frequencias.length : null;
  const ltvMedio = comHistorico.length ? comHistorico.reduce((s, m) => s + m.totalGasto, 0) / comHistorico.length : 0;

  return {
    totalClientes: clientesComVendas.length,
    clientesAtivosPeriodo,
    novosClientes,
    clientesRecorrentes,
    clientesReativados,
    clientesInativos,
    taxaRecompra: clientesAtivosPeriodo ? (clientesRecorrentes / clientesAtivosPeriodo) * 100 : 0,
    ticketMedio: vendasNoPeriodo ? receitaBase / vendasNoPeriodo : 0,
    frequenciaMedia,
    ltvMedio,
    receitaBase,
    receitaRecuperada,
  };
}

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function topEntry(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export type VendaComItens = {
  dateTime: Date;
  channel?: string | null;
  platform?: string | null;
  items: { nome: string; categoria?: string | null; quantidade: number }[];
};

export type ClientePreferencias = {
  produtoFavorito: string | null;
  categoriaFavorita: string | null;
  canalFavorito: string | null;
  plataformaFavorita: string | null;
  diaFavorito: string | null;
  horarioFavorito: string | null;
};

export function computePreferencias(vendas: VendaComItens[]): ClientePreferencias {
  const produtos = new Map<string, number>();
  const categorias = new Map<string, number>();
  const canais = new Map<string, number>();
  const plataformas = new Map<string, number>();
  const dias = new Map<string, number>();
  const horarios = new Map<string, number>();

  for (const v of vendas) {
    if (v.channel) canais.set(v.channel, (canais.get(v.channel) ?? 0) + 1);
    if (v.platform) plataformas.set(v.platform, (plataformas.get(v.platform) ?? 0) + 1);
    dias.set(DIAS_SEMANA[v.dateTime.getDay()], (dias.get(DIAS_SEMANA[v.dateTime.getDay()]) ?? 0) + 1);
    const hour = v.dateTime.getHours();
    const bucket = hour < 11 ? "Manhã (até 11h)" : hour < 15 ? "Almoço (11h-15h)" : hour < 18 ? "Tarde (15h-18h)" : hour < 22 ? "Jantar (18h-22h)" : "Madrugada";
    horarios.set(bucket, (horarios.get(bucket) ?? 0) + 1);
    for (const item of v.items) {
      produtos.set(item.nome, (produtos.get(item.nome) ?? 0) + item.quantidade);
      if (item.categoria) categorias.set(item.categoria, (categorias.get(item.categoria) ?? 0) + item.quantidade);
    }
  }

  return {
    produtoFavorito: topEntry(produtos),
    categoriaFavorita: topEntry(categorias),
    canalFavorito: topEntry(canais),
    plataformaFavorita: topEntry(plataformas),
    diaFavorito: topEntry(dias),
    horarioFavorito: topEntry(horarios),
  };
}

export type AutoSegment = {
  key: string;
  name: string;
  description: string;
  count: number;
  receita: number;
  ticketMedio: number;
  criteria: SegmentCriteria;
};

function summarize(
  key: string,
  name: string,
  description: string,
  matched: ClienteMetrics[],
  criteria: SegmentCriteria
): AutoSegment {
  const receita = matched.reduce((s, c) => s + c.totalGasto, 0);
  return { key, name, description, count: matched.length, receita, ticketMedio: matched.length ? receita / matched.length : 0, criteria };
}

/**
 * Segmentos automáticos padrão do CRM (seção 8 do módulo). "Recorrentes" usa
 * as vendas dos últimos 60 dias (não o total histórico) para refletir
 * atividade recente, conforme a definição do produto.
 */
export function computeAutoSegments(
  clientesComVendas: (ClienteBase & { vendas: VendaResumo[] })[],
  metrics: ClienteMetrics[],
  now: Date = new Date()
): AutoSegment[] {
  const metricsById = new Map(metrics.map((m) => [m.id, m]));
  const recorrentes60d = clientesComVendas.filter((c) => {
    const compras60d = c.vendas.filter((v) => differenceInCalendarDays(now, v.dateTime) <= 60).length;
    return compras60d >= 3;
  });
  const comHistorico = metrics.filter((m) => m.pedidos > 0);
  const ticketAlto = percentile(comHistorico.map((m) => m.ticketMedio), 75);

  return [
    summarize("novos", "Novos clientes", "Primeira compra nos últimos 30 dias.", metrics.filter((m) => m.ehNovo), { ehNovo: true }),
    summarize(
      "recorrentes",
      "Recorrentes",
      "3 ou mais compras nos últimos 60 dias.",
      recorrentes60d.map((c) => metricsById.get(c.id)).filter((m): m is ClienteMetrics => !!m),
      { minPedidos: 3, semCompraDiasMax: 60 }
    ),
    summarize("vip", "VIP", "Alta frequência e alto gasto.", metrics.filter((m) => m.status === "VIP"), { status: ["VIP"] }),
    summarize("em-risco", "Em risco", "Frequência de compra começou a cair.", metrics.filter((m) => m.status === "EM_RISCO"), { status: ["EM_RISCO"] }),
    summarize("inativos-30", "Inativos 30 dias", "Sem comprar há 30 dias ou mais.", metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 30), { semCompraDiasMin: 30 }),
    summarize("inativos-60", "Inativos 60 dias", "Sem comprar há 60 dias ou mais.", metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 60), { semCompraDiasMin: 60 }),
    summarize("inativos-90", "Inativos 90 dias", "Sem comprar há 90 dias ou mais.", metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 90), { semCompraDiasMin: 90 }),
    summarize("inativos-180", "Inativos 180 dias", "Sem comprar há 180 dias ou mais.", metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 180), { semCompraDiasMin: 180 }),
    summarize("alto-ticket", "Alto ticket", "Ticket médio acima do percentil 75 da base.", comHistorico.filter((m) => m.ticketMedio >= ticketAlto && ticketAlto > 0), { minGasto: Math.round(ticketAlto) }),
    summarize("alta-frequencia", "Alta frequência", "Compram semanalmente ou quinzenalmente.", metrics.filter((m) => m.frequenciaMediaDias !== null && m.frequenciaMediaDias <= 20), { maxFrequenciaDias: 20 }),
  ];
}

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AGENDADA: "Agendada",
  ENVIADA: "Enviada",
  CONCLUIDA: "Concluída",
};

export const CAMPAIGN_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  RASCUNHO: "default",
  AGENDADA: "warning",
  ENVIADA: "success",
  CONCLUIDA: "info",
};

export const CAMPAIGN_CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-mail",
  PUSH: "Push notification",
};

export const CAMPAIGN_OFFER_LABEL: Record<string, string> = {
  CUPOM: "Cupom",
  DESCONTO_PERCENTUAL: "Desconto %",
  DESCONTO_VALOR: "Desconto em R$",
  PRODUTO_GRATIS: "Produto grátis",
  CASHBACK: "Cashback",
  PONTOS: "Pontos",
  SEM_OFERTA: "Sem oferta",
};

export type AutomationTriggerKey =
  | "PRIMEIRA_COMPRA"
  | "SEGUNDA_COMPRA"
  | "INATIVO_30"
  | "INATIVO_60"
  | "INATIVO_90"
  | "ANIVERSARIO"
  | "CLIENTE_VIP"
  | "POS_VENDA"
  | "AVALIACAO"
  | "RECUPERACAO";

export const AUTOMATION_TEMPLATES: {
  trigger: AutomationTriggerKey;
  name: string;
  icon: string;
  description: string;
  waitDays: number;
  message: string;
}[] = [
  {
    trigger: "PRIMEIRA_COMPRA",
    name: "Boas-vindas após primeira compra",
    icon: "PartyPopper",
    description: "Cliente realizou a primeira compra.",
    waitDays: 3,
    message: "Olá {{nome}}, obrigado pela primeira compra! Esperamos que tenha gostado 😊",
  },
  {
    trigger: "SEGUNDA_COMPRA",
    name: "Incentivo para segunda compra",
    icon: "Rocket",
    description: "Cliente novo ainda não fez a segunda compra.",
    waitDays: 10,
    message: "Oi {{nome}}! Que tal voltar para pedir de novo? Preparamos uma condição especial para você.",
  },
  {
    trigger: "INATIVO_30",
    name: "30 dias sem comprar",
    icon: "Clock",
    description: "Cliente está há 30 dias sem comprar.",
    waitDays: 0,
    message: "Sentimos sua falta, {{nome}}! Volte e aproveite um benefício especial.",
  },
  {
    trigger: "INATIVO_60",
    name: "60 dias sem comprar",
    icon: "AlertTriangle",
    description: "Cliente está há 60 dias sem comprar.",
    waitDays: 0,
    message: "{{nome}}, já faz um tempo que não te vemos por aqui. Preparamos uma oferta para o seu retorno.",
  },
  {
    trigger: "INATIVO_90",
    name: "90 dias sem comprar",
    icon: "UserX",
    description: "Cliente está há 90 dias sem comprar.",
    waitDays: 0,
    message: "{{nome}}, temos uma oferta exclusiva de recuperação esperando por você.",
  },
  {
    trigger: "ANIVERSARIO",
    name: "Aniversário do cliente",
    icon: "Cake",
    description: "Dispara na data de aniversário do cliente.",
    waitDays: 0,
    message: "Feliz aniversário, {{nome}}! 🎉 Um presente especial está te esperando.",
  },
  {
    trigger: "CLIENTE_VIP",
    name: "Cliente atingiu status VIP",
    icon: "Crown",
    description: "Cliente passou a ser classificado como VIP.",
    waitDays: 0,
    message: "{{nome}}, você agora é um cliente VIP! Preparamos benefícios exclusivos para você.",
  },
  {
    trigger: "POS_VENDA",
    name: "Pós-venda",
    icon: "MessageCircle",
    description: "Enviado após cada pedido para reforçar o relacionamento.",
    waitDays: 1,
    message: "Oi {{nome}}, tudo certo com seu pedido? Estamos à disposição!",
  },
  {
    trigger: "AVALIACAO",
    name: "Pedido de avaliação",
    icon: "Star",
    description: "Solicita avaliação/NPS após o pedido.",
    waitDays: 1,
    message: "{{nome}}, o que achou do seu pedido? Deixe sua avaliação e nos ajude a melhorar!",
  },
  {
    trigger: "RECUPERACAO",
    name: "Recuperação de cliente",
    icon: "HeartHandshake",
    description: "Clientes em risco ou inativos com histórico relevante.",
    waitDays: 0,
    message: "{{nome}}, queremos você de volta! Confira uma condição especial preparada para você.",
  },
];

export const AUTOMATION_ACTION_LABEL: Record<string, string> = {
  MENSAGEM: "Enviar mensagem",
  TAG: "Marcar cliente",
  OFERTA: "Enviar oferta",
};

export function computeAutomationMatchCount(trigger: AutomationTriggerKey, metrics: ClienteMetrics[]): number {
  switch (trigger) {
    case "PRIMEIRA_COMPRA":
      return metrics.filter((m) => m.pedidos === 1).length;
    case "SEGUNDA_COMPRA":
      return metrics.filter((m) => m.pedidos === 1 && m.ehNovo).length;
    case "INATIVO_30":
      return metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 30 && (m.diasDesdeUltimaCompra ?? -1) < 60).length;
    case "INATIVO_60":
      return metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 60 && (m.diasDesdeUltimaCompra ?? -1) < 90).length;
    case "INATIVO_90":
      return metrics.filter((m) => (m.diasDesdeUltimaCompra ?? -1) >= 90).length;
    case "ANIVERSARIO": {
      const now = new Date();
      return metrics.filter((m) => m.dataNascimento && m.dataNascimento.getMonth() === now.getMonth() && m.dataNascimento.getDate() === now.getDate()).length;
    }
    case "CLIENTE_VIP":
      return metrics.filter((m) => m.status === "VIP").length;
    case "POS_VENDA":
      return metrics.filter((m) => m.diasDesdeUltimaCompra !== null && m.diasDesdeUltimaCompra <= 7).length;
    case "AVALIACAO":
      return metrics.filter((m) => m.diasDesdeUltimaCompra !== null && m.diasDesdeUltimaCompra <= 7).length;
    case "RECUPERACAO":
      return metrics.filter((m) => m.status === "EM_RISCO" || m.status === "INATIVO").length;
    default:
      return 0;
  }
}

export const RFM_GROUP_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  Campeões: "success",
  Fiéis: "success",
  "Potenciais fiéis": "info",
  Novos: "info",
  Promissores: "default",
  "Precisam de atenção": "warning",
  "Em risco": "warning",
  "Não podemos perder": "danger",
  Inativos: "danger",
};
