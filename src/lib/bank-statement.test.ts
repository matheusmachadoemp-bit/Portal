import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
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
