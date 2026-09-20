/**
 * Escala de Folgas (RH) — cálculos puros (sem Prisma). Mesma separação já usada no projeto entre
 * lib pura + lib server (`@/lib/checklist` + `@/lib/checklist-server`, `@/lib/rh-helpers` +
 * `@/lib/rh-server`): este arquivo pode ser importado por componente client; quem toca banco fica
 * em `@/lib/escala-folgas-server`. Ver o comentário no bloco "RH — ESCALA DE FOLGAS" em
 * `prisma/schema.prisma` para o desenho geral do módulo.
 */

/** "YYYY-MM-01" (primeiro dia do mês) a partir de um "YYYY-MM-DD" qualquer — usado pra resolver a
 *  que `SchedulePeriod` uma data pertence. Mesmo formato "YYYY-MM-DD" de `spDateKey`
 *  (@/lib/checklist). */
export function monthReferenceKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida um "YYYY-MM-DD" vindo de fora (body/query de uma rota) e devolve ele mesmo como dateKey —
 * `null` se não bater com o formato. NUNCA faça `spDateKey(new Date(raw))` com um valor desses
 * (achado real da revisão do Teulis na Fase 1: `spDateKey`/`spStartOfDay`, em `@/lib/checklist`,
 * foram pensadas pra converter um INSTANTE de verdade — tipo `new Date()`, "agora" — pro dia
 * corrente em São Paulo, subtraindo 3h de fuso. Um "YYYY-MM-DD" que já chega pronto do cliente não
 * é um instante, é só uma data — `new Date("YYYY-MM-DD")` já nasce à meia-noite UTC, e tirar mais
 * 3h dela pra "achar o dia em SP" sempre volta pro dia anterior. Isso fazia toda folga salva ficar
 * 1 dia adiantada em relação ao que a pessoa escolheu, inclusive virando de mês errado em datas
 * como "2026-10-01"). Um "YYYY-MM-DD" pronto é usado direto como dateKey, nunca reconvertido.
 */
export function parseDateKeyInput(raw: unknown): string | null {
  return typeof raw === "string" && DATE_KEY_PATTERN.test(raw) ? raw : null;
}

/**
 * Início/fim (em UTC) do dia calendário de um "YYYY-MM-DD" — 3º bug de fuso da mesma família,
 * achado pelo Teulis na revisão da Fase 1: `Vacation`/`Absence.dataInicio`/`.dataFim` guardam só
 * uma DATA (não um instante preciso), mas rotas diferentes já gravaram esse campo com convenções
 * de "meia-noite" diferentes — `/api/rh/vacations` (pré-existente, fora desta tarefa) usa
 * `new Date("YYYY-MM-DD")` (meia-noite UTC); o padrão certo pra campo novo seria
 * `spStartOfDay("YYYY-MM-DD")` (meia-noite de SP, 3h DEPOIS da meia-noite UTC do mesmo dia).
 * Comparar contra um instante único (`spStartOfDay`, como `listIndisponiveisNoSetor` fazia) sub-
 * contava sistematicamente o ÚLTIMO dia de toda férias/afastamento, porque `dataFim` gravado à
 * meia-noite UTC "parece" ser 3h ANTES do instante de comparação do mesmo dia.
 *
 * Em vez de depender de qual convenção foi usada pra gravar, esta função devolve a janela que
 * cobre o dia INTEIRO em UTC (00:00:00.000 a 23:59:59.999) — tanto meia-noite UTC quanto meia-
 * noite de SP do mesmo "YYYY-MM-DD" caem dentro dela, então a comparação fica correta não importa
 * qual das duas convenções o campo usa.
 */
export function utcDayBounds(dateKey: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

export type CoverageResult = {
  /** Cobertura mínima configurada (`SectorCoverageConfig.quantidadeMinima`) no momento da checagem. */
  quantidadeMinima: number;
  /** Quantos colaboradores ATIVOS do setor ficariam escalados (trabalhando) nesse dia. */
  escalados: number;
  /** `max(0, quantidadeMinima - escalados)` — 0 quando não há déficit. */
  deficit: number;
  /** true quando `escalados < quantidadeMinima` — sinaliza o aviso, nunca bloqueia sozinho. */
  insuficiente: boolean;
};

/**
 * Combina o total de colaboradores ativos do setor com quantos já estão indisponíveis no dia
 * (folga/férias/afastamento) e a cobertura mínima configurada. Só descreve o cenário — quem
 * chama decide o que fazer com `insuficiente` (item 5 do pedido original: mostrar aviso com
 * números, nunca bloquear o salvamento).
 */
export function computeCoverage(totalAtivos: number, indisponiveisCount: number, quantidadeMinima: number): CoverageResult {
  const escalados = Math.max(0, totalAtivos - indisponiveisCount);
  const deficit = Math.max(0, quantidadeMinima - escalados);
  return { quantidadeMinima, escalados, deficit, insuficiente: deficit > 0 };
}
