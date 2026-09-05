"use client";

import { Search, Building2 } from "lucide-react";
import { NotificationBell } from "@/components/sidebar/notification-bell";
import { UserMenu, type UserProfile } from "./user-menu";

export function Topbar({
  title,
  subtitle,
  empresaLabel,
  empresaColor = "#2952E3",
  user = null,
}: {
  title: string;
  subtitle?: string;
  empresaLabel?: string;
  empresaColor?: string;
  user?: UserProfile | null;
}) {
  return (
    <header className="h-16 border-b border-nord-border bg-nord-panel/60 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-6">
      <div>
        <h1 className="text-white font-semibold text-lg leading-tight">{title}</h1>
        {subtitle && <p className="text-nord-gray text-xs">{subtitle}</p>}
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
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
