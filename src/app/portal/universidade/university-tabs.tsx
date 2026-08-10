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

export function UniversityTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 flex-wrap">
      {TABS.map((t) => (
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
