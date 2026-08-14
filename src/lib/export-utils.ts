import * as XLSX from "xlsx";

/** Exporta uma lista de objetos simples (chave = cabeçalho da coluna) para um arquivo .xlsx. */
export function exportRowsToExcel(filename: string, sheetName: string, rows: Record<string, string | number>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function printCurrentPage() {
  window.print();
}
