"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/rh/colaboradores", label: "Colaboradores" },
  { href: "/portal/rh/financeiro", label: "Financeiro" },
  { href: "/portal/rh/ponto-eletronico", label: "Ponto Eletrônico" },
  { href: "/portal/rh/ocorrencias", label: "Ocorrências" },
  { href: "/portal/rh/ferias", label: "Férias" },
  { href: "/portal/rh/uniformes", label: "Uniformes" },
  { href: "/portal/rh/documentos", label: "Documentos" },
  { href: "/portal/rh/dashboard", label: "Dashboard" },
];

export function RhTabs() {
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
