import ExcelJS from "exceljs";

/**
 * Camada de compatibilidade para a leitura de planilhas .xlsx usada pelas rotas de importação de
 * arquivo (vendas, itens vendidos, RH, financeiro, CRM). Criada ao migrar da biblioteca `xlsx`
 * (SheetJS) pra `exceljs` — a `xlsx` tem duas vulnerabilidades conhecidas sem correção disponível
 * via npm (prototype pollution GHSA-4r6h-8v6p-xvw6 e ReDoS GHSA-5pgg-2g8v-p4x9, `npm audit`
 * confirma `fixAvailable: false`).
 *
 * `readWorkbookRows` devolve exatamente o mesmo formato que
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" })` (biblioteca antiga)
 * produzia: um array de arrays (uma linha da planilha por item, incluindo linhas em branco no
 * meio — não filtra nada, pra não desalinhar os índices que as rotas usam em mensagens de erro
 * "Linha N"), todas com a mesma largura (a maior quantidade de colunas usada em qualquer linha da
 * aba), onde célula vazia vira "", célula de texto vira string, e célula numérica — INCLUSIVE data
 * nativa do Excel — vira number.
 *
 * Por que fazer data nativa do Excel virar number em vez de aproveitar o Date que o exceljs já
 * entrega pronto: o exceljs só reconhece uma célula como data quando ela tem formatação de data
 * (numFmt) no Excel; uma célula numérica sem essa formatação (ex.: alguém digitou "45678" numa
 * coluna de data sem formatar a célula) fica como número puro nas duas bibliotecas. As 6 rotas de
 * importação que leem coluna de data já resolviam essa ambiguidade pelo CONTEXTO — é a coluna de
 * data, então qualquer número ali é interpretado como número de série do Excel, via
 * `XLSX.SSF.parse_date_code`. Pra manter esse comportamento sem alterar a lógica dessas rotas,
 * `readWorkbookRows` devolve number pra qualquer célula numérica (convertendo de volta pro número
 * de série quando o exceljs já leu como Date nativo) e `parseExcelDateCode` abaixo substitui
 * `XLSX.SSF.parse_date_code` com o mesmo resultado (validado byte a byte contra a função original
 * pra datas de 1985 a 2030, com e sem horário, antes de publicar).
 */

export type ExcelDateParts = { y: number; m: number; d: number; H: number; M: number; S: number };

/**
 * Equivalente a `XLSX.SSF.parse_date_code` (biblioteca `xlsx` antiga): recebe um número de série
 * de data do Excel (dias desde 30/12/1899, incluindo o "bug" histórico do Excel/Lotus 1-2-3 que
 * trata 1900 como ano bissexto) e devolve os componentes de data/hora. Só os campos y/m/d/H/M/S —
 * os únicos usados pelas rotas de importação — são calculados.
 */
export function parseExcelDateCode(v: number): ExcelDateParts | null {
  if (!Number.isFinite(v) || v < 0 || v > 2958465) return null;

  let date = Math.trunc(v);
  let time = Math.floor(86400 * (v - date));
  let u = 86400 * (v - date) - time;
  if (Math.abs(u) < 1e-6) u = 0;
  if (u > 0.9999) {
    u = 0;
    if (++time === 86400) {
      time = 0;
      ++date;
    }
  }

  // H/M/S vêm sempre da fração de dia (time) calculada acima, pra qualquer valor de "date" —
  // precisa ser calculado ANTES dos dois "dias fantasmas" abaixo (não depois, como uma versão
  // anterior desta função fazia por engano): uma célula só de HORA, sem parte de data (ex.: "08:00"
  // digitado numa célula formatada como hora, sem data — comum nas colunas de entrada/saída do
  // Ponto Eletrônico) vira serial 0.3333..., que cai exatamente no branch "date === 0" — mas tem
  // horário de verdade, que não pode virar 00:00 só porque não tem data.
  const S = time % 60;
  time = Math.floor(time / 60);
  const M = time % 60;
  time = Math.floor(time / 60);
  const H = time;

  // Dias "fantasmas" do bug do Excel: 29/02/1900 não existe de verdade (1900 não foi bissexto),
  // mas o Excel grava assim mesmo por compatibilidade com o Lotus 1-2-3. Só a parte de DATA (y/m/d)
  // é especial aqui — a parte de HORA (H/M/S) vale igual, calculada acima.
  if (date === 60) return { y: 1900, m: 2, d: 29, H, M, S };
  if (date === 0) return { y: 1900, m: 1, d: 0, H, M, S };
  if (date > 60) --date;

  const base = new Date(Date.UTC(1900, 0, 1));
  base.setUTCDate(base.getUTCDate() + date - 1);

  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), H, M, S };
}

