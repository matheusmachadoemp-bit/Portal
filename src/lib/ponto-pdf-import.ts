import path from "node:path";

/**
 * Leitura do "Relatório Espelho Ponto" (Tecnoponto) em PDF — RH > Ponto Eletrônico > Enviar
 * Arquivo. Criado porque o formato de planilha existente (uma linha por colaborador/dia, com
 * colunas entrada/saída almoço/retorno almoço/saída já nomeadas — ver
 * `src/app/api/rh/time-entries/import/route.ts`) não tem nada a ver com o PDF que o sistema de
 * ponto da loja realmente exporta: 1 página de dados por colaborador (+ 1 página de assinaturas em
 * branco), com uma tabela de 1 linha por DIA DO MÊS (incluindo dias sem marcação nenhuma) e uma
 * única coluna "Marcações" com de 0 a N horários "HH:MM" soltos, sem rótulo de qual é entrada/
 * saída/intervalo.
 *
 * Usa `pdfjs-dist` (motor do Firefox para PDF, mesma biblioteca por trás da maioria dos leitores
 * server-side em Node) em vez de uma lib "pdf-parse" genérica: o relatório é uma TABELA, e
 * `pdfjs-dist` devolve cada trecho de texto com sua posição (x/y) na página — dá pra reconstruir
 * linha e coluna pela posição, em vez de confiar na ordem em que o PDF concatena o texto (que pode
 * não ser left-to-right/top-to-bottom confiável para tabelas). Validado contra um PDF real de 56
 * páginas (28 colaboradores) antes de publicar — ver relatório da task.
 */

export type TecnopontoDia = {
  dateKey: string; // "YYYY-MM-DD"
  /** Horários "HH:MM" da coluna "Marcações", na ordem em que aparecem no PDF (0 a N). */
  tokens: string[];
  /** Texto da coluna "Ocorrências" já limpo (sem "[1]" de nota de rodapé, sem ";" sobrando) — ex. "Feriado: Independência do Brasil", "Folga". `null` quando a célula está vazia. */
  ocorrencia: string | null;
};

export type TecnopontoColaboradorPdf = {
  /** Número da página de dados no PDF (1-indexado) — só para mensagens de erro/aviso. */
  pagina: number;
  nome: string;
  /** CPF só dígitos, ou `null` se o cabeçalho não tinha CPF preenchido. */
  cpfDigits: string | null;
  matricula: string | null;
  dias: TecnopontoDia[];
};

export type TecnopontoParseResult = {
  colaboradores: TecnopontoColaboradorPdf[];
  /** Problemas estruturais do PDF (página de dados sem campo esperado, etc.) — nunca descartados em silêncio, sempre devolvidos pro chamador decidir o que mostrar ao usuário. */
  avisos: string[];
};

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

type TextItem = { str: string; x: number; y: number };
type Row = { y: number; items: TextItem[] };

/** Agrupa os fragmentos de texto da página em linhas (mesmo `y`, com tolerância) — mesma técnica usada pra validar o parsing manualmente antes de escrever este arquivo (ver relatório da task). Ignora fragmentos só de espaço (preenchimento entre colunas). */
function groupRows(items: TextItem[]): Row[] {
  const filtered = items.filter((it) => it.str.trim() !== "");
  filtered.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of filtered) {
    let row = rows.find((r) => Math.abs(r.y - it.y) < 2);
    if (!row) {
      row = { y: it.y, items: [] };
      rows.push(row);
    }
    row.items.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Faixas de x (pontos PDF) de cada coluna da tabela "Data | Marcações | Trab | Carga Horária |
 * Ocorrências" — fixas porque o relatório é gerado por um template (mesma posição em todas as
 * páginas de todos os colaboradores, confirmado nas 28 páginas de dados do PDF de validação).
 */
