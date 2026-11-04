// Reservas — Etapa 1 (estrutura administrativa). Constantes compartilhadas entre a rota de API
// (src/app/api/reservas/configuracoes/**) e a tela (src/app/portal/reservas/configuracoes/**).

/** 0 = Domingo ... 6 = Sábado — mesma convenção de `ProductionWeekdayWeight.weekday` /
 * `WEEKDAY_LABEL` (src/lib/producao.ts), só que definida aqui de novo (em vez de importada de
 * lá) pra não criar uma dependência cruzada entre os módulos Reservas e Produção só por um mapa
 * de 7 nomes de dia. */
export const RESERVATION_WEEKDAY_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export const RESERVATION_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Cargos que podem administrar as configurações de Reservas — mesmo critério usado na
 * visibilidade padrão do módulo (ver `RESERVAS_DEFAULT_ACCESS_PROFILE_KEYS`,
 * `prisma/seed.ts`, e a migration `20261026041000_reservas_etapa1_menu_permissao`):
 * Administrador, Gestor e Gerente. Supervisor fica de fora de propósito (diferente de outros
 * módulos operacionais, ex. `PRODUCTION_MANAGER_ROLES`) — decisão explícita do Matheus de que só
 * esses 3 cargos administram Reservas por padrão; qualquer outro cargo só se tiver um
 * `UserPermission` (override manual) concedendo `canEdit`, verificado por `hasModulePermission`
 * de qualquer forma — este array é só uma trava adicional por cargo, igual ao padrão já usado em
 * `PRODUCTION_MANAGER_ROLES`. */
export const RESERVAS_MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida um horário "HH:mm" (ex.: "18:00") vindo de fora (body da rota) — mesmo formato usado
 * em todo o resto do schema (ver `src/lib/timezone.ts` para a convenção equivalente de DIA). */
export function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && HHMM_PATTERN.test(value);
}

// Reservas — Etapa 2 (ambientes e motor de disponibilidade). Constantes compartilhadas entre as
// rotas de API (src/app/api/reservas/{ambientes,disponibilidade}/**) e a tela de Ambientes
// (src/app/portal/reservas/ambientes/**). Até a tarefa "reservas-remover-mesas" este bloco também
// tinha `RESERVATION_TABLE_STATUS_LABEL`/`RESERVATION_TABLE_STATUSES` (status operacional de
// mesa) — removidas junto com o resto do rastreamento de mesa (ver comentário de redesign em
// `prisma/schema.prisma` acima de `model ReservationEnvironment`).

/** Valida um inteiro positivo (capacidade do ambiente, quantidade de pessoas etc.) vindo de
 * fora — `Number.isInteger` sozinho aceita `0`/negativo, por isso o `> 0` explícito. */
export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Valida um inteiro dentro de um intervalo `[min, max]` (ambos inclusive) vindo de fora — usado
 * pelos 4 parâmetros avançados de `ReservationSettings` (tarefa #192: `minAdvanceMinutes`,
 * `maxAdvanceDays`, `specialGroupThreshold`, `slotIntervalMinutes`), cada um com seu próprio
 * limite de sanidade. Diferente de `isPositiveInt` acima porque `minAdvanceMinutes` aceita `0`
 * (nenhuma antecedência mínima exigida) — não dá pra reaproveitar o `> 0`. */
export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

// Reservas — Etapa 3 (página pública `/reservar/[empresaKey]`). `onlyDigits` fica aqui (em vez de
// reexportado de `src/lib/customer-survey-server.ts`, que já tem uma cópia idêntica) porque este
// arquivo não importa Prisma — pode ser usado tanto pelas rotas públicas novas (server) quanto
// pelo componente client do formulário (`"use client"`, nunca pode puxar o Prisma Client pro
// bundle do navegador), mesmo racional já documentado em `avaliar-client.tsx`.

/** Mantém só os dígitos de um telefone informado em texto livre (com DDD, com ou sem máscara). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validação simples de formato (não confirma que o e-mail existe/recebe mensagens) — suficiente
 * para recusar erros de digitação óbvios num campo opcional do formulário público. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

/** Limites de tamanho do nome/e-mail do cliente de uma reserva — compartilhados entre o fluxo
 * público (`POST /api/reservar/[empresaKey]/reservas`) e a criação manual pelo funcionário
 * (`POST /api/reservas/reservas`, Etapa 4) para não duplicar o mesmo número em dois arquivos. */
export const RESERVATION_CUSTOMER_NAME_MAX_LENGTH = 120;
export const RESERVATION_CUSTOMER_EMAIL_MAX_LENGTH = 180;

