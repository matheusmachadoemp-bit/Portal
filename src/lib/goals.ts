export const GOAL_CATEGORIES = ["GERENCIA", "SALAO", "COZINHA", "DELIVERY", "MARKETING", "ADMINISTRATIVO"] as const;
export type GoalCategoryKey = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABEL: Record<GoalCategoryKey, string> = {
  GERENCIA: "Gerência",
  SALAO: "Salão",
  COZINHA: "Cozinha",
  DELIVERY: "Delivery",
  MARKETING: "Marketing",
  ADMINISTRATIVO: "Administrativo",
};

/** Cor padrão de cada setor — usada em qualquer lugar que precise diferenciar setor visualmente (ex.: badge na tabela de checklists). */
export const GOAL_CATEGORY_COLOR: Record<GoalCategoryKey, string> = {
  GERENCIA: "#2952E3",
  SALAO: "#22c55e",
  COZINHA: "#f97316",
  DELIVERY: "#a855f7",
  MARKETING: "#ec4899",
  ADMINISTRATIVO: "#64748b",
};

export const GOAL_CATEGORY_ROUTE: Record<GoalCategoryKey, string> = {
  GERENCIA: "gerencia",
  SALAO: "salao",
  COZINHA: "cozinha",
  DELIVERY: "delivery",
  MARKETING: "marketing",
  ADMINISTRATIVO: "administrativo",
};

/**
 * Metas > Gerência: formulário simplificado — "Responsável" deixa de ser
 * digitado (pedido: "Responsável vai ser sempre o gerente, pois a meta é de
 * gerente") e passa a ser sempre este texto fixo, aplicado tanto no
 * formulário (metas-client.tsx) quanto forçado no servidor (POST/PATCH
 * /api/metas), pra nunca depender só da tela esconder o campo.
 *
 * Decisão: texto fixo "Gerente" (papel/cargo), não o nome de uma pessoa
 * específica — porque uma loja pode ter mais de um usuário com cargo
 * GERENTE (ou nenhum, se ainda não cadastrado), e porque quem cria a meta
 * nem sempre é o próprio gerente (pode ser um ADMINISTRADOR/GESTOR
 * definindo a meta para a loja). Gravar um nome específico exigiria
 * escolher 1 entre N gerentes (ou concatenar vários, o que não cabe bem no
 * campo — ver `<p className="truncate">{g.responsavel}</p>` no card da
 * meta) e ficaria desatualizado se o gerente da loja mudar. Quem
 * efetivamente recebe a notificação de meta nova (ver POST /api/metas) é
 * resolvido à parte, por cargo (GERENTE da loja + ADMINISTRADOR/GESTOR),
 * não a partir deste texto.
 */
export const GERENCIA_RESPONSAVEL = "Gerente";

/**
 * Indicadores fixos do formulário de "Nova meta" de Gerência (pedido:
 * "deixar fixo 3 indicadores relacionados, CMV, Checklist e Faturamento,
 * ter a opção de escrever caso precise de um novo"). `Goal.indicador`
 * continua sendo um `String?` livre no banco — esta lista só guia a UI
 * (select com opção "Outro" liberando texto livre); não é um enum do
 * Prisma, então não precisa de migration pra crescer.
 */
export const GERENCIA_INDICADORES = ["CMV", "Checklist", "Faturamento"] as const;

export const GOAL_STATUS_LABEL: Record<string, string> = {
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  EM_RISCO: "Próxima de atingir",
  CONCLUIDA: "Concluída",
  NAO_ATINGIDA: "Não atingida",
};

export const GOAL_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  NAO_INICIADA: "default",
  EM_ANDAMENTO: "info",
  EM_RISCO: "warning",
  CONCLUIDA: "success",
  NAO_ATINGIDA: "danger",
};

/**
 * Direção de uma meta — o que "progredir" significa (ver enum
 * `GoalDirection` em prisma/schema.prisma):
 * - MAXIMIZAR (padrão): realizado MAIOR é melhor (vender mais, faturar mais).
 * - MINIMIZAR: realizado MENOR é melhor (ex.: CMV, % de cancelamento,
 *   turnover) — o objetivo é ficar EM OU ABAIXO do valor da meta.
 *
 * Union de string literal (não `Record<string, ...>`) de propósito — assim
 * bate estruturalmente com o enum `GoalDirection` gerado pelo Prisma sem
 * precisar de cast ao gravar `Goal.direcao` (mesmo motivo de
 * `GoalCategoryKey`, logo acima).
 */
