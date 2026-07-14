"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/administrativo/senhas", label: "Senhas" },
  { href: "/portal/administrativo/cursos", label: "Cursos" },
  { href: "/portal/administrativo/cartilhas", label: "Cartilhas" },
  { href: "/portal/administrativo/logo", label: "Logo" },
  { href: "/portal/administrativo/arquivos", label: "Arquivos" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
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
