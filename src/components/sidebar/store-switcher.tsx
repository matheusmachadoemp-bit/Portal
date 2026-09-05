"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Building2, Layers } from "lucide-react";
import { GRUPO_SENTINEL } from "@/lib/empresa-constants";

type EmpresaDTO = { id: string; key: string; name: string; color: string; logo: string | null };

export function StoreSwitcher({
  empresas,
  activeEmpresaId,
  canViewGrupoNord,
  collapsed,
  compact = false,
}: {
  empresas: EmpresaDTO[];
  activeEmpresaId: string;
  canViewGrupoNord: boolean;
  collapsed: boolean;
  /** Versão enxuta (botão de uma linha só), para uso fora da Sidebar — ex.: barra de filtros da Tela de Início. Reaproveita o mesmo estado/lógica de troca de loja, só muda a aparência do botão. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const router = useRouter();

  const isGrupo = activeEmpresaId === GRUPO_SENTINEL;
  const active = empresas.find((e) => e.id === activeEmpresaId);
  const label = isGrupo ? "Grupo Nord" : active?.name ?? "Selecionar loja";
  const color = isGrupo ? "#ffffff" : active?.color ?? "#2952E3";

  async function switchTo(empresaId: string) {
    if (empresaId === activeEmpresaId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    await fetch("/api/empresa-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId }),
    });
    setOpen(false);
    setSwitching(false);
    router.refresh();
  }

  if (empresas.length <= 1 && !canViewGrupoNord) {
    // Nada para trocar — mostra só a identificação da loja atual.
    if (compact) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-panel border border-nord-border text-white">
          <Building2 size={13} style={{ color }} />
          <span className="truncate max-w-[160px]">{label}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 px-3 py-2 mx-2 mb-2 rounded-lg bg-nord-card border border-nord-border">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}22` }}
        >
          <Building2 size={13} style={{ color }} />
        </div>
        {!collapsed && <span className="text-xs text-white truncate">{label}</span>}
      </div>
    );
  }

  return (
    <div className={compact ? "relative" : "relative mx-2 mb-2"}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className={
          compact
            ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-panel border border-nord-border text-white hover:border-nord-blue transition disabled:opacity-60"
            : "w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-nord-card border border-nord-border hover:border-nord-blue transition disabled:opacity-60"
        }
      >
        {compact ? (
          <>
            {isGrupo ? (
              <Layers size={13} className="text-nord-blue-light" />
            ) : (
              <Building2 size={13} style={{ color }} />
            )}
            <span className="truncate max-w-[160px]">{label}</span>
            <ChevronsUpDown size={12} className="text-nord-gray shrink-0" />
          </>
        ) : (
          <>
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: isGrupo ? "#2952E322" : `${color}22` }}
            >
              {isGrupo ? (
                <Layers size={13} className="text-nord-blue-light" />
              ) : (
                <Building2 size={13} style={{ color }} />
              )}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[10px] text-nord-gray leading-none mb-0.5">Loja atual</p>
                  <p className="text-xs text-white font-medium truncate">{label}</p>
                </div>
                <ChevronsUpDown size={13} className="text-nord-gray shrink-0" />
              </>
            )}
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 nord-card bg-nord-card shadow-xl py-1.5">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-nord-gray/70">Lojas</p>
            {empresas.map((e) => (
              <button
                key={e.id}
                onClick={() => switchTo(e.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5"
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${e.color}22` }}
                >
                  <Building2 size={11} style={{ color: e.color }} />
                </div>
                <span className="flex-1 text-left text-white truncate">{e.name}</span>
                {e.id === activeEmpresaId && <Check size={13} className="text-emerald-400" />}
              </button>
            ))}
            {canViewGrupoNord && (
              <>
                <div className="my-1 border-t border-nord-border" />
                <button
                  onClick={() => switchTo(GRUPO_SENTINEL)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-nord-blue/20">
                    <Layers size={11} className="text-nord-blue-light" />
                  </div>
                  <span className="flex-1 text-left text-white">Grupo Nord (consolidado)</span>
                  {isGrupo && <Check size={13} className="text-emerald-400" />}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
