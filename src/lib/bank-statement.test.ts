import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { detectDelimiter, detectKind, parseBankStatement, parseDateCell, parseMoney, StatementFormatError } from "@/lib/bank-statement";

/**
 * Extratos no estilo do que os bancos brasileiros exportam (codificação, separador, preâmbulo,
 * crédito/débito em colunas, indicador D/C...) — o objetivo é provar que o sistema reconhece o
 * formato sozinho. Os textos abaixo são sintéticos (nenhum dado real de cliente).
 */

const latin1 = (s: string) => Buffer.from(s, "latin1");
const utf8 = (s: string) => Buffer.from(s, "utf-8");
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const brief = (t: { date: Date; descricao: string; direction: string; valor: number }) =>
  `${ymd(t.date)}|${t.direction}|${t.valor}|${t.descricao}`;

test("parseMoney entende os estilos de valor de extrato", () => {
  assert.equal(parseMoney("1.234,56"), 1234.56);
  assert.equal(parseMoney("-1.234,56"), -1234.56);
  assert.equal(parseMoney("R$ 1.234,56"), 1234.56);
  assert.equal(parseMoney("R$ -10,00"), -10);
  assert.equal(parseMoney("(10,00)"), -10);
  assert.equal(parseMoney("10,00-"), -10);
  assert.equal(parseMoney("10,00 D"), -10);
  assert.equal(parseMoney("10,00 C"), 10);
  assert.equal(parseMoney("1.234,56 D"), -1234.56);
  assert.equal(parseMoney("−35,90"), -35.9); // sinal de menos tipográfico
  assert.equal(parseMoney("1,234.56", "."), 1234.56);
  assert.equal(parseMoney("-35.90", "."), -35.9);
  assert.equal(parseMoney("1500.00", "."), 1500);
  assert.equal(parseMoney("1.234"), 1234); // padrão BR: ponto + 3 dígitos = milhar
  assert.equal(parseMoney("1.234.567,89"), 1234567.89);
  assert.equal(parseMoney(42.5), 42.5);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("Total"), null);
});

test("parseDateCell entende os estilos de data", () => {
  const k = (v: string | number, order?: "DMY" | "MDY") => {
    const d = parseDateCell(v, order);
    return d ? ymd(d) : null;
  };
  assert.equal(k("05/10/2026"), "2026-10-05");
  assert.equal(k("5/10/26"), "2026-10-05");
  assert.equal(k("05-10-2026"), "2026-10-05");
  assert.equal(k("05.10.2026"), "2026-10-05");
  assert.equal(k("2026-10-05"), "2026-10-05");
  assert.equal(k("2026-10-05T14:30:00"), "2026-10-05");
  assert.equal(k("2026/10/05"), "2026-10-05");
  assert.equal(k("20261005"), "2026-10-05");
  assert.equal(k(20261005), "2026-10-05");
  assert.equal(k("05/10/2026 14:32"), "2026-10-05");
  assert.equal(k("5 de outubro de 2026"), "2026-10-05");
  assert.equal(k("05 out 2026"), "2026-10-05");
  assert.equal(k("10/05/2026", "MDY"), "2026-10-05");
  assert.equal(k(46300), "2026-10-05"); // número de série do Excel
  assert.equal(k("Sexta, 31 de julho de 2026"), "2026-07-31"); // dia da semana na frente (Santander, planilha)
  assert.equal(k("Quarta, 01 de julho de 2026"), "2026-07-01");
  assert.equal(k("Sex, 31/07/2026"), "2026-07-31");
  assert.equal(k("segunda-feira 05/10/2026"), "2026-10-05");
  assert.equal(k("31/02/2026"), null);
  assert.equal(k("Total"), null);
  assert.equal(k("1500,00"), null);
});

test("detectKind reconhece o formato pelo conteúdo, não pela extensão", () => {
  assert.equal(detectKind(Buffer.from("%PDF-1.7 ...")), "PDF");
  assert.equal(detectKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), "XLS");
  assert.equal(detectKind(utf8("OFXHEADER:100\nDATA:OFXSGML\n")), "OFX");
  assert.equal(detectKind(utf8('<?xml version="1.0"?><?OFX OFXHEADER="200"?><OFX></OFX>')), "OFX");
  assert.equal(detectKind(utf8("data;descricao;valor\n01/10/2026;x;1,00\n")), "TEXT");
  const cnab = ["237" + "0".repeat(237), "237" + "1".repeat(237)].join("\n");
  assert.equal(detectKind(Buffer.from(cnab)), "CNAB");
  assert.equal(detectKind(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "IMAGE");
});

