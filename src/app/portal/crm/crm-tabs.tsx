"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DynamicIcon } from "@/components/dynamic-icon";

const TABS = [
  { href: "/portal/crm/dashboard", label: "Visão Geral", icon: "LayoutDashboard" },
  { href: "/portal/crm/clientes", label: "Clientes", icon: "BookUser" },
  { href: "/portal/crm/segmentos", label: "Segmentos", icon: "PieChart" },
  { href: "/portal/crm/funil", label: "Funil", icon: "Filter" },
  { href: "/portal/crm/campanhas", label: "Campanhas", icon: "Megaphone" },
  { href: "/portal/crm/automacoes", label: "Automações", icon: "Workflow" },
  { href: "/portal/crm/fidelidade", label: "Fidelidade", icon: "Gift" },
  { href: "/portal/crm/aniversariantes", label: "Aniversariantes", icon: "Cake" },
  { href: "/portal/crm/satisfacao", label: "Satisfação / NPS", icon: "Smile" },
  { href: "/portal/crm/inteligencia", label: "Inteligência", icon: "BrainCircuit" },
  { href: "/portal/crm/relatorios", label: "Relatórios", icon: "FileBarChart" },
];

export function CrmTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              active
                ? "bg-nord-blue text-white"
                : "border border-nord-border text-nord-gray hover:text-white hover:border-nord-blue/50"
            }`}
          >
            <DynamicIcon name={t.icon} size={13} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
