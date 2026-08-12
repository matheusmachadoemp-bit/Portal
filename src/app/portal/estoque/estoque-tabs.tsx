"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/estoque/dashboard", label: "Visão Geral" },
  { href: "/portal/estoque/contagem-semanal", label: "Contagem Semanal" },
  { href: "/portal/estoque/contagem-mensal", label: "Contagem Mensal" },
  { href: "/portal/estoque/historico-contagens", label: "Histórico de Contagens" },
  { href: "/portal/estoque/produtos", label: "Produtos" },
  { href: "/portal/estoque/categorias", label: "Categorias" },
  { href: "/portal/estoque/compras", label: "Compras" },
  { href: "/portal/estoque/fornecedores", label: "Fornecedores" },
  { href: "/portal/estoque/recebimento", label: "Recebimento" },
  { href: "/portal/estoque/movimentacoes", label: "Movimentações" },
  { href: "/portal/estoque/transferencias", label: "Transferências" },
  { href: "/portal/estoque/perdas", label: "Perdas e Desperdícios" },
  { href: "/portal/estoque/fichas-tecnicas", label: "Fichas Técnicas" },
  { href: "/portal/estoque/cmv-teorico", label: "CMV Teórico" },
  { href: "/portal/estoque/cmv-real", label: "CMV Real" },
  { href: "/portal/estoque/comparativo", label: "Comparativo" },
  { href: "/portal/estoque/relatorios", label: "Relatórios" },
  { href: "/portal/estoque/configuracoes", label: "Configurações" },
];

export function EstoqueTabs() {
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