test("detectDelimiter acerta ; , tab e |", () => {
  assert.equal(detectDelimiter("a;b;c\n1,5;2,5;3,5\n4,5;5,5;6,5\n"), ";");
  assert.equal(detectDelimiter("data,valor,descricao\n01/10/2026,-35.90,x\n02/10/2026,10.00,y\n"), ",");
  assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3\n4\t5\t6\n"), "\t");
  assert.equal(detectDelimiter("a|b|c\n1|2|3\n4|5|6\n"), "|");
});

test("CSV simples (data;descricao;valor) continua funcionando", async () => {
  const r = await parseBankStatement(utf8("data;descricao;valor\n01/10/2026;Venda balcão;150,00\n02/10/2026;Pagamento luz;-89,90\n"));
  assert.equal(r.format, "CSV");
  assert.deepEqual(r.transactions.map(brief), [
    "2026-10-01|ENTRADA|150|Venda balcão",
    "2026-10-02|SAIDA|89.9|Pagamento luz",
  ]);
  assert.equal(r.errors.length, 0);
});

test("estilo Bradesco: Windows-1252, dados da conta antes do cabeçalho, crédito/débito em colunas, saldo e total ignorados", async () => {
  const text = [
    "Extrato de: Ag: 1234 | Conta: 56789-0",
    "Período: 01/10/2026 a 31/10/2026",
    "",
    "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)",
    "01/10/2026;SALDO ANTERIOR;;;;1.000,00",
    "02/10/2026;PIX RECEBIDO JOÃO SILVA;123456;250,00;;1.250,00",
    "03/10/2026;PAGTO BOLETO ENERGIA;987;;-120,50;1.129,50",
    "04/10/2026;TARIFA BANCÁRIA;1;;15,00;1.114,50",
    "Total;;;250,00;135,50;",
  ].join("\r\n");
  const r = await parseBankStatement(latin1(text));
  assert.equal(r.format, "CSV");
  assert.deepEqual(r.transactions.map(brief), [
    "2026-10-02|ENTRADA|250|PIX RECEBIDO JOÃO SILVA",
    "2026-10-03|SAIDA|120.5|PAGTO BOLETO ENERGIA",
    "2026-10-04|SAIDA|15|TARIFA BANCÁRIA",
  ]);
  assert.equal(r.ignored, 2); // saldo anterior + total
  assert.match(r.detected, /Windows-1252/);
  assert.match(r.detected, /cabeçalho na linha 4/);
});

test("estilo Nubank: vírgula como separador, ponto decimal, valor com sinal", async () => {
  const text = [
    "Data,Valor,Identificador,Descrição",
    "01/10/2026,-35.90,aaa-111,Compra no débito - Padaria",
    "02/10/2026,1500.00,bbb-222,Transferência recebida - Cliente X",
    "03/10/2026,-1234.56,ccc-333,Pagamento de fatura",
  ].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map(brief), [
    "2026-10-01|SAIDA|35.9|Compra no débito - Padaria",
    "2026-10-02|ENTRADA|1500|Transferência recebida - Cliente X",
    "2026-10-03|SAIDA|1234.56|Pagamento de fatura",
  ]);
});

test("estilo Inter: duas colunas de texto viram uma descrição só", async () => {
  const text = [
    "Extrato Conta Corrente",
    "Conta;12345678",
    "Período;01/10/2026 a 31/10/2026",
    "",
    "Data Lançamento;Histórico;Descrição;Valor;Saldo",
    "01/10/2026;Pix recebido;MARIA SOUZA;R$ 80,00;R$ 1.080,00",
    "02/10/2026;Pix enviado;FORNECEDOR LTDA;R$ -300,00;R$ 780,00",
  ].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map(brief), [
    "2026-10-01|ENTRADA|80|Pix recebido - MARIA SOUZA",
    "2026-10-02|SAIDA|300|Pix enviado - FORNECEDOR LTDA",
  ]);
});

