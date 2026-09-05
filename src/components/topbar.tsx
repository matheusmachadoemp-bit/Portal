"use client";

import { Bell, Search, Building2, Menu } from "lucide-react";
import { useState } from "react";
import { useMobileSidebar } from "@/components/sidebar/mobile-sidebar-context";

export function Topbar({
  title,
  subtitle,
  empresaLabel,
  empresaColor = "#2952E3",
}: {
  title: string;
  subtitle?: string;
  empresaLabel?: string;
  empresaColor?: string;
}) {
  const [showNotifications, setShowNotifications] = useState(false);
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
        {empresaLabel && (
          <span
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
            style={{ color: empresaColor, borderColor: `${empresaColor}55`, backgroundColor: `${empresaColor}15` }}
          >
            <Building2 size={12} />
            Você está gerenciando: {empresaLabel}
          </span>
        )}
        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            placeholder="Pesquisar no portal..."
            className="bg-nord-card border border-nord-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue w-64"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="relative text-nord-gray hover:text-white p-2 rounded-lg hover:bg-white/5"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-nord-blue-light" />
          </button>
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 top-11 z-50 w-80 nord-card bg-nord-card shadow-xl p-3">
                <p className="text-white text-sm font-medium mb-2">Alertas do sistema</p>
                <p className="text-xs text-nord-gray">
                  Configure as regras de alerta em Configurações para receber notificações sobre
                  metas, CMV, ROAS e ocorrências de RH.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