function colOf(x: number): "data" | "marcacoes" | "trab" | "carga" | "ocorrencias" {
  if (x < 70) return "data";
  if (x < 263) return "marcacoes";
  if (x < 300) return "trab";
  if (x < 332) return "carga";
  return "ocorrencias";
}

const WEEKDAY_DATE_RE = /^[A-Za-zÀ-ú]{3}\s*-\s*(\d{2})\/(\d{2})$/;
const FULL_DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})/;
const TIME_TOKEN_RE = /^\d{1,2}:\d{2}$/;

/** Acha, numa linha do cabeçalho (bloco "Nome:"/"CPF:"/"Matrícula:"/..., acima da tabela), o valor logo depois do rótulo `label` — mesma linha, próximo item à direita (desde que esse item não seja ele mesmo outro rótulo "X:"). */
function findLabelValue(rows: Row[], label: string): string | null {
  for (const row of rows) {
    const idx = row.items.findIndex((it) => it.str.trim() === label);
    if (idx === -1) continue;
    const next = row.items[idx + 1];
    if (!next) return null;
    const value = next.str.trim();
    if (!value || /:$/.test(value)) return null;
    return value;
  }
  return null;
}

/**
 * "Período consultado" vem em 2 linhas quando o texto quebra ("01/09/2026 à" numa linha,
 * "30/09/2026" na linha de baixo) — em vez de tentar juntar as 2 linhas, varre todo o bloco de
 * cabeçalho (coluna da direita, x > 400, acima da tabela) procurando datas completas "DD/MM/AAAA"
 * e usa as 2 primeiras encontradas (nessa região só aparecem as 2 datas do período — "Empresa"/
 * "CNPJ" não têm formato de data).
 */
function extractPeriodo(items: TextItem[]): { startMonth: number; startYear: number; endMonth: number; endYear: number } | null {
  const candidates = items
    .filter((it) => it.x > 400 && it.y > 700 && it.y < 760)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const dates: { m: number; y: number }[] = [];
  for (const it of candidates) {
    const m = FULL_DATE_RE.exec(it.str);
    if (m) dates.push({ m: Number(m[2]), y: Number(m[3]) });
  }
  if (dates.length < 2) return null;
  return { startMonth: dates[0].m, startYear: dates[0].y, endMonth: dates[1].m, endYear: dates[1].y };
}

/** Ano do dia `month`/`day` dado o período consultado da página (lida do cabeçalho) — cobre o caso raro de período atravessando virada de ano (ex. 15/12 a 14/01); fora do range do período, assume o ano de início (mensagem de aviso é responsabilidade do chamador, se quiser checar). */
function resolveYear(month: number, periodo: { startMonth: number; startYear: number; endMonth: number; endYear: number }): number {
  if (month === periodo.startMonth) return periodo.startYear;
  if (month === periodo.endMonth) return periodo.endYear;
  return periodo.startYear;
}

/** Mapa número da nota -> descrição, a partir da legenda "Feriados: [1]:Independência do Brasil;" no rodapé da tabela (pode ter mais de um feriado no período, separados por ";"). */
function extractFeriadosLegend(rows: Row[]): Map<string, string> {
  const legend = new Map<string, string>();
  for (const row of rows) {
    for (const it of row.items) {
      if (!/^Feriados?:/.test(it.str.trim())) continue;
      const re = /\[(\d+)\]:([^;]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(it.str))) {
        legend.set(m[1], m[2].trim());
      }
    }
  }
  return legend;
}