test("estilo Caixa/BB: valor sempre positivo + coluna D/C", async () => {
  const text = [
    "Data;Nr. Doc.;Histórico;Valor;Deb/Cred",
    "01/10/2026;000001;TARIFA PACOTE SERVICOS;12,00;D",
    "02/10/2026;000002;DEPOSITO DINHEIRO;300,00;C",
    "03/10/2026;000003;PAGAMENTO FORNECEDOR;1.250,75;Débito",
  ].join("\n");
  const r = await parseBankStatement(latin1(text));
  assert.deepEqual(r.transactions.map(brief), [
    "2026-10-01|SAIDA|12|TARIFA PACOTE SERVICOS",
    "2026-10-02|ENTRADA|300|DEPOSITO DINHEIRO",
    "2026-10-03|SAIDA|1250.75|PAGAMENTO FORNECEDOR",
  ]);
});

test("'Tipo' que não é débito/crédito vira só descrição", async () => {
  const text = ["Data;Tipo;Descrição;Valor", "01/10/2026;Pix;FULANO;-10,00", "02/10/2026;Compra;MERCADO;-20,00"].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map(brief), ["2026-10-01|SAIDA|10|Pix - FULANO", "2026-10-02|SAIDA|20|Compra - MERCADO"]);
});

test("valor com sufixo D/C e sinal no fim", async () => {
  const text = ["Data;Descrição;Valor", "01/10/2026;A;100,00 D", "02/10/2026;B;50,00 C", "03/10/2026;C;30,00-"].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map((t) => `${t.direction}${t.valor}`), ["SAIDA100", "ENTRADA50", "SAIDA30"]);
});

test("arquivo sem cabeçalho: colunas reconhecidas pelo conteúdo", async () => {
  const text = ["01/10/2026;PIX ENVIADO FULANO;-50,00", "02/10/2026;DEPOSITO;120,00", "03/10/2026;TARIFA;-9,90"].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map(brief), [
    "2026-10-01|SAIDA|50|PIX ENVIADO FULANO",
    "2026-10-02|ENTRADA|120|DEPOSITO",
    "2026-10-03|SAIDA|9.9|TARIFA",
  ]);
  assert.match(r.detected, /sem cabeçalho/);
});

test("datas ISO e datas mês/dia (formato americano)", async () => {
  const iso = await parseBankStatement(utf8("date,amount,memo\n2026-10-01,-10.50,A\n2026-10-02,20.00,B\n"));
  assert.deepEqual(iso.transactions.map(brief), ["2026-10-01|SAIDA|10.5|A", "2026-10-02|ENTRADA|20|B"]);
  const us = await parseBankStatement(utf8("date,amount,memo\n10/25/2026,-10.50,A\n10/26/2026,20.00,B\n"));
  assert.deepEqual(us.transactions.map(brief), ["2026-10-25|SAIDA|10.5|A", "2026-10-26|ENTRADA|20|B"]);
  assert.match(us.detected, /mês\/dia/);
});

test("campos entre aspas com separador dentro e UTF-16 com BOM", async () => {
  const quoted = await parseBankStatement(utf8('Data;Histórico;Valor\n01/10/2026;"COMPRA; LOJA ""X"""; -10,00\n'));
  assert.equal(quoted.transactions[0].descricao, 'COMPRA; LOJA "X"');
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Data;Histórico;Valor\n01/10/2026;PADARIA;-10,00\n", "utf16le")]);
  const r = await parseBankStatement(u16);
  assert.deepEqual(r.transactions.map(brief), ["2026-10-01|SAIDA|10|PADARIA"]);
});

test("linha com data inválida e valor é reportada; rodapé sem valor é ignorado", async () => {
  const text = ["Data;Descrição;Valor", "01/10/2026;OK;10,00", "99/99/2026;QUEBRADA;5,00", "fim do extrato;;"].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.equal(r.transactions.length, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Linha 3/);
  assert.equal(r.ignored, 1);
});