// Reservas — Etapa 4 (telas administrativas: Visão Geral, Reservas, Calendário). Constantes
// compartilhadas entre as rotas de API (src/app/api/reservas/reservas/**,
// src/app/api/reservas/resumo) e as telas (src/app/portal/reservas/{reservas,visao-geral,
// calendario}/**). Fica neste arquivo (em vez de `reservas-disponibilidade.ts`, que já tem
// `RESERVATION_OCCUPYING_STATUSES`) porque este arquivo não importa Prisma — os componentes
// cliente das 3 telas (ex.: o `<select>` de mudança de status) precisam do label/transições sem
// puxar o Prisma Client pro bundle do navegador, mesmo racional do resto deste arquivo.
//
// Nota (achado #169, revisão de limpeza; redação corrigida depois da revisão do Teulis — ver
// abaixo): as migrations que removeram as subcategorias "relatorios" e "calendario" do menu de
// Reservas (`20261102030000_remove_relatorios_subcategoria_reservas`,
// `20261102070000_reservas_unificar_calendario_lista`) só apagam a linha de `Subcategory` — de
// propósito NÃO tentam limpar `UserPermission`/`ModulePermission` com moduleKey
// "reservas:relatorios"/"reservas:calendario". Decisão: sem ação necessária, mas não porque essa
// linha "nunca pôde existir" — a tela Usuários > Permissões monta a lista de subcategorias de
// cada módulo a partir de `getMenuCategories()` (banco, `Subcategory.active`), não da constante
// `MODULES` (@/lib/permissions, que não declara `subcategories` pra "reservas") — ver
// `src/app/portal/usuarios/page.tsx`. A migration `20261026041000_reservas_etapa1_menu_permissao`
// criou "relatorios"/"calendario" como `active: true` por ~1 semana (26/10 a 02/11, já publicado
// em produção) antes das duas migrations acima removê-las; nessa janela a tela de Permissões
// EXIBIA de fato um `<select>` pra essas 2 subcategorias, e escolher um nível ali grava uma
// `UserPermission` real com essa moduleKey (coluna string livre, sem FK/enum) — então é
// tecnicamente possível que uma linha dessas exista hoje em produção, criada manualmente por um
// Administrador/Gestor nessa janela. O que torna a limpeza desnecessária mesmo assim: mesmo que
// essa linha órfã exista, ela é INERTE — `hasModulePermission` só considera a chave composta
// `${moduleKey}:${subcategoryKey}` quando o chamador passa `subcategoryKey` explicitamente (ver
// @/lib/authz), e nenhuma chamada de `hasModulePermission("reservas", ...)` hoje passa esse 4º
// argumento (confirmado por busca no repositório) — logo a linha nunca é lida por nenhum código
// atual. Por isso uma migration de limpeza (`DELETE`) não muda nenhum comportamento observável
// hoje; e editar o `migration.sql` já aplicado só pra documentar isso quebraria o checksum que o
// Prisma guarda em `_prisma_migrations` (próximo `migrate deploy` falharia por drift) — por isso
// a decisão fica só aqui, nunca dentro de um `migration.sql` já publicado.

/** Rótulo em português de cada valor do enum `ReservationStatus` (schema.prisma) — mesma
 * convenção de `RESERVATION_TABLE_STATUS_LABEL` acima. */
export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CONFIRMADA: "Confirmada",
  CLIENTE_CHEGOU: "Cliente chegou",
  ACOMODADO: "Acomodado",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
  NAO_COMPARECEU: "Não compareceu",
};

export const RESERVATION_STATUSES = Object.keys(RESERVATION_STATUS_LABEL);

/** Tom de `Badge` (src/components/ui/stat-card.tsx) para cada status — usado nas 3 telas pra
 * colorir o status de forma consistente. */
export const RESERVATION_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PENDENTE: "warning",
  CONFIRMADA: "info",
  CLIENTE_CHEGOU: "purple",
  ACOMODADO: "success",
  FINALIZADA: "default",
  CANCELADA: "danger",
  NAO_COMPARECEU: "danger",
};

