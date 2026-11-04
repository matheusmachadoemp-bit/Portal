/** Exporta uma lista de objetos simples (chave = cabeçalho da coluna) para um arquivo .xlsx. */
export async function exportRowsToExcel(filename: string, sheetName: string, rows: Record<string, string | number>[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));

  if (rows.length > 0) {
    // União das chaves de todas as linhas (não só a primeira) — algumas telas exportam linhas
    // cujas colunas variam de uma linha pra outra.
    const headers: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!headers.includes(key)) headers.push(key);
      }
    }
    worksheet.addRow(headers);
    for (const row of rows) worksheet.addRow(headers.map((h) => row[h] ?? ""));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function printCurrentPage() {
  window.print();
}

/** Escapa um campo de texto livre pra CSV: embrulha em aspas (dobrando aspas internas) quando o
 *  valor contém o delimitador escolhido, aspas ou quebra de linha — sem isso um `;`/`,` dentro de um
 *  campo como fornecedor/cliente/descrição desalinha as colunas silenciosamente. Reaproveitado pelas
 *  telas que montam o CSV "na mão" (fora de `exportRowsToCsv`), como Contas a Pagar/Receber, que usam
 *  `;` como delimitador. */
export function csvField(value: string | number, delimiter: "," | ";" = ","): string {
  const s = String(value);
  const unsafe = delimiter === ";" ? /[;"\n]/ : /[,"\n]/;
  return unsafe.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exporta uma lista de objetos simples (chave = cabeçalho da coluna) para um arquivo .csv. */
export function exportRowsToCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => csvField(row[h])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