test("OFX continua sendo lido (1.x/SGML, crédito e débito)", async () => {
  const ofx = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261031<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>BRL",
    "<BANKACCTFROM><BANKID>001<ACCTID>123<ACCTTYPE>CHECKING</BANKACCTFROM>",
    "<BANKTRANLIST><DTSTART>20261001<DTEND>20261031",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261002120000<TRNAMT>250.00<FITID>1<MEMO>PIX RECEBIDO</STMTTRN>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000<TRNAMT>-120.50<FITID>2<MEMO>BOLETO ENERGIA</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
  const r = await parseBankStatement(latin1(ofx));
  assert.equal(r.format, "OFX");
  assert.deepEqual(r.transactions.map((t) => `${t.direction}${t.valor}:${t.descricao}`), [
    "ENTRADA250:PIX RECEBIDO",
    "SAIDA120.5:BOLETO ENERGIA",
  ]);
});

test("XLSX: datas como número de série, valores numéricos, crédito/débito e cabeçalho fora da primeira linha", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Extrato");
  ws.addRow(["Banco Exemplo - Extrato"]);
  ws.addRow([]);
  ws.addRow(["Data", "Histórico", "Crédito", "Débito", "Saldo"]);
  ws.addRow([new Date(Date.UTC(2026, 9, 2)), "PIX RECEBIDO", 250, null, 1250]);
  ws.addRow([new Date(Date.UTC(2026, 9, 3)), "BOLETO", null, 120.5, 1129.5]);
  ws.addRow(["Saldo final", null, null, null, 1129.5]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  assert.equal(detectKind(buf), "XLSX");
  const r = await parseBankStatement(buf);
  assert.equal(r.format, "XLSX");
  assert.deepEqual(r.transactions.map(brief), ["2026-10-02|ENTRADA|250|PIX RECEBIDO", "2026-10-03|SAIDA|120.5|BOLETO"]);
  assert.equal(r.ignored, 1);
});

test("formatos que não lê dão mensagem clara em português", async () => {
  await assert.rejects(() => parseBankStatement(Buffer.from("%PDF-1.4 conteudo")), (e: unknown) => e instanceof StatementFormatError && /PDF/.test(e.message));
  await assert.rejects(
    () => parseBankStatement(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])),
    (e: unknown) => e instanceof StatementFormatError && /\.xls/.test(e.message)
  );
  await assert.rejects(() => parseBankStatement(utf8("nada a ver\ncom extrato\n")), (e: unknown) => e instanceof StatementFormatError && /colunas/.test(e.message));
});

/**
 * PDF no estilo "Extrato Consolidado" de banco: cabeçalho de dois níveis (Movimentos > Créditos |
 * Débitos), data só na 1ª linha do dia e sem ano, nome que quebra em 2 linhas, débito com sinal no
 * fim ("100,00-"), saldo impresso na última linha do dia, rodapé de página e uma segunda página
 * ("Continuação") com as colunas em outras posições. Dados sintéticos.
 */
function buildStatementPdf(): Buffer {
  const doc = new jsPDF({ unit: "pt", format: [900, 1000] }); // larga o bastante para as colunas da direita ficarem dentro da página
  doc.setFontSize(8);
  const T = (text: string, x: number, y: number, align: "left" | "right" | "center" = "left") => doc.text(text, x, y, { align });

  T("EXTRATO CONSOLIDADO", 500, 30);
  T("setembro/2026", 560, 40);
  T("Resumo - setembro/2026", 47, 90);
  T("Conta Corrente", 47, 150);

  // Página 1
  T("Data", 47, 200);
  T("Descrição", 90, 200);
  T("Nº Documento", 407, 200);
  T("Movimentos (R$)", 551, 200, "center");
  T("Saldo (R$)", 752, 200, "right");
  T("Créditos", 570, 210, "right");
  T("Débitos", 637, 210, "right");

  let y = 222;
  const step = 9.4;
  const row = (o: { date?: string; desc: string; doc?: string; credit?: string; debit?: string; balance?: string }) => {
    if (o.date) T(o.date, 47, y);
    T(o.desc, 90, y);
    if (o.doc) T(o.doc, 440, y, "right");
    if (o.credit) T(o.credit, 563, y, "right");
    if (o.debit) T(o.debit, 633, y, "right");
    if (o.balance) T(o.balance, 752, y, "right");
    y += step;
  };
  row({ desc: "SALDO EM 31/08", balance: "500,00-" });
  row({ date: "01/09", desc: "TARIFA AVULSA ENVIO PIX", doc: "-", debit: "100,00-" });
  row({ desc: "PAGAMENTO CARTAO DE DEBITO", doc: "291321", credit: "1.000,00" });
  row({ desc: "GETNET-VISA ELECTR" });
  row({ desc: "PIX ENVIADO", doc: "-", debit: "150,00-", balance: "250,00" });
  row({ desc: "FULANO DE TAL" });
  row({ date: "02/09", desc: "PIX RECEBIDO 12345678000199", doc: "-", credit: "50,00", balance: "300,00" });
  T("Extrato_PJ_A4_Basico - 2/4/2024", 34, 800);
  T("Pagina: 1/2", 700, 815);

  // Página 2: mesmas colunas, em outras posições
  doc.addPage();
  T("Continuação 1", 47, 90);
  T("Data", 34, 150);
  T("Descrição", 70, 150);
  T("Nº Documento", 300, 150);
  T("Movimentos (R$)", 420, 150, "center");
  T("Saldo (R$)", 600, 150, "right");
  T("Créditos", 440, 160, "right");
  T("Débitos", 500, 160, "right");
  y = 172;
  const row2 = (o: { date?: string; desc: string; doc?: string; credit?: string; debit?: string; balance?: string }) => {
    if (o.date) T(o.date, 34, y);
    T(o.desc, 70, y);
    if (o.doc) T(o.doc, 330, y, "right");
    if (o.credit) T(o.credit, 436, y, "right");
    if (o.debit) T(o.debit, 496, y, "right");
    if (o.balance) T(o.balance, 600, y, "right");
    y += step;
  };
  row2({ date: "03/09", desc: "PIX ENVIADO", doc: "-", debit: "20,00-", balance: "280,00" });
  row2({ desc: "SALDO EM 30/09", balance: "280,00" });
  T("Extrato_PJ_A4_Basico - 2/4/2024", 34, 800);
  T("Pagina: 2/2", 540, 815);

  return Buffer.from(doc.output("arraybuffer"));
}

