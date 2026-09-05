"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MobileSidebarContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

/** Guarda se o menu lateral (aberto como painel sobre o conteúdo no celular) está visível. */
export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha o menu ao navegar para uma nova página
    setOpen(false);
  }, [pathname]);

  return <MobileSidebarContext.Provider value={{ open, setOpen }}>{children}</MobileSidebarContext.Provider>;
}

export function useMobileSidebar() {
  const ctx = useContext(MobileSidebarContext);
  if (!ctx) throw new Error("useMobileSidebar deve ser usado dentro de MobileSidebarProvider");
  return ctx;
}
