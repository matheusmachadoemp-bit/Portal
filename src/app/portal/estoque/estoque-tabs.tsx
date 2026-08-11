"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/estoque/dashboard", label: "Dashboard" },
  { href: "/portal/estoque/movimentacoes", label: "Movimentações" },
  { href: "/portal/ficha-tecnica/insumos", label: "Insumos" },
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