test("PDF de extrato: tabela reconstruída pela posição, data completada, descrição de 2 linhas, saldo conferido", async () => {
  const pdf = buildStatementPdf();
  assert.equal(detectKind(pdf), "PDF");
  const r = await parseBankStatement(pdf);
  assert.equal(r.format, "PDF");
  assert.deepEqual(r.transactions.map(brief), [
    "2026-09-01|SAIDA|100|TARIFA AVULSA ENVIO PIX",
    "2026-09-01|ENTRADA|1000|PAGAMENTO CARTAO DE DEBITO GETNET-VISA ELECTR",
    "2026-09-01|SAIDA|150|PIX ENVIADO FULANO DE TAL",
    "2026-09-02|ENTRADA|50|PIX RECEBIDO 12345678000199",
    "2026-09-03|SAIDA|20|PIX ENVIADO",
  ]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.ignored, 2); // "SALDO EM 31/08" e "SALDO EM 30/09"
  assert.deepEqual(r.balanceCheck, { checked: 4, matched: 4 }); // saldo inicial -500 + lançamentos bate com cada saldo impresso
  assert.ok(!r.transactions.some((t) => /Extrato_|Pagina/.test(t.descricao)), "rodapé não pode virar descrição");
  assert.match(r.detected, /período 09\/2026/);
});

test("PDF sem texto (escaneado) e PDF inválido dão mensagem clara", async () => {
  const blank = new jsPDF({ unit: "pt", format: "a4" });
  const blankBuf = Buffer.from(blank.output("arraybuffer"));
  await assert.rejects(() => parseBankStatement(blankBuf), (e: unknown) => e instanceof StatementFormatError && /não tem texto/.test(e.message));
  const other = new jsPDF({ unit: "pt", format: "a4" });
  other.text("Relatório qualquer sem tabela de extrato", 50, 50);
  await assert.rejects(
    () => parseBankStatement(Buffer.from(other.output("arraybuffer"))),
    (e: unknown) => e instanceof StatementFormatError && /tabela de movimentações/.test(e.message)
  );
});

