"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/vendas", label: "Visão geral" },
  { href: "/portal/vendas/lancamentos", label: "Lançamentos" },
  { href: "/portal/vendas/itens-vendidos", label: "Curva ABC" },
  { href: "/portal/vendas/garcons", label: "Desempenho por Garçom" },
  { href: "/portal/vendas/por-hora", label: "Vendas por Hora" },
  { href: "/portal/vendas/periodo", label: "Vendas por Período" },
  { href: "/portal/vendas/pagamento", label: "Forma de Pagamento" },
  { href: "/portal/vendas/entrega", label: "Área de Entrega" },
];

export function VendasTabs() {
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
