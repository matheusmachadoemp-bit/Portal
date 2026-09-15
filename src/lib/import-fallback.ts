/**
 * Camada de aviso para importações de arquivo (upload manual de CSV/planilha
 * — vendas, itens vendidos, desempenho de garçom etc.).
 *
 * Cada rota de importação já trata "valor não reconhecido" de um jeito
 * correto (cadastra automaticamente quando é uma tabela editável, ou usa um
 * valor de fallback quando é um enum fixo do Prisma — ver CLAUDE.md, seção
 * "Importação de arquivos: não deixar valores novos caírem em 'Outros'").
 * O que faltava era um jeito de PERCEBER quando isso está acontecendo com
 * frequência, sem depender de alguém lembrar de conferir manualmente depois
 * de cada importação. É isso que este módulo resolve: cada rota conta
 * quantas linhas caíram em cada "balde" genérico/fallback (ex.:
 * PaymentMethod.OUTRO, produto/colaborador/categoria não reconhecidos) e usa
 * as funções abaixo para decidir se isso é significativo o bastante para
 * avisar o usuário na tela.
 */

import { formatPercent } from "@/lib/calc";

/**
 * Limiares usados para decidir se um "balde" de linhas em fallback merece
 * aviso. Critério: mais de 5% das linhas do arquivo OU pelo menos 20 linhas
 * em número absoluto — o que vier primeiro.
 *
 * Por quê os dois critérios juntos (e não só um deles): um arquivo com 1
 * linha em "Outros" de 500 (0,2%) não deve gerar alarme — nenhum dos dois
 * critérios dispara, e está certo que seja assim. Mas usar só o percentual
 * deixaria passar batido um arquivo grande (ex.: 300 de 10.000 = 3%) onde
 * 300 linhas com dado genérico já é bastante coisa pra revisar; e usar só
 * um número absoluto exigiria escolher um valor tão baixo que dispararia
 * até para arquivos pequenos onde poucas linhas já são proporcionalmente
 * grandes (ex.: 1 de 3 = 33%, e esse caso já é coberto pelo percentual).
 */
export const IMPORT_FALLBACK_WARNING_PERCENT_THRESHOLD = 5;
export const IMPORT_FALLBACK_WARNING_ABSOLUTE_THRESHOLD = 20;

export type ImportFallbackStats = {
  count: number;
  total: number;
  /** Percentual (0-100) arredondado em 1 casa decimal. */
  percent: number;
  /**
   * Percentual já formatado no padrão pt-BR (vírgula decimal, com "%"), ex.:
   * "33,3%" — usar isto (e não `percent` cru) em qualquer texto mostrado ao
   * usuário, para não vazar o ponto decimal do `toString()` do JavaScript.
   */
  percentLabel: string;
  /** true quando a fatia é significativa o bastante para avisar na tela. */
  warn: boolean;
};

export type ImportFallbackBucket = ImportFallbackStats & {
  /** Identificador curto do balde (ex.: "formaPagamento", "produto"). */
  key: string;
  /** Frase pronta em pt-BR para mostrar ao usuário — só relevante quando warn=true. */
  message: string;
};

export function computeImportFallbackStats(count: number, total: number): ImportFallbackStats {
  const percent = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  const warn =
    count > 0 &&
    total > 0 &&
    (percent > IMPORT_FALLBACK_WARNING_PERCENT_THRESHOLD || count >= IMPORT_FALLBACK_WARNING_ABSOLUTE_THRESHOLD);
  return { count, total, percent, percentLabel: formatPercent(percent), warn };
}

/**
 * Recebe as stats já calculadas (ver `computeImportFallbackStats`) em vez de
 * recalculá-las a partir de count/total — evita computar o mesmo par duas
 * vezes quando o chamador já precisou das stats para montar a `message`
 * (caso comum: a mensagem cita `stats.percentLabel`).
 */
export function buildImportFallbackBucket(
  key: string,
  stats: ImportFallbackStats,
  message: string
): ImportFallbackBucket {
  return { key, message, ...stats };
}
