"use client";

import { Section } from "@/components/ui/stat-card";
import { Download, Printer } from "lucide-react";
import { format } from "date-fns";

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

const REPORTS = [
  {
    key: "pagar",
    title: "Contas a Pagar",
    description: "Todos os lançamentos de contas a pagar cadastrados.",
    endpoint: "/api/financeiro/pagar",
    map: (d: { payables: Record<string, unknown>[] }) => ({
      header: ["Número", "Fornecedor", "Descrição", "Empresa", "Valor", "Vencimento", "Status"],
      rows: d.payables.map((p) => [
        String(p.number),
        String(p.fornecedor),
        String(p.descricao),
        String((p.empresa as { name: string }).name),
        String(p.valor),
        format(new Date(p.dataVencimento as string), "dd/MM/yyyy"),
        String(p.status),
      ]),
    }),
  },
  {
    key: "receber",
    title: "Contas a Receber",
    description: "Todos os lançamentos de contas a receber cadastrados.",
    endpoint: "/api/financeiro/receber",
    map: (d: { receivables: Record<string, unknown>[] }) => ({
      header: ["Número", "Cliente", "Descrição", "Empresa", "Valor", "Vencimento", "Status"],
      rows: d.receivables.map((r) => [
        String(r.number),
        String(r.cliente),
        String(r.descricao),
        String((r.empresa as { name: string }).name),
        String(r.valor),
        format(new Date(r.dataVencimento as string), "dd/MM/yyyy"),
        String(r.status),
      ]),
    }),
  },
  {
    key: "dre",
    title: "DRE do mês atual",
    description: "Demonstração do Resultado do Exercício consolidada.",
    endpoint: `/api/financeiro/dre?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`,
    map: (d: { rows: Record<string, unknown>[] }) => ({
      header: ["Linha", "Valor", "%"],
      rows: d.rows.map((r) => [String(r.label), String(r.value), String(r.percent)]),
    }),
  },
  {
    key: "caixa",
    title: "Movimentações do Caixa",
    description: "Histórico completo de movimentações do caixa da empresa.",
    endpoint: "/api/financeiro/caixa",
    map: (d: { movements: Record<string, unknown>[] }) => ({
      header: ["Data", "Tipo", "Conta", "Valor", "Descrição"],
      rows: d.movements.map((m) => [
        format(new Date(m.date as string), "dd/MM/yyyy"),
        String(m.type),
        String((m.bankAccount as { name: string }).name),
        String(m.valor),
        String(m.descricao ?? ""),
      ]),
    }),
  },
];

export function RelatoriosClient() {
  async function handleExport(report: (typeof REPORTS)[number]) {
    const res = await fetch(report.endpoint);
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { header, rows } = report.map(data as any);
    downloadCsv(`${report.key}-${format(new Date(), "yyyy-MM-dd")}.csv`, header, rows);
  }

  return (
    <Section title="Relatórios e exportações">
      <p className="text-xs text-nord-gray mb-4">
        Exporte qualquer relatório em Excel (CSV) ou use o botão de impressão para gerar um PDF do
        relatório atualmente aberto em qualquer tela do módulo financeiro.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <div key={r.key} className="nord-card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-white text-sm font-medium">{r.title}</p>
              <p className="text-xs text-nord-gray">{r.description}</p>
            </div>
            <button
              onClick={() => handleExport(r)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium shrink-0"
            >
              <Download size={13} /> Excel/CSV
            </button>
          </div>
        ))}
        <div className="nord-card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-white text-sm font-medium">Imprimir tela atual</p>
            <p className="text-xs text-nord-gray">Gera um PDF a partir da página que estiver aberta.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white shrink-0"
          >
            <Printer size={13} /> Imprimir / PDF
          </button>
        </div>
      </div>
    </Section>
  );
}
