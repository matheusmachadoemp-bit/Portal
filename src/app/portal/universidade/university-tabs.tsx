"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/universidade/dashboard", label: "Dashboard" },
  { href: "/portal/universidade/trilhas", label: "Trilhas de Aprendizagem" },
  { href: "/portal/universidade/cursos", label: "Cursos" },
  { href: "/portal/universidade/videoaulas", label: "Videoaulas" },
  { href: "/portal/universidade/avaliacoes", label: "Avaliações" },
  { href: "/portal/universidade/certificados", label: "Certificados" },
  { href: "/portal/universidade/colaboradores", label: "Colaboradores" },
  { href: "/portal/universidade/ranking", label: "Ranking" },
  { href: "/portal/universidade/biblioteca", label: "Biblioteca" },
  { href: "/portal/universidade/relatorios", label: "Relatórios" },
];

const GESTOR_TAB = { href: "/portal/universidade/gestor", label: "Painel do Gestor" };

export function UniversityTabs({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...TABS, GESTOR_TAB] : TABS;
  return (
    <div className="flex gap-2 flex-wrap">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
            pathname === t.href || pathname.startsWith(t.href + "/")
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
