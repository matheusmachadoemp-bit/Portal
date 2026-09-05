"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";

// Atalhos de criação rápida — só aponta para telas que já existem hoje no
// Portal (nada de destino inventado). "Agendar reunião" sempre manda para o
// setor Gerência: não há como inferir o setor do usuário logado (o modelo
// User não tem esse campo), e como este painel é exclusivo de
// Proprietário/Gerente, Gerência é o destino correto por padrão.
const QUICK_ACTIONS: { label: string; href: string; icon: string }[] = [
  { label: "Criar tarefa", href: "/portal/tarefas", icon: "ListTodo" },
  { label: "Preencher checklist", href: "/portal/tarefas/checklist", icon: "ClipboardCheck" },
  { label: "Criar meta", href: "/portal/metas/cadastro", icon: "Target" },
  { label: "Agendar reunião", href: "/portal/reuniao/gerente", icon: "Users" },
];

export function QuickActionMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition"
      >
        <Plus size={14} /> Ação rápida <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-60 nord-card bg-nord-card shadow-xl py-1.5">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/5 transition"
              >
                <span className="w-7 h-7 rounded-lg bg-nord-blue/15 flex items-center justify-center text-nord-blue-light shrink-0">
                  <DynamicIcon name={action.icon} size={14} />
                </span>
                {action.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