test("XLSX com data por extenso + dia da semana e linha TOTAL: lê tudo e confere os totais", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Extrato");
  ws.addRow(["EXTRATO DE CONTA CORRENTE"]);
  ws.addRow([]);
  ws.addRow(["LOJA TESTE LTDA", "", "Conta: 123-4"]);
  ws.addRow([]);
  ws.addRow(["Tipo de lançamento: Todos", "", "Extrato de 01/07/2026 a 31/07/2026"]);
  ws.addRow(["Data", "Descrição", "Crédito (R$)", "Débito (R$)"]);
  ws.addRow(["Sexta, 31 de julho de 2026", "APLICACAO", 0, 80.5]);
  ws.addRow(["Sexta, 31 de julho de 2026", "PIX RECEBIDO", 122.65, 0]);
  ws.addRow(["Quarta, 01 de julho de 2026", "TARIFA PIX", 0, 4.63]);
  ws.addRow([null, "TOTAL", 122.65, 85.13]);
  const r = await parseBankStatement(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.deepEqual(r.transactions.map(brief), [
    "2026-07-31|SAIDA|80.5|APLICACAO",
    "2026-07-31|ENTRADA|122.65|PIX RECEBIDO",
    "2026-07-01|SAIDA|4.63|TARIFA PIX",
  ]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.ignored, 1);
  assert.equal(r.totalsCheck?.matched, true);
  assert.match(r.detected, /batem com a linha TOTAL/);
});

test("conferência de totais avisa quando a soma lida não bate com a linha TOTAL", async () => {
  const text = ["Data;Descrição;Crédito;Débito", "01/07/2026;A;10,00;", "02/07/2026;B;;3,00", "TOTAL;;10,00;99,00"].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.equal(r.totalsCheck?.matched, false);
  assert.match(r.detected, /ATENÇÃO conferência de totais/);
});

// ---------------------------------------------------------------------------
// Achados da revisão (Teulis): regressões e casos de dinheiro real
// ---------------------------------------------------------------------------

const OFX2_XML = (lineBreaks: boolean) => {
  const nl = lineBreaks ? "\n" : "";
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>',
    "<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20261031120000</DTSERVER><LANGUAGE>POR</LANGUAGE></SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>BRL</CURDEF>",
    "<BANKACCTFROM><BANKID>001</BANKID><ACCTID>123</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>",
    "<BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>20261031</DTEND>",
    "<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261002120000</DTPOSTED><TRNAMT>250.00</TRNAMT><FITID>1</FITID><MEMO>PIX RECEBIDO</MEMO></STMTTRN>",
    "<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-120.50</TRNAMT><FITID>2</FITID><MEMO>BOLETO ENERGIA</MEMO></STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join(nl);
};

test("OFX 2.x (XML) continua sendo lido, formatado ou numa linha só, e a data fica no dia certo", async () => {
  for (const lineBreaks of [true, false]) {
    const r = await parseBankStatement(utf8(OFX2_XML(lineBreaks)));
    assert.equal(r.format, "OFX");
    assert.deepEqual(r.transactions.map(brief), [
      "2026-10-02|ENTRADA|250|PIX RECEBIDO",
      "2026-10-03|SAIDA|120.5|BOLETO ENERGIA",
    ]);
  }
});

test("OFX 1.x numa linha só: a data também fica no dia certo (sem voltar um dia)", async () => {
  const sgml = ["OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>10.00<FITID>1<MEMO>X</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"].join("\n");
  const r = await parseBankStatement(latin1(sgml));
  assert.deepEqual(r.transactions.map(brief), ["2026-10-01|ENTRADA|10|X"]);
});

test("indicador 'Déb.'/'Créd.' (com ponto e acento) define a direção", async () => {
  const text = ["Data;Histórico;Valor;Tipo", "01/10/2026;TARIFA;12,00;Déb.", "02/10/2026;DEPOSITO;300,00;Créd.", "03/10/2026;PAGAMENTO;50,00;Déb."].join("\n");
  const r = await parseBankStatement(latin1(text));
  assert.deepEqual(r.transactions.map((t) => `${t.direction}${t.valor}`), ["SAIDA12", "ENTRADA300", "SAIDA50"]);
  assert.ok(!r.transactions[0].descricao.includes("Déb"), "a coluna Tipo não vira descrição quando é indicador");
});

test("quando o valor já tem sinal, o sinal manda e 'Tipo = Débito' (modalidade do cartão) não inverte a direção", async () => {
  const text = ["Data;Descrição;Valor;Tipo", "01/10/2026;Venda cartão;150,00;Débito", "02/10/2026;Estorno;-20,00;Débito", "03/10/2026;Venda cartão;80,00;Crédito"].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map((t) => `${t.direction}${t.valor}`), ["ENTRADA150", "SAIDA20", "ENTRADA80"]);
});

