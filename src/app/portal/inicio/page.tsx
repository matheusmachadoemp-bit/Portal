import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { SortableStatCards, type SortableStatCardConfig } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatNumber, formatPercent, growth, pct, safeDiv } from "@/lib/calc";
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DashboardCharts } from "./charts";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Store } from "lucide-react";
import { StoreSwitcher } from "@/components/sidebar/store-switcher";
import { empresaIdsForContext, getActiveEmpresaContext, GRUPO_SENTINEL, type EmpresaSummary } from "@/lib/empresa";
import { perfilInicioForRole, perfilPodeVerPainelGerencial } from "@/lib/inicio";
import { GerencialDashboardClient } from "./gerencial-dashboard-client";

// ---------------------------------------------------------------------------
// Saudação fixa (não varia por horário) usada como título da Tela de Início
// gerencial.
// ---------------------------------------------------------------------------

function saudacaoPara(nomeCompleto: string): string {
  const primeiroNome = nomeCompleto.trim().split(/\s+/)[0] || nomeCompleto;
  return `Bem-vindo(a) de volta, ${primeiroNome}`;
}

const SUBTITULO_INICIO = "Veja o resumo da sua operação e suas prioridades de hoje.";

/**
 * Painel novo (indicadores + desempenho da loja) — só para Proprietário e
 * Gerente, uma loja por vez. "Grupo Nord (consolidado)" não é suportado
 * aqui: se o usuário estiver nesse modo, pedimos para escolher uma loja.
 */
