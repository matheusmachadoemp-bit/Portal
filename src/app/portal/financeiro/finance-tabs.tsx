"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/financeiro/dashboard", label: "Dashboard" },
  { href: "/portal/financeiro/contas-a-pagar", label: "Contas a Pagar" },
  { href: "/portal/financeiro/contas-a-receber", label: "Contas a Receber" },
  { href: "/portal/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa" },
  { href: "/portal/financeiro/caixa-da-empresa", label: "Caixa da Empresa" },
  { href: "/portal/financeiro/dre", label: "DRE" },
  { href: "/portal/financeiro/categorias-financeiras", label: "Categorias" },
  { href: "/portal/financeiro/contas-bancarias", label: "Contas Bancárias" },
  { href: "/portal/financeiro/relatorios", label: "Relatórios" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
            pathname === t.href
              ? "bg-nord-blue text-white"
              : "border border-nord-border text-nord-gray hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export const COMPANY_LABEL: Record<string, string> = {
  ALL: "Grupo Nord (consolidado)",
  NORD_PIZZA: "Nord Pizza & Burger",
  ZARKI_SUSHI: "Zarki Sushi",
  GRUPO_NORD: "Grupo Nord (rateio)",
};

export const COMPANY_OPTIONS = ["ALL", "NORD_PIZZA", "ZARKI_SUSHI", "GRUPO_NORD"];