/** Transições de status permitidas a partir de cada status atual — a tela "Reservas" só oferece
 * estas opções (nunca um "salto" livre entre quaisquer dois status), e a rota `PATCH
 * /api/reservas/reservas/[id]` recusa qualquer transição fora deste mapa (ver comentário na
 * rota). Os 3 status terminais (`FINALIZADA`/`CANCELADA`/`NAO_COMPARECEU`) não têm saída — uma
 * reserva encerrada não volta a ocupar capacidade do ambiente (ver
 * `RESERVATION_OCCUPYING_STATUSES`, `src/lib/reservas-disponibilidade.ts`); reabrir uma reserva
 * encerrada está fora de escopo desta etapa (criar uma nova reserva cobre o caso de "a pessoa
 * voltou a querer reservar"). */
export const RESERVATION_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDENTE: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["CLIENTE_CHEGOU", "NAO_COMPARECEU", "CANCELADA"],
  CLIENTE_CHEGOU: ["ACOMODADO", "CANCELADA"],
  ACOMODADO: ["FINALIZADA"],
  FINALIZADA: [],
  CANCELADA: [],
  NAO_COMPARECEU: [],
};

// Reservas — Etapa 4 (Fila de Espera). Constantes compartilhadas entre as rotas de API
// (src/app/api/reservas/fila-espera/**) e a tela (src/app/portal/reservas/fila-espera/**). Ver
// comentário de modelagem no `prisma/schema.prisma` acima de `model ReservationWaitlistEntry`.

export const RESERVATION_WAITLIST_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO: "Aguardando",
  CONTATADO: "Contatado",
  CONVERTIDO_EM_RESERVA: "Convertido em reserva",
  CANCELADO: "Cancelado",
  EXPIRADO: "Expirado",
  ATENDIDO: "Sentou",
};

const RESERVATION_WAITLIST_STATUSES = Object.keys(RESERVATION_WAITLIST_STATUS_LABEL);

/** Status "vivos" (ainda na fila, aguardando vaga ou retorno do cliente) — usados pra numerar a
 * posição na fila e mostrar o cronômetro ao vivo. Os demais (`CONTATADO` incluído aqui também,
 * ver abaixo) entram na seção "Histórico" da tela, sem posição/cronômetro.
 *
 * Nota: `CONTATADO` ainda ocupa um lugar na fila de verdade (o cliente não saiu, só já foi
 * avisado) — por isso soma aqui junto com `AGUARDANDO` pra fins de posição/cronômetro; a
 * diferença visual entre os dois é só o badge de status. `ATENDIDO` (cliente sentou) fica de
 * fora de propósito — uma vez atendido, o cliente já ganhou mesa e sai da fila ativa, igual
 * `CANCELADO`/`EXPIRADO`. */
export const RESERVATION_WAITLIST_ACTIVE_STATUSES = ["AGUARDANDO", "CONTATADO"];

/** Status que a UI/API ainda permitem definir manualmente a partir do redesign da Fila de Espera
 * (ver comentário no `prisma/schema.prisma` acima do enum `ReservationWaitlistStatus`):
 * `CONVERTIDO_EM_RESERVA` saiu de propósito — a Fila de Espera não tem mais nenhuma ação em
 * direção a criar uma Reserva. */
export const RESERVATION_WAITLIST_SETTABLE_STATUSES = RESERVATION_WAITLIST_STATUSES.filter(
  (status) => status !== "CONVERTIDO_EM_RESERVA"
);

// Reservas — ajuste "Criar reserva manual + ocupação no Calendário" (ver prompt da tarefa
// "reservas-criar-manual-calendario"). Fica neste arquivo (em vez de
// `reservas-disponibilidade.ts`, que já tem `RESERVATION_OCCUPYING_STATUSES`) pelo mesmo motivo
// do resto deste arquivo: usado pelo componente client do Calendário (`"use client"`, não pode
// puxar o Prisma Client pro bundle do navegador).

/** Status que contam como "ocupação confirmada" do dia no badge do Calendário — diferente de
 * `RESERVATION_OCCUPYING_STATUSES` (que inclui PENDENTE, porque aquele conjunto decide se a
 * capacidade do ambiente está ocupada para o motor de disponibilidade não oferecer conflito).
 * Aqui o objetivo é outro: mostrar quantas pessoas a loja já tem CONFIRMADAS para aquele dia —
 * uma reserva ainda PENDENTE (cliente só pediu, loja não confirmou) não deveria inflar esse
 * número, mas uma reserva já FINALIZADA (atendimento já terminou) continua contando como
 * "aconteceu" naquele dia. CANCELADA e NAO_COMPARECEU nunca contam (não ocuparam/não ocupam
 * capacidade de fato). */
export const RESERVATION_DAY_OCCUPANCY_STATUSES = ["CONFIRMADA", "CLIENTE_CHEGOU", "ACOMODADO", "FINALIZADA"];