export const GOAL_DIRECTIONS = ["MAXIMIZAR", "MINIMIZAR"] as const;
export type GoalDirectionKey = (typeof GOAL_DIRECTIONS)[number];

export const GOAL_DIRECTION_LABEL: Record<GoalDirectionKey, string> = {
  MAXIMIZAR: "Quanto maior, melhor",
  MINIMIZAR: "Quanto menor, melhor",
};

/**
 * Toda meta vale por um mês inteiro (dia 1 ao último dia). Esses helpers
 * convertem entre o "YYYY-MM" do seletor de mês e as datas de início/fim
 * que o Goal guarda no banco.
 */
export function monthToDateRange(month: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${year}-${pad(monthIdx + 1)}-01`,
    endDate: `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`,
  };
}

/**
 * Extrai "YYYY-MM" de uma data. Os dois formatos de entrada são tratados de
 * propósito de forma diferente — não é um descuido:
 *
 * - `string` (o formato em que toda data de `Goal` chega do `GET
 *   /api/metas`, já serializada em JSON): essa data foi originalmente
 *   codificada por `monthToDateRange` como "YYYY-MM-01"/"YYYY-MM-DD", uma
 *   string SEM horário — pela especificação do JavaScript, uma string de
 *   data "pura" (sem horário) é sempre interpretada como meia-noite UTC na
 *   hora de virar `Date` (tanto no `POST`/`PATCH /api/metas`, no servidor,
 *   quanto aqui no navegador). Por isso, pra reverter essa codificação e
 *   recuperar o mesmo "YYYY-MM" original, usamos os getters UTC
 *   (`getUTCFullYear`/`getUTCMonth`) — getters locais aqui fariam a conta
 *   variar com o fuso horário de quem está vendo a tela: num fuso atrás de
 *   UTC (ex.: Brasil, UTC-3), meia-noite UTC do dia 1 vira ~21h do dia 31 do
 *   mês ANTERIOR em hora local, e uma meta recém-criada para o mês corrente
 *   passava a "pertencer" ao mês anterior assim que voltava do servidor —
 *   sumindo da listagem do mês corrente (`goalsOfMonth`) imediatamente após
 *   ser criada. Esse era o bug relatado: "crio uma meta nova e ela não
 *   aparece em Metas".
 * - `Date` (usado só por `currentMonth()`, com `new Date()` = "agora"): aqui
 *   o que importa é o mês corrente no calendário LOCAL de quem está vendo a
 *   tela (ex.: `mesFiltro`/`form.mes` default em metas-client.tsx), então os
 *   getters locais continuam certos — nunca troque este ramo para UTC.
 */
export function dateToMonth(date: string | Date): string {
  if (typeof date === "string") {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return dateToMonth(new Date());
}

/**
 * Quantas "semanas" (blocos de até 7 dias, contados a partir do dia 1 do
 * período da meta) cabem no período de uma meta — sempre 4 ou 5, já que toda
 * `Goal` vale por um mês calendário inteiro (28 a 31 dias). Usado tanto para
 * validar `GoalWeeklyUpdate.weekNumber` (nunca pode passar desse total) quanto
 * para a tela (Caio) montar os cards/inputs de cada semana do mês.
 */
export function weeksInGoalPeriod(startDate: Date, endDate: Date): number {
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return Math.max(1, Math.ceil(totalDays / 7));
}

/**
 * Intervalo de dias (base 1, relativo ao início do período da meta) de uma
 * semana específica — ex.: semana 2 de um mês de 30 dias = dias 8 a 14; a
 * última semana do mês pode ter menos de 7 dias (ex.: semana 5 de um mês de
 * 31 dias = só o dia 29 a 31, 3 dias).
 */
export function weekDayRange(weekNumber: number, totalDays: number): { startDay: number; endDay: number } {
  const startDay = (weekNumber - 1) * 7 + 1;
  const endDay = Math.min(weekNumber * 7, totalDays);
  return { startDay, endDay };
}

const NEAR_TARGET_THRESHOLD = 90;

/**
 * Metas com unidade "%" são acompanhadas pela MÉDIA dos `GoalWeeklyUpdate`
 * já lançados, não pela soma (ver `computeValorRealizado` em
 * src/lib/goals-server.ts): somar percentuais de semanas diferentes não tem
 * significado (5 semanas de ~30% cada não é "150%" de nada). Qualquer outra
 * unidade (R$, un., kg, min etc.) é cumulativa e soma normalmente — mesma
 * regra usada tanto para calcular `Goal.valorRealizado` quanto, aqui, para
 * `computeGoalStatus` saber se o resultado já pode ser considerado
 * definitivo antes do fim do período (ver comentário longo lá embaixo).
 */
export function isAverageGoalUnit(unidade: string): boolean {
  return unidade === "%";
}

/**
 * "Percentual de progresso" de uma meta — a MESMA conta usada tanto para
 * decidir o status (`computeGoalStatus`) quanto para a barra de progresso/
 * "% concluído"/texto do relatório de WhatsApp na tela (metas-client.tsx),
 * de propósito: os dois nunca podem se contradizer (ex.: badge "Concluída"
 * com a barra em 40%).
 *
 * - MAXIMIZAR (comportamento de sempre): `realizado/meta * 100` — quanto
 *   mais alto o realizado, mais perto (ou além) de 100%.
 * - MINIMIZAR: fórmula espelhada EM TORNO da meta, não "realizado/meta"
 *   invertido — ficar exatamente em cima da meta vale 100% (bateu o limite
 *   certinho); ficar ABAIXO da meta vale MAIS que 100% (sobrou folga: ex.
 *   CMV com meta 30% e realizado 20% -> 133%); ficar ACIMA da meta vale
 *   MENOS que 100%, podendo passar de 0% e ficar negativo quanto mais
 *   estourar o limite. Essa fórmula é o que faz o limiar de "EM_RISCO"
 *   (>=90%) continuar fazendo sentido pros dois lados sem precisar de
 *   nenhum caso especial: pra MINIMIZAR, percent>=90 equivale a
 *   `realizado <= meta * 1,1..` — "perto o bastante de voltar a ficar
 *   dentro do limite".
 *
 * `valorRealizado <= 0` (nenhum lançamento ainda) SEMPRE vale 0% de
 * progresso, nas duas direções — checado antes de aplicar a fórmula acima.
 * Pra MAXIMIZAR isso já acontecia sozinho (`0/meta*100 = 0`), mas pra
 * MINIMIZAR a fórmula espelhada devolveria 200% ("sobrou o dobro de
 * folga") pra um valor que na verdade significa "sem dado nenhum ainda" —
 * exatamente o estado inicial de toda meta MINIMIZAR recém-criada (ex.:
 * CMV antes do primeiro lançamento semanal). Sem esta guarda, uma meta
 * assim nasceria com a barra/anel de progresso em 100%, no topo do
 * ranking e contando como "100% concluída" no KPI de média por setor,
 * mesmo com o status (`computeGoalStatus`) corretamente mostrando "Não
 * iniciada" — os dois cálculos precisam concordar. Esta função é
 * compartilhada por toda tela que mostra progresso de meta (ver
 * metas-client.tsx, metas-overview-client.tsx, portal/inicio/page.tsx),
 * então a correção vale pras três de uma vez.
 */
export function goalProgressPercent(
  valorRealizado: number,
  valorMeta: number,
  direcao: GoalDirectionKey = "MAXIMIZAR"
): number {
  if (valorMeta <= 0) return 0;
  if (valorRealizado <= 0) return 0;
  if (direcao === "MINIMIZAR") {
    return ((2 * valorMeta - valorRealizado) / valorMeta) * 100;
  }
  return (valorRealizado / valorMeta) * 100;
}

/**
 * A meta muda de status automaticamente conforme o progresso e o prazo —
 * ver seção 1 do escopo (o status nunca é escolhido manualmente).
 *
 * Direção (`direcao`) e agregação (`unidade` — soma vs. média, ver
 * `isAverageGoalUnit`) são dois eixos INDEPENDENTES/composáveis, não uma
 * simples inversão de sinal. O que muda entre eles é quando um resultado
 * pode ser considerado DEFINITIVO antes do fim do período
 * (`endDate`) — CONCLUIDA cedo só é seguro quando o valor atual não pode
 * mais "piorar" com lançamentos futuros:
 *
 * - MAXIMIZAR + SOMA (ex.: "vender 1350 bebidas no mês" — comportamento de
 *   sempre, sem nenhuma mudança aqui): a soma só cresce (cada semana nova
 *   só ADICIONA), então bater a meta (percent >= 100) é irreversível — só
 *   tende a melhorar dali pra frente. CONCLUIDA imediatamente faz sentido.
 * - MAXIMIZAR + MÉDIA (ex.: uma taxa de conversão média que soma "%" e
 *   quanto maior melhor): a média NÃO é irreversível — uma semana ruim mais
 *   pra frente pode derrubar uma média que hoje já parece ter batido a
 *   meta. Por isso, mesmo sendo MAXIMIZAR, uma meta de média só vira
 *   CONCLUIDA (ou NAO_ATINGIDA) quando o período realmente termina — antes
 *   disso, no máximo EM_RISCO/EM_ANDAMENTO.
 * - MINIMIZAR + MÉDIA (ex.: CMV — o exemplo que motivou esta mudança):
 *   mesma razão do item acima (média nunca é definitiva cedo), então
 *   também só resolve em CONCLUIDA/NAO_ATINGIDA no fim do período. Uma
 *   meta de CMV com média de 20% na semana 2 (abaixo da meta de 30%, ótimo)
 *   NÃO vira CONCLUIDA cedo — uma semana ruim na 3 ou 4 ainda pode empurrar
 *   a média de volta pra cima da meta.
 * - MINIMIZAR + SOMA (ex.: "gastar no máximo X reais no mês" — um teto
 *   cumulativo): parece simétrico ao primeiro caso (MAXIMIZAR + SOMA), mas
 *   NÃO é — nesse caso a soma também só cresce, então o lado que fica
 *   "travado" (irreversível) é o RUIM (já estourou o teto, gasto já
 *   aconteceu, não tem como "desgastar"), não o bom: estar dentro do teto
 *   HOJE não garante nada sobre o total no fim do mês, já que mais semanas
 *   de gasto ainda podem vir. Ou seja, "já bateu o alvo" (está dentro do
 *   teto) aqui NÃO é motivo pra CONCLUIDA cedo — ainda que o caso "espelho"
 *   (estourou o teto cedo) fosse tecnicamente definitivo/irreversível,
 *   optei por não adiantar NAO_ATINGIDA antes do prazo pra nenhuma
 *   combinação: o resto do app (texto "Prazo encerrado sem atingir a meta"
 *   nos alertas da tela, `processGoalAlerts` em goals-server.ts) já assume
 *   que NAO_ATINGIDA só acontece depois que `endDate` passa, e quebrar essa
 *   premissa é um escopo maior do que o pedido aqui.
 *
 * Resumindo: CONCLUIDA antes do prazo SÓ acontece pra MAXIMIZAR + SOMA
 * (exatamente o caso que já existia). As outras 3 combinações continuam
 * em EM_ANDAMENTO/EM_RISCO até `endDate`, e só então (nunca antes) o
 * resultado final decide entre CONCLUIDA e NAO_ATINGIDA.
 */
export function computeGoalStatus(
  valorRealizado: number,
  valorMeta: number,
  endDate: Date,
  now: Date = new Date(),
  direcao: GoalDirectionKey = "MAXIMIZAR",
  unidade: string = "R$"
): keyof typeof GOAL_STATUS_LABEL {
  const percent = goalProgressPercent(valorRealizado, valorMeta, direcao);
  const prazoEncerrado = now.getTime() > endDate.getTime();
  // Só a combinação "de sempre" (MAXIMIZAR + cumulativa) pode travar em
  // CONCLUIDA antes do prazo — ver racional completo no comentário acima.
  const podeConcluirCedo = direcao === "MAXIMIZAR" && !isAverageGoalUnit(unidade);

  if (prazoEncerrado) {
    // Período fechado: o resultado é definitivo pra qualquer combinação —
    // não existe mais "cedo demais".
    return percent >= 100 ? "CONCLUIDA" : "NAO_ATINGIDA";
  }
  // "Nada foi lançado ainda" precisa ser checado ANTES do `percent >= 100`
  // abaixo, não depois — sem isso, com `percent` já zerado pra este caso
  // (ver a guarda `valorRealizado <= 0` dentro de `goalProgressPercent`),
  // o código cairia direto no `return "EM_ANDAMENTO"` lá embaixo em vez de
  // reconhecer que não há dado nenhum ainda. Esta checagem aqui não existe
  // mais pra "consertar" o valor de `percent` (isso já é responsabilidade
  // de `goalProgressPercent`) — existe pra decidir NAO_INICIADA especificamente,
  // que é uma classificação de status, não um valor de percentual.
  if (valorRealizado <= 0) return "NAO_INICIADA";
  if (percent >= 100) {
    if (podeConcluirCedo) return "CONCLUIDA";
    // Já bateu/passou o alvo, mas ainda não é definitivo (média, ou soma
    // MINIMIZAR só dentro do teto) — continua "em andamento" até o prazo
    // decidir de vez.
    return "EM_ANDAMENTO";
  }
  if (percent >= NEAR_TARGET_THRESHOLD) return "EM_RISCO";
  return "EM_ANDAMENTO";
}