test("descrição que só COMEÇA com Total/Saldo/Resumo é lançamento legítimo; saldo e total de verdade são ignorados", async () => {
  const text = [
    "data;descricao;valor",
    "01/10/2026;SALDO ANTERIOR;",
    "02/10/2026;Total Express frete;-120,00",
    "03/10/2026;Saldo devedor cartao;-50,00",
    "04/10/2026;TOTAL PASS academia;-89,90",
    "05/10/2026;Resumo vendas Saipos;1500,00",
    "06/10/2026;Venda normal;10,00",
    "TOTAL;;",
  ].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map((t) => t.descricao), [
    "Total Express frete",
    "Saldo devedor cartao",
    "TOTAL PASS academia",
    "Resumo vendas Saipos",
    "Venda normal",
  ]);
  assert.equal(r.ignored, 2);
  assert.deepEqual(r.ignoredSamples, ["SALDO ANTERIOR", "TOTAL"]);
});

test("crédito e débito '0,00' nas duas colunas é linha sem movimento (ignorada, não erro)", async () => {
  const r = await parseBankStatement(utf8(["Data;Descrição;Crédito;Débito", "01/10/2026;AJUSTE;0,00;0,00", "02/10/2026;PIX;10,00;"].join("\n")));
  assert.equal(r.transactions.length, 1);
  assert.equal(r.errors.length, 0);
  assert.equal(r.ignored, 1);
});

test("PDF com coluna D/C separada: valor sem sinal usa o indicador (tarifa 'D' é saída)", async () => {
  const doc = new jsPDF({ unit: "pt", format: [900, 600] });
  doc.setFontSize(8);
  const T = (text: string, x: number, y: number, align: "left" | "right" = "left") => doc.text(text, x, y, { align });
  T("Extrato outubro/2026", 47, 40);
  T("Data", 47, 100);
  T("Histórico", 100, 100);
  T("Valor", 520, 100, "right");
  T("D/C", 560, 100);
  const rows: [string, string, string, string][] = [
    ["01/10", "TARIFA PACOTE", "12,00", "D"],
    ["02/10", "DEPOSITO", "300,00", "C"],
    ["03/10", "PAGAMENTO FORNECEDOR", "1.250,75", "D"],
  ];
  rows.forEach(([d, h, v, dc], i) => {
    const y = 120 + i * 10;
    T(d, 47, y);
    T(h, 100, y);
    T(v, 520, y, "right");
    T(dc, 560, y);
  });
  const r = await parseBankStatement(Buffer.from(doc.output("arraybuffer")));
  assert.deepEqual(r.transactions.map((t) => `${t.direction}${t.valor}`), ["SAIDA12", "ENTRADA300", "SAIDA1250.75"]);
  assert.equal(r.errors.length, 0);
});

test("entradas hostis não travam o servidor (tempo limitado)", async () => {
  const t0 = Date.now();
  // O que importa aqui é terminar rápido (antes levava de dezenas de segundos a minutos); o resultado
  // (erro de formato ou nenhum lançamento) não importa.
  await parseBankStatement(utf8('a"'.repeat(150000))).catch(() => null);
  await parseBankStatement(utf8(`Data;${"(".repeat(120000)};Valor\n01/10/2026;x;1,00\n`)).catch(() => null);
  assert.equal(parseDateCell("seg" + " ".repeat(40000) + "x"), null);
  assert.ok(Date.now() - t0 < 3000, `demorou ${Date.now() - t0}ms`);
});

test("cabeçalho D/C explícito vale sempre para valores positivos, mesmo com um estorno negativo no arquivo", async () => {
  const text = [
    "Data;Histórico;Valor;D/C",
    "01/10/2026;TARIFA;12,00;D",
    "02/10/2026;DEPOSITO;300,00;C",
    "03/10/2026;PAGTO FORNECEDOR;500,00;D",
    "04/10/2026;ESTORNO TARIFA;-12,00;D",
    "05/10/2026;PAGTO LUZ;80,00;D",
  ].join("\n");
  const r = await parseBankStatement(utf8(text));
  assert.deepEqual(r.transactions.map((t) => `${t.direction}${t.valor}`), ["SAIDA12", "ENTRADA300", "SAIDA500", "SAIDA12", "SAIDA80"]);
});
