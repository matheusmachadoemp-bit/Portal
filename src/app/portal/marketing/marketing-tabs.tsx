"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/marketing/dashboard", label: "Dashboard" },
  { href: "/portal/marketing/calendario", label: "Calendário de Conteúdo" },
  { href: "/portal/marketing/tarefas", label: "Tarefas" },
  { href: "/portal/marketing/campanhas", label: "Campanhas" },
  { href: "/portal/marketing/biblioteca", label: "Biblioteca de Arquivos" },
  { href: "/portal/marketing/drive", label: "Google Drive" },
  { href: "/portal/marketing/ideias", label: "Banco de Ideias" },
  { href: "/portal/marketing/trafego-pago", label: "Tráfego Pago" },
  { href: "/portal/marketing/redes-sociais", label: "Redes Sociais" },
  { href: "/portal/marketing/equipe", label: "Equipe" },
  { href: "/portal/marketing/relatorios", label: "Relatórios" },
];

export function MarketingTabs() {
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
