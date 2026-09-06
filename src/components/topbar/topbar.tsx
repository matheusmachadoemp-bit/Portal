"use client";

import { Search, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useMobileSidebar } from "@/components/sidebar/mobile-sidebar-context";
import { UserMenu, type UserProfile } from "./user-menu";

function nowInSaoPaulo() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }),
  };
}

/** Só passa a mostrar a hora após montar no cliente, para não divergir da renderização no servidor. */
function Clock() {
  const [value, setValue] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inicia o relógio só no cliente, evitando divergência com a renderização no servidor
    setValue(nowInSaoPaulo());
    const id = setInterval(() => setValue(nowInSaoPaulo()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!value) return null;

  return (
    <div className="hidden sm:flex flex-col items-end leading-tight">
      <span className="text-white text-sm font-medium tabular-nums">{value.time}</span>
      <span className="text-nord-gray text-[11px] tabular-nums">{value.date}</span>
    </div>
  );
}

export function Topbar({
  title,
  subtitle,
  user = null,
}: {
  title: string;
  subtitle?: string;
  user?: UserProfile | null;
}) {
  const { setOpen: setMobileMenuOpen } = useMobileSidebar();

  return (
    <header className="h-16 border-b border-nord-border bg-nord-panel/60 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden shrink-0 text-nord-gray hover:text-white p-2 -ml-2 rounded-lg hover:bg-white/5"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-white font-semibold text-lg leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-nord-gray text-xs truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            placeholder="Pesquisar no portal..."
            className="bg-nord-card border border-nord-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue w-64"
          />
        </div>
        <Clock />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