async function InicioGerencial({ userName }: { userName: string }) {
  const ctx = await getActiveEmpresaContext();
  const title = saudacaoPara(userName);

  if (!ctx || ctx.mode === "grupo") {
    return (
      <PageContainer title={title} subtitle={SUBTITULO_INICIO}>
        <div className="nord-card p-10 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-nord-blue/15 flex items-center justify-center">
            <Store size={26} className="text-nord-blue-light" />
          </div>
          <div>
            <p className="text-white font-medium text-base mb-1">Escolha uma loja para ver o painel</p>
            <p className="text-nord-gray text-sm max-w-md mx-auto">
              Este painel mostra os indicadores de uma loja por vez e não compara lojas entre si. Você está no
              modo &quot;Grupo Nord (consolidado)&quot; — selecione uma loja abaixo para continuar.
            </p>
          </div>
          {ctx && ctx.empresas.length > 0 && (
            <div className="w-full max-w-xs">
              <StoreSwitcher
                empresas={ctx.empresas}
                activeEmpresaId={GRUPO_SENTINEL}
                canViewGrupoNord={ctx.canViewGrupoNord}
                collapsed={false}
              />
            </div>
          )}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={title} subtitle={SUBTITULO_INICIO}>
      <GerencialDashboardClient
        empresaId={ctx.empresa.id}
        empresas={ctx.empresas}
        canViewGrupoNord={ctx.canViewGrupoNord}
      />
    </PageContainer>
  );
}

export default async function InicioPage() {
  const session = await auth();
  const perfil = session?.user ? perfilInicioForRole(session.user.role) : "COLABORADOR";

  if (session?.user && perfilPodeVerPainelGerencial(perfil)) {
    const userName = session.user.name?.trim() || session.user.email || "usuário";
    return <InicioGerencial userName={userName} />;
  }

  return <InicioClassico userId={session?.user?.id ?? null} />;
}

// ---------------------------------------------------------------------------
// Painel clássico (Líder/Colaborador) — cada card/seção abaixo só é buscado
// e mostrado se o usuário logado tiver `canView` no módulo correspondente
// (ver `InicioClassicoPerms`/`resolveInicioClassicoPerms` logo abaixo), pelo
// mesmo sistema de Perfis de Permissão já usado em ~15 outras áreas do
// Portal (Financeiro, Vendas, Metas, Estoque, RH, etc. — ver
// `hasModulePermission`, src/lib/authz.ts).
//
// Até 2026-09-12 esta tela ignorava esse sistema por completo: qualquer
// perfil que caísse aqui (Líder OU Colaborador comum) via o mesmo compilado
// financeiro/comercial da empresa inteira que o painel gerencial mostra ao
// Proprietário/Gerente — corrigido depois que um usuário `COLABORADOR` sem
// nenhum acesso a Vendas/Financeiro reportou ver faturamento, ticket médio,
// meta e ROAS da empresa toda na própria Tela de Início.
// ---------------------------------------------------------------------------

type InicioClassicoPerms = {
  /** Faturamento, pedidos, ticket médio, meta mensal e taxa de serviço (SalesEntry) — módulo "vendas". */
  vendas: boolean;
  /** Faltas/atrasos (Occurrence) — módulo "rh". */
  rh: boolean;
  /** ROAS de tráfego pago (MarketingEntry) — módulo "marketing". */
  marketing: boolean;
  /** Metas próximas do vencimento (Goal) — módulo "metas". */
  metas: boolean;
  /** Atalho "Atualizar ficha técnica" — módulo "ficha-tecnica" (não busca dado nenhum nesta tela, só o link). */
  fichaTecnica: boolean;
};

/**
 * Resolve, por módulo, se o usuário logado pode ver os dados que o painel
 * clássico mostra. Usa só o nível de módulo inteiro (sem subcategoria: a
 * tela de Permissões, em `permissoes-client.tsx`, só edita
 * Ver/Executar/Criar/Editar/Excluir por módulo — não existe hoje nenhuma
 * forma de configurar uma subcategoria como "vendas:faturamento" ou
 * "rh:ocorrencias" separadamente, então checar por subcategoria aqui seria
 * uma precisão que a UI de Permissões nem oferece).
 *
 * Sem `userId` (sem sessão — não deveria acontecer: `src/app/portal/layout.tsx`
 * já redireciona para /login antes de qualquer página do portal renderizar),
 * nega tudo por padrão — mesma postura "fail closed" já adotada pelo resto
 * do sistema de permissões (ver comentário sobre a correção de 2026-09-09 em
 * `hasModulePermission`, src/lib/authz.ts).
 */
async function resolveInicioClassicoPerms(userId: string | null): Promise<InicioClassicoPerms> {
  if (!userId) {
    return { vendas: false, rh: false, marketing: false, metas: false, fichaTecnica: false };
  }

  const [vendas, rh, marketing, metas, fichaTecnica] = await Promise.all([
    hasModulePermission(userId, "vendas", "canView"),
    hasModulePermission(userId, "rh", "canView"),
    hasModulePermission(userId, "marketing", "canView"),
    hasModulePermission(userId, "metas", "canView"),
    hasModulePermission(userId, "ficha-tecnica", "canView"),
  ]);
  return { vendas, rh, marketing, metas, fichaTecnica };
}

async function getData(
  empresaIds: string[],
  perms: Pick<InicioClassicoPerms, "vendas" | "rh" | "marketing" | "metas">
) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const monthEntrySelect = {
    date: true,
    faturamentoDelivery: true,
    faturamentoSalao: true,
    pedidosDelivery: true,
    pedidosBalcao: true,
    pedidosSalao: true,
    metaDiaria: true,
    taxaServicoValor: true,
  } as const;

  // Cada consulta abaixo só roda se `perms` liberar o módulo dono daquele
  // dado — sem permissão, a linha correspondente do Promise.all nem chega a
  // ir ao banco (`Promise.resolve([])`), em vez de buscar e só esconder na
  // hora de renderizar.
  const [thisMonth, prevMonth, occurrences, marketing, goals] = await Promise.all([
    perms.vendas
      ? prisma.salesEntry.findMany({
          where: { empresaId: { in: empresaIds }, date: { gte: monthStart, lte: monthEnd } },
          select: monthEntrySelect,
        })
      : Promise.resolve([]),
    perms.vendas
      ? prisma.salesEntry.findMany({
          where: { empresaId: { in: empresaIds }, date: { gte: prevMonthStart, lte: prevMonthEnd } },
          select: {
            faturamentoDelivery: true,
            faturamentoSalao: true,
            pedidosDelivery: true,
            pedidosBalcao: true,
            pedidosSalao: true,
          },
        })
      : Promise.resolve([]),
    perms.rh
      ? prisma.occurrence.findMany({
          where: { date: { gte: monthStart, lte: monthEnd }, employee: { empresaId: { in: empresaIds } } },
          select: { type: true },
        })
      : Promise.resolve([]),
    perms.marketing
      ? prisma.marketingEntry.findMany({
          where: { empresaId: { in: empresaIds } },
          orderBy: { date: "desc" },
          take: 1,
          select: { receitaTrafego: true, investimentoTrafego: true },
        })
      : Promise.resolve([]),
    perms.metas
      ? prisma.goal.findMany({
          where: { empresaId: { in: empresaIds }, endDate: { gte: now } },
          orderBy: { endDate: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const sum = <T extends Record<string, unknown>>(arr: T[], key: keyof T) =>
    arr.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);

  const fatMes = sum(thisMonth, "faturamentoDelivery") + sum(thisMonth, "faturamentoSalao");
  const fatMesAnterior = sum(prevMonth, "faturamentoDelivery") + sum(prevMonth, "faturamentoSalao");
  // "Hoje" está sempre dentro do mês corrente — em vez de uma 3ª consulta,
  // reaproveita as linhas de `thisMonth` (já tem `date`) filtrando em memória.
  const todayEntries = thisMonth.filter((e) => e.date >= todayStart && e.date <= todayEnd);
  const fatHoje = sum(todayEntries, "faturamentoDelivery") + sum(todayEntries, "faturamentoSalao");

  const pedidosMes =
    sum(thisMonth, "pedidosDelivery") + sum(thisMonth, "pedidosBalcao") + sum(thisMonth, "pedidosSalao");
  const pedidosMesAnterior =
    sum(prevMonth, "pedidosDelivery") + sum(prevMonth, "pedidosBalcao") + sum(prevMonth, "pedidosSalao");

  const metaMensal = thisMonth.reduce((acc, e) => acc + e.metaDiaria, 0) || 130000;
  const ticketMedio = safeDiv(fatMes, pedidosMes);
  const fatDelivery = sum(thisMonth, "faturamentoDelivery");
  const fatSalao = sum(thisMonth, "faturamentoSalao");
  const taxaServico = sum(thisMonth, "taxaServicoValor");
  const taxaServicoPct = pct(taxaServico, fatSalao);

  const faltas = occurrences.filter((o) => o.type === "FALTA").length;
  const atrasos = occurrences.filter((o) => o.type === "ATRASO").length;

  const mkt = marketing[0];
  const roas = mkt ? safeDiv(mkt.receitaTrafego, mkt.investimentoTrafego) : 0;

  const dailySeries = thisMonth
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => ({
      date: format(e.date, "dd/MM"),
      total: e.faturamentoDelivery + e.faturamentoSalao,
      delivery: e.faturamentoDelivery,
      salao: e.faturamentoSalao,
    }));

  const channelData = [
    { name: "Delivery", value: fatDelivery },
    { name: "Salão", value: fatSalao },
  ];

  const monthlyRanges = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    return { start: startOfMonth(subMonths(now, i)), end: endOfMonth(subMonths(now, i)) };
  });
  // O último range é sempre o mês corrente (mesma janela de `thisMonth`,
  // já carregado acima) — reaproveita `fatMes` em vez de refazer essa
  // consulta, e busca os 5 meses anteriores numa única query (em vez de uma
  // consulta por mês) para depois separar por mês em memória. Só roda se
  // `perms.vendas` liberar — é a mesma consulta de SalesEntry das demais
  // acima.
  const priorRanges = monthlyRanges.slice(0, -1);
  const priorEntries =
    perms.vendas && priorRanges.length
      ? await prisma.salesEntry.findMany({
          where: {
            empresaId: { in: empresaIds },
            date: { gte: priorRanges[0].start, lte: priorRanges[priorRanges.length - 1].end },
          },
          select: { date: true, faturamentoDelivery: true, faturamentoSalao: true },
        })
      : [];
  const totalByMonthKey = new Map<string, number>();
  for (const e of priorEntries) {
    const key = format(e.date, "yyyy-MM");
    totalByMonthKey.set(key, (totalByMonthKey.get(key) ?? 0) + e.faturamentoDelivery + e.faturamentoSalao);
  }
  const monthlyEvolution = monthlyRanges.map(({ start }, idx) => ({
    month: format(start, "MMM", { locale: ptBR }),
    total: idx === monthlyRanges.length - 1 ? fatMes : totalByMonthKey.get(format(start, "yyyy-MM")) ?? 0,
  }));

  return {
    fatMes,
    fatMesAnterior,
    fatHoje,
    pedidosMes,
    metaMensal,
    ticketMedio,
    fatDelivery,
    fatSalao,
    taxaServicoPct,
    faltas,
    atrasos,
    roas,
    goals,
    dailySeries,
    channelData,
    monthlyEvolution,
    pedidosGrowth: growth(pedidosMes, pedidosMesAnterior),
  };
}

/**
 * Uma linha por loja da tabela "Comparativo entre lojas" (modo Grupo Nord).
 * Antes fazia 2 consultas (SalesEntry + Occurrence) POR loja, em paralelo —
 * mesmo resultado, mas com uma consulta de cada por loja em vez de duas no
 * total, buscando todas as lojas de uma vez e separando por `empresaId` em
 * memória.
 *
 * Só é chamada quando `perms.vendas` já liberou (ver `InicioClassico`) — a
 * consulta de Occurrence (coluna "Faltas") ainda assim respeita `perms.rh`
 * separadamente, pulando o banco quando não liberado.
 */
async function getComparisonRows(empresas: EmpresaSummary[], perms: Pick<InicioClassicoPerms, "rh">) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const empresaIds = empresas.map((e) => e.id);

  const [entries, occurrences] = await Promise.all([
    prisma.salesEntry.findMany({
      where: { empresaId: { in: empresaIds }, date: { gte: monthStart, lte: monthEnd } },
      select: {
        empresaId: true,
        faturamentoDelivery: true,
        faturamentoSalao: true,
        pedidosDelivery: true,
        pedidosBalcao: true,
        pedidosSalao: true,
        metaDiaria: true,
      },
    }),
    perms.rh
      ? prisma.occurrence.findMany({
          where: { date: { gte: monthStart, lte: monthEnd }, employee: { empresaId: { in: empresaIds } }, type: "FALTA" },
          select: { employee: { select: { empresaId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const entriesByEmpresa = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByEmpresa.get(e.empresaId) ?? [];
    list.push(e);
    entriesByEmpresa.set(e.empresaId, list);
  }
  const faltasByEmpresa = new Map<string, number>();
  for (const o of occurrences) {
    const key = o.employee.empresaId;
    faltasByEmpresa.set(key, (faltasByEmpresa.get(key) ?? 0) + 1);
  }

  return empresas.map((empresa) => {
    const thisMonth = entriesByEmpresa.get(empresa.id) ?? [];
    const fatMes = thisMonth.reduce((a, e) => a + e.faturamentoDelivery + e.faturamentoSalao, 0);
    const pedidosMes = thisMonth.reduce((a, e) => a + e.pedidosDelivery + e.pedidosBalcao + e.pedidosSalao, 0);
    const metaMensal = thisMonth.reduce((a, e) => a + e.metaDiaria, 0) || 0;

    return {
      empresa,
      fatMes,
      pedidosMes,
      ticketMedio: safeDiv(fatMes, pedidosMes),
      metaMensal,
      percentualMeta: pct(fatMes, metaMensal),
      faltas: faltasByEmpresa.get(empresa.id) ?? 0,
    };
  });
}

/**
 * Classe do grid de KPIs — varia com a quantidade de cards que sobram
 * depois do filtro de permissão (um perfil com menos acesso vê menos cards
 * e não deveria ficar com metade da tela vazia num grid pensado pra 12).
 * Strings literais de propósito (nunca interpoladas): o Tailwind só gera a
 * classe se ela aparecer no código de forma estática.
 */
function statsGridClassName(count: number): string {
  if (count <= 2) return "grid grid-cols-1 sm:grid-cols-2 gap-4";
  if (count <= 3) return "grid grid-cols-1 sm:grid-cols-3 gap-4";
  if (count <= 4) return "grid grid-cols-2 md:grid-cols-4 gap-4";
  if (count <= 6) return "grid grid-cols-2 md:grid-cols-3 gap-4";
  return "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4";
}

/** Mesma ideia de `statsGridClassName`, para o grid de atalhos ("ações rápidas"). */
function quickActionsGridClassName(count: number): string {
  if (count <= 1) return "grid grid-cols-1 gap-4";
  if (count === 2) return "grid grid-cols-1 sm:grid-cols-2 gap-4";
  if (count === 3) return "grid grid-cols-1 sm:grid-cols-3 gap-4";
  return "grid grid-cols-1 md:grid-cols-4 gap-4";
}

type ClassicCardModule = "vendas" | "rh" | "marketing";
type ClassicActionModule = "vendas" | "metas" | "rh" | "fichaTecnica";

async function InicioClassico({ userId }: { userId: string | null }) {
  const perms = await resolveInicioClassicoPerms(userId);
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const d = await getData(empresaIds, perms);
  const percentualMeta = pct(d.fatMes, d.metaMensal);
  const abaixoDaMeta = percentualMeta < 70;
  const subtitle =
    ctx?.mode === "single" ? `Visão geral da ${ctx.empresa.name}` : "Visão geral consolidada — Grupo Nord";

  const comparison =
    ctx?.mode === "grupo" && perms.vendas ? await getComparisonRows(ctx.empresas, perms) : null;

  const allCards: Array<SortableStatCardConfig & { requires: ClassicCardModule }> = [
    {
      key: "faturamento-mes",
      requires: "vendas",
      label: "Faturamento do mês",
      value: formatCurrency(d.fatMes),
      icon: "DollarSign",
      delta: growth(d.fatMes, d.fatMesAnterior),
    },
    { key: "faturamento-dia", requires: "vendas", label: "Faturamento do dia", value: formatCurrency(d.fatHoje), icon: "Calendar" },
    { key: "meta-mensal", requires: "vendas", label: "Meta mensal", value: formatCurrency(d.metaMensal), icon: "Target" },
    {
      key: "percentual-meta",
      requires: "vendas",
      label: "% da meta atingida",
      value: formatPercent(percentualMeta),
      icon: "TrendingUp",
      color: abaixoDaMeta ? "#ef4444" : "#22c55e",
    },
    { key: "ticket-medio", requires: "vendas", label: "Ticket médio", value: formatCurrency(d.ticketMedio), icon: "Receipt" },
    {
      key: "pedidos-realizados",
      requires: "vendas",
      label: "Pedidos realizados",
      value: formatNumber(d.pedidosMes),
      icon: "ShoppingBag",
      delta: d.pedidosGrowth,
    },
    { key: "faturamento-salao", requires: "vendas", label: "Faturamento salão", value: formatCurrency(d.fatSalao), icon: "Utensils" },
    { key: "faturamento-delivery", requires: "vendas", label: "Faturamento delivery", value: formatCurrency(d.fatDelivery), icon: "Bike" },
    { key: "taxa-servico", requires: "vendas", label: "Taxa de serviço", value: formatPercent(d.taxaServicoPct), icon: "Percent" },
    { key: "faltas-mes", requires: "rh", label: "Faltas no mês", value: formatNumber(d.faltas), icon: "UserX", color: "#ef4444" },
    { key: "atrasos-mes", requires: "rh", label: "Atrasos no mês", value: formatNumber(d.atrasos), icon: "Clock", color: "#eab308" },
    {
      key: "roas-trafego",
      requires: "marketing",
      label: "ROAS tráfego pago",
      value: `${formatNumber(d.roas, 2)}x`,
      icon: "Rocket",
      color: "#a855f7",
    },
  ];
  const cards = allCards.filter((c) => perms[c.requires]);

  const allQuickActions: Array<{ label: string; href: string; icon: string; requires: ClassicActionModule }> = [
    { label: "Lançar vendas do dia", href: "/portal/vendas", icon: "ShoppingCart", requires: "vendas" },
    { label: "Cadastrar meta", href: "/portal/metas/gerencia", icon: "Target", requires: "metas" },
    { label: "Registrar ocorrência RH", href: "/portal/rh/ocorrencias", icon: "AlertTriangle", requires: "rh" },
    { label: "Atualizar ficha técnica", href: "/portal/ficha-tecnica/pizzas-salgadas", icon: "ClipboardList", requires: "fichaTecnica" },
  ];
  const quickActions = allQuickActions.filter((a) => perms[a.requires]);

  return (
    <PageContainer title="Início" subtitle={subtitle}>
      {perms.vendas && abaixoDaMeta && (
        <div className="nord-card p-4 flex items-center gap-3 border-amber-600/40 bg-amber-950/10">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            O faturamento do mês está em {formatPercent(percentualMeta)} da meta. Atenção aos
            indicadores de vendas para os próximos dias.
          </p>
        </div>
      )}

      {cards.length > 0 && (
        <SortableStatCards storageKey="inicio-kpi-order" className={statsGridClassName(cards.length)} cards={cards} />
      )}

      {comparison && (
        <Section title="Comparativo entre lojas — mês atual">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Loja</th>
                  <th className="py-2 pr-4">Faturamento</th>
                  <th className="py-2 pr-4">Pedidos</th>
                  <th className="py-2 pr-4">Ticket médio</th>
                  <th className="py-2 pr-4">Meta mensal</th>
                  <th className="py-2 pr-4">% da meta</th>
                  {perms.rh && <th className="py-2 pr-4">Faltas</th>}
                </tr>
              </thead>
              <tbody>
                {comparison.map((c) => (
                  <tr key={c.empresa.id} className="border-b border-nord-border/50 hover:bg-white/5">
                    <td className="py-2.5 pr-4 text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.empresa.color }} />
                      {c.empresa.name}
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(c.fatMes)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(c.pedidosMes)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(c.ticketMedio)}</td>
                    <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(c.metaMensal)}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={c.percentualMeta < 70 ? "danger" : c.percentualMeta < 100 ? "warning" : "success"}>
                        {formatPercent(c.percentualMeta)}
                      </Badge>
                    </td>
                    {perms.rh && <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(c.faltas)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {perms.vendas && (
        <DashboardCharts dailySeries={d.dailySeries} channelData={d.channelData} monthlyEvolution={d.monthlyEvolution} />
      )}

      {perms.metas && (
        <Section
          title="Metas próximas do vencimento"
          action={
            <Link href="/portal/metas/gerencia" className="text-xs text-nord-blue-light flex items-center gap-1 hover:underline">
              Ver todas <ArrowRight size={12} />
            </Link>
          }
        >
          <div className="space-y-3">
            {d.goals.length === 0 && <p className="text-sm text-nord-gray">Nenhuma meta em aberto.</p>}
            {d.goals.map((g) => {
              const percent = pct(g.valorRealizado, g.valorMeta);
              return (
                <div key={g.id} className="flex items-center gap-4">
                  <div className="w-40 shrink-0">
                    <p className="text-sm text-white truncate">{g.name}</p>
                    <p className="text-xs text-nord-gray">{g.responsavel}</p>
                  </div>
                  <div className="flex-1">
                    <ProgressBar percent={percent} />
                  </div>
                  <span className="text-xs text-nord-gray w-14 text-right">{formatPercent(percent)}</span>
                  <Badge
                    tone={
                      g.status === "CONCLUIDA"
                        ? "success"
                        : g.status === "EM_RISCO" || g.status === "NAO_ATINGIDA"
                        ? "danger"
                        : "info"
                    }
                  >
                    {g.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {quickActions.length > 0 && (
        <div className={quickActionsGridClassName(quickActions.length)}>
          {quickActions.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="nord-card p-4 flex items-center gap-3 hover:border-nord-blue transition group"
            >
              <div className="w-9 h-9 rounded-lg bg-nord-blue/15 flex items-center justify-center text-nord-blue-light">
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
              </div>
              <span className="text-sm text-white">{s.label}</span>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