/** Limpa o texto bruto da coluna "Ocorrências" (ex. "Feriado; [1];") removendo marcador de nota de rodapé e ";" sobrando, e troca "Feriado" pela descrição da legenda quando encontrada (ex. "Feriado: Independência do Brasil"). `null` se não sobrar nada (célula vazia). */
function cleanOcorrencia(raw: string, feriadosLegend: Map<string, string>): string | null {
  if (!raw.trim()) return null;
  const footnoteMatch = /\[(\d+)\]/.exec(raw);
  const parts = raw
    .replace(/\[\d+\]/g, "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const label = footnoteMatch ? feriadosLegend.get(footnoteMatch[1]) : undefined;
  if (!label) return parts.join("; ");
  return parts.map((p) => (/^feriado$/i.test(p) ? `Feriado: ${label}` : p)).join("; ");
}

export type MarcacoesMapeadas = {
  entrada: string | null;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saida: string | null;
  /** Horários que não deram pra classificar com confiança em nenhum dos 4 campos acima — NUNCA descartados: viram nota em `TimeEntry.observacao`. */
  stray: string[];
};

/** Antes desse horário (minutos desde 00:00) uma marcação isolada é tratada como "sobra de madrugada" do turno da noite anterior, não como entrada de um novo turno — ver `mapMarcacoes`. */
const LIMITE_MADRUGADA_MIN = 4 * 60; // 04:00
/** Intervalo (minutos) pequeno o bastante pra 2 marcações adjacentes serem tratadas como batida duplicada (erro de registro) em vez de 2 eventos reais distintos. */
const INTERVALO_DUPLICIDADE_MIN = 20;

function horaParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Converte a lista de "marcações" (horários brutos "HH:MM", na ordem em que aparecem na coluna
 * Marcações do PDF, sem rótulo de qual é entrada/saída/intervalo) para os 4 campos nomeados do
 * `TimeEntry`. Documentado em detalhe porque é uma interpretação (o relatório não rotula cada
 * marcação) — decisão tomada com base na análise de TODAS as linhas reais do PDF de validação (840
 * dias-colaborador: 306 com 0 marcações, 138 com 1, 344 com 2, 52 com 3, nenhuma com 4+), e
 * sinalizada no relatório da task pro Matheus confirmar:
 *
 * - 0 marcações: todos os campos vazios (o chamador decide se cria um `TimeEntry` mesmo assim,
 *   com base na "Ocorrência" do dia — ver import/route.ts).
 * - 1 marcação (138/840): vira `entrada`. Isso já alimenta o alerta existente "Não registrou saída"
 *   (ver `pontoAlerts`/`semSaida`, src/lib/rh-helpers.ts). LIMITAÇÃO CONHECIDA: no arquivo real,
 *   ~22% das linhas de 1 marcação têm horário de madrugada (00:00-03:00) — muito provavelmente a
 *   SAÍDA do turno da noite anterior (que varou a meia-noite), não uma entrada nova nesse dia. Como
 *   o próprio PDF já separa essa marcação pro dia em que ela foi batida (não é esta importação que
 *   decide isso) e "costurar" pro dia anterior arriscaria sobrescrever um registro que já está
 *   completo lá, optamos por manter a mesma divisão por dia do relatório. A marcação sempre fica
 *   visível (como `entrada` do dia), só o rótulo pode estar tecnicamente invertido. Esse mesmo
 *   problema NÃO se repete no caso de 2/3 marcações abaixo porque ali sobra pelo menos 1 horário
 *   adicional no mesmo dia pra detectar o padrão (ver `ehSobraDeMadrugada`) — com 1 marcação só,
 *   não tem como diferenciar.
 * - 2 marcações (344/840, padrão dominante): o caso simples é `entrada` + `saida`, sem almoço. MAS
 *   ver `ehSobraDeMadrugada` primeiro: se a 1ª marcação for de madrugada e isolada (longe da 2ª), é
 *   sobra do fechamento do turno anterior, não a entrada de hoje — tratado como marcação única (só
 *   a 2ª vira `entrada`, igual o caso de 1 marcação) em vez de produzir um "turno" de 16-24h
 *   calculando a diferença entre as duas. Achado DURANTE a validação contra o arquivo real: sem
 *   esse tratamento, 59 das 344 linhas de 2 marcações (17%) geravam turnos de 16h a quase 24h (ex.
 *   "00:17" + "16:51" virando "16h34 trabalhadas") — grande o suficiente pra não ser só um detalhe,
 *   corrigido antes de publicar.
 * - 3 marcações (52/840): não existe um layout óbvio de 4 campos pra 3 valores. Ver
 *   `mapTresMarcacoesSemSobraDeMadrugada` + `ehSobraDeMadrugada` pro racional completo e os padrões
 *   observados (sobra de madrugada isolada — 47/52; sobra de madrugada + batida duplicada no fim —
 *   2/52; batida duplicada sem sobra de madrugada — 3/52). O(s) horário(s) não aproveitado(s) nunca
 *   são descartados: vão para `stray`.
 * - 4 marcações: `entrada`, `saidaAlmoco`, `retornoAlmoco`, `saida` — layout clássico. Não apareceu
 *   nenhuma vez no arquivo de validação (os colaboradores dessa loja não batem intervalo de
 *   almoço), mantido por compatibilidade com outras lojas/meses que usem.
 * - 5+ marcações (não observado): `entrada` = primeiro, `saida` = último, `saidaAlmoco`/
 *   `retornoAlmoco` = 2º/3º; qualquer token entre o 3º e o penúltimo vira `stray`.
 *
 * Validado (script de uma vez, não comitado) contra as 534 linhas reais do PDF de teste com pelo
 * menos 1 marcação: nenhum resultado final com saída <= entrada, nenhum turno calculado acima de
 * 13h (maior turno plausível nesta loja).
 */
export function mapMarcacoes(tokens: string[]): MarcacoesMapeadas {
  const vazio: MarcacoesMapeadas = { entrada: null, saidaAlmoco: null, retornoAlmoco: null, saida: null, stray: [] };
  if (tokens.length === 0) return vazio;

  // 2 ou 3 marcações com a 1ª isolada de madrugada: tira ela da lista (vira stray) e processa o
  // restante (1 ou 2 marcações) pelas regras normais abaixo — ver racional completo no comentário
  // desta função. Precisa vir ANTES dos `if` de tamanho fixo porque muda quantas marcações sobram
  // pra classificar (ex.: 3 marcações com sobra de madrugada viram, na prática, o mesmo problema
  // que 2 marcações sem sobra).
  if ((tokens.length === 2 || tokens.length === 3) && ehSobraDeMadrugada(tokens[0], tokens[1])) {
    const resto = mapMarcacoes(tokens.slice(1));
    return { ...resto, stray: [tokens[0], ...resto.stray] };
  }

  if (tokens.length === 1) return { ...vazio, entrada: tokens[0] };

  if (tokens.length === 2) {
    const [a, b] = tokens;
    if (horaParaMinutos(b) - horaParaMinutos(a) <= INTERVALO_DUPLICIDADE_MIN) {
      // Muito perto um do outro pra ser entrada+saída de um turno de verdade — provável batida
      // duplicada (ex. bateu 2x sem querer, por engano). Não descarta: mantém a mais cedo como
      // entrada (sem saída), a outra vira nota. Não observado em nenhuma das 344 linhas reais de 2
      // marcações do arquivo de validação, mas é o mesmo sinal já usado no caso de 3 marcações
      // (abaixo) — mantido por consistência/futuro-proofing.
      return { ...vazio, entrada: a, stray: [b] };
    }
    return { ...vazio, entrada: a, saida: b };
  }

  if (tokens.length === 3) {
    // Já não é o caso de sobra de madrugada (checado acima) — resta checar batida duplicada em
    // outro ponto da sequência.
    const { entrada, saida, stray } = mapTresMarcacoesSemSobraDeMadrugada(tokens[0], tokens[1], tokens[2]);
    return { ...vazio, entrada, saida, stray };
  }

  const first = tokens[0];
  const second = tokens[1];
  const third = tokens[2];
  const last = tokens[tokens.length - 1];
  const strayMeio = tokens.slice(3, tokens.length - 1);
  return { entrada: first, saidaAlmoco: second, retornoAlmoco: third, saida: last, stray: strayMeio };
}

/**
 * `true` quando `a` (1ª marcação do dia) é isolada de madrugada — muito provável sobra do
 * fechamento do turno da noite anterior (que varou a meia-noite), não a entrada de hoje — e por
 * isso não deve formar par com `b` (a marcação seguinte). Ver racional e números completos no
 * comentário de `mapMarcacoes`.
 */
function ehSobraDeMadrugada(a: string, b: string): boolean {
  return horaParaMinutos(a) < LIMITE_MADRUGADA_MIN && horaParaMinutos(b) - horaParaMinutos(a) > INTERVALO_DUPLICIDADE_MIN;
}

/**
 * Caso de 3 marcações SEM sobra de madrugada isolada na 1ª (esse caso já foi tratado antes de
 * chegar aqui, ver `mapMarcacoes`/`ehSobraDeMadrugada`) — só resta checar batida duplicada em
 * qualquer par adjacente.
 */
function mapTresMarcacoesSemSobraDeMadrugada(a: string, b: string, c: string): { entrada: string | null; saida: string | null; stray: string[] } {
  const gapAB = horaParaMinutos(b) - horaParaMinutos(a);
  const gapBC = horaParaMinutos(c) - horaParaMinutos(b);

  if (Math.min(gapAB, gapBC) <= INTERVALO_DUPLICIDADE_MIN) {
    // Par adjacente quase coincidente (batida duplicada na entrada ou na saída) — mantém os 2
    // extremos, descarta o do meio.
    return { entrada: a, saida: c, stray: [b] };
  }

  // Nenhum padrão de batida duplicada identificado — usa o par adjacente de MENOR intervalo como o
  // turno real (duração de turno é tipicamente bem mais curta que "sobra isolada -> próxima
  // entrada"); o token mais distante dos outros 2 vira nota.
  if (gapBC <= gapAB) return { entrada: b, saida: c, stray: [a] };
  return { entrada: a, saida: b, stray: [c] };
}

/** Caminho local dos fontes padrão do pdfjs-dist, pra evitar o aviso/erro "Ensure that the standardFontDataUrl API parameter is provided" ao processar PDFs que referenciam fontes não embutidas (não afeta a extração de texto em si, só silencia o log). */
export function standardFontDataUrl(): string {
  return path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + "/";
}

/**
 * Por padrão, fora de um navegador, o `pdfjs-dist` tenta rodar o parsing numa Web Worker "falsa"
 * carregada via `import()` dinâmico do próprio `workerSrc` — isso falha dentro do bundler do Next.js
 * (Turbopack empacota `pdf.mjs` num chunk próprio, e o `import()` runtime da lib não sabe resolver o
 * caminho do worker depois do empacotamento: "Setting up fake worker failed: Cannot find module
 * '.../pdf.worker.mjs'", confirmado rodando esta importação de verdade dentro do `next dev` antes de
 * publicar). O próprio `pdfjs-dist` já prevê esse caso: se `globalThis.pdfjsWorker` já tiver o
 * módulo do worker carregado, ele usa direto, sem `import()` nenhum (ver `PDFWorker.
 * #mainThreadWorkerMessageHandler`/`_setupFakeWorkerGlobal` em
 * node_modules/pdfjs-dist/legacy/build/pdf.mjs) — roda tudo numa thread só (sem o ganho de
 * performance de paralelizar com o worker), o que é irrelevante aqui: é uma rota de API de vida
 * curta, não uma UI que precisa manter a thread principal livre.
 */
let workerReadyPromise: Promise<void> | null = null;
export function ensureFakeWorkerGlobal(): Promise<void> {
  if (!workerReadyPromise) {
    workerReadyPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((pdfjsWorker) => {
      (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
    });
  }
  return workerReadyPromise;
}

/** Lê o PDF inteiro (todas as páginas) e devolve, por colaborador (cada página de dados = 1 colaborador), a lista de dias com marcações/ocorrências já estruturadas. Páginas sem o campo "Nome:" (ex. as páginas de assinatura, em branco) são ignoradas — comportamento esperado do próprio layout do relatório (1 página de dados + 1 de assinatura por colaborador), não um erro. */
export async function parseTecnopontoPdf(buffer: Buffer): Promise<TecnopontoParseResult> {
  await ensureFakeWorkerGlobal();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    // `isEvalSupported` (desligava `new Function()` nalgumas versões antigas do pdfjs-dist) não
    // existe mais como opção nesta versão (6.x) — removido daqui porque `tsc` acusa a propriedade
    // como inexistente em `DocumentInitParameters`, não porque decidimos manter eval ligado.
    disableFontFace: true,
    standardFontDataUrl: standardFontDataUrl(),
  }).promise;

  const colaboradores: TecnopontoColaboradorPdf[] = [];
  const avisos: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = content.items
      .map((it) => ("str" in it ? { str: it.str, x: it.transform[4], y: it.transform[5] } : null))
      .filter((it): it is TextItem => it !== null && it.str.trim() !== "");

    const isDataPage = items.some((it) => it.str.trim() === "Nome:");
    if (!isDataPage) continue;

    const rows = groupRows(items);

    const nome = findLabelValue(rows, "Nome:");
    if (!nome) {
      avisos.push(`Página ${p}: não encontrei o campo "Nome:" — página ignorada.`);
      continue;
    }

    const periodo = extractPeriodo(items);
    if (!periodo) {
      avisos.push(`Página ${p} (${nome}): não encontrei "Período consultado" — sem isso não dá pra saber o ano de cada dia, página ignorada.`);
      continue;
    }

    const cpfRaw = findLabelValue(rows, "CPF:");
    const matricula = findLabelValue(rows, "Matricula:") ?? findLabelValue(rows, "Matrícula:");
    const feriadosLegend = extractFeriadosLegend(rows);

    // Linhas de dia ficam abaixo do cabeçalho da tabela (y <= 687, logo abaixo de "Data"/
    // "Marcações"/..., ver colOf) e acima do rodapé "Geral"/"Débito"/"Crédito" (y > 230).
    const tableRows = rows.filter((r) => r.y <= 687 && r.y > 230);
    const dias: TecnopontoDia[] = [];
    for (const row of tableRows) {
      const dataItem = row.items.find((it) => colOf(it.x) === "data" && WEEKDAY_DATE_RE.test(it.str.trim()));
      if (!dataItem) continue; // linha de legenda/rodapé que caiu nessa faixa de y (ex. "Feriados: ...") — não é um dia de verdade.

      const m = WEEKDAY_DATE_RE.exec(dataItem.str.trim())!;
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      const ano = resolveYear(mes, periodo);
      const dateKey = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

      const tokens = row.items
        .filter((it) => colOf(it.x) === "marcacoes")
        .map((it) => it.str)
        .join(" ")
        .split(/\s+/)
        .filter((t) => TIME_TOKEN_RE.test(t));

      const ocorrenciaRaw = row.items
        .filter((it) => colOf(it.x) === "ocorrencias")
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const ocorrencia = cleanOcorrencia(ocorrenciaRaw, feriadosLegend);

      dias.push({ dateKey, tokens, ocorrencia });
    }

    if (dias.length === 0) {
      avisos.push(`Página ${p} (${nome}): não encontrei nenhuma linha de dia na tabela — página ignorada.`);
      continue;
    }

    colaboradores.push({
      pagina: p,
      nome,
      cpfDigits: cpfRaw ? onlyDigits(cpfRaw) : null,
      matricula,
      dias,
    });
  }

  if (colaboradores.length === 0) {
    avisos.push('Nenhuma página de dados de colaborador foi reconhecida neste PDF. Confirme que é um "Relatório Espelho Ponto" do Tecnoponto.');
  }

  return { colaboradores, avisos };
}