/**
 * Inverso de `parseExcelDateCode` — converte um Date em UTC (do jeito que o exceljs devolve pra
 * célula formatada como data) de volta pro número de série do Excel. Só usada aqui dentro, pra
 * `readWorkbookRows` devolver number em vez de Date (ver comentário do módulo).
 */
function dateToExcelSerial(date: Date): number {
  const diffDays = Math.round(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1900, 0, 1)) / 86400000
  );
  // +2 desfaz o "--date" que parseExcelDateCode aplica pra datas reais (sempre > 60 nos dados
  // deste sistema, ou seja, qualquer data a partir de 01/03/1900).
  const serialDatePart = diffDays + 2;
  const seconds = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  return serialDatePart + seconds / 86400;
}

function isFormulaValue(
  value: ExcelJS.CellValue
): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return typeof value === "object" && value !== null && !(value instanceof Date) && "result" in value;
}

/** Converte o valor de uma célula pro mesmo formato que `sheet_to_json(..., { raw: true, defval: "" })`
 * devolvia: "" pra vazio, number pra número/data, string pra texto (e pros tipos "especiais" do
 * exceljs sem equivalente direto no xlsx antigo — rich text, hyperlink, erro de fórmula — usa a
 * representação em texto, o mais parecido possível com o que uma célula assim exibiria no Excel). */
function cellToRaw(cell: ExcelJS.Cell): string | number {
  let value: ExcelJS.CellValue = cell.value;

  // Fórmula: usa o resultado já calculado (cache salvo no arquivo), igual o `raw: true` do xlsx
  // antigo fazia (lia o valor calculado da célula, nunca a fórmula em si).
  if (isFormulaValue(value)) value = value.result ?? "";

  if (value === null || value === undefined) return "";
  if (value instanceof Date) return dateToExcelSerial(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text ?? "");
    if ("error" in value) return String(value.error ?? "");
  }
  return String(value);
}

/**
 * Lê a primeira aba de um arquivo .xlsx e devolve como array de arrays — ver comentário do módulo
 * pro contrato exato (mesmo formato que a leitura antiga com `xlsx`/SheetJS produzia).
 */
export async function readWorkbookRows(buffer: Buffer): Promise<(string | number)[][]> {
  const workbook = new ExcelJS.Workbook();
  // O `Buffer` do tipo declarado por `workbook.xlsx.load` é um tipo local do próprio pacote
  // exceljs (`declare interface Buffer extends ArrayBuffer {}` em index.d.ts, pra não depender de
  // @types/node) — estruturalmente diferente do Buffer real do Node (que estende Uint8Array, não
  // ArrayBuffer), então o TypeScript não aceita passar um Buffer de verdade direto. Problema
  // conhecido do pacote (exceljs#1032), sem efeito em tempo de execução.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const totalRows = worksheet.rowCount;
  const totalCols = worksheet.columnCount;
  const rows: (string | number)[][] = [];
  for (let r = 1; r <= totalRows; r++) {
    const row = worksheet.getRow(r);
    const out: (string | number)[] = [];
    for (let c = 1; c <= totalCols; c++) {
      out.push(cellToRaw(row.getCell(c)));
    }
    rows.push(out);
  }
  return rows;
}
