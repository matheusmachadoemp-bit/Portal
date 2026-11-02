"use client";

import { Plus, Building2, Layers } from "lucide-react";
import { format, isToday } from "date-fns";
import type { NordAiConversation } from "./types";

/** Mesmo padrão visual de "badge de loja" do `StoreSwitcher` (`src/components/sidebar/
 * store-switcher.tsx`): ícone pequeno num fundo da cor da empresa a ~13% de opacidade. `Layers`
 * + azul de marca para "Grupo Nord" (conversa consolidada, `empresaId: null`), `Building2` + cor
 * própria da empresa para uma loja específica. */
function EmpresaBadge({ empresa }: { empresa: NordAiConversation["empresa"] }) {
  const isGrupo = !empresa;
  const color = isGrupo ? "#2952E3" : empresa.color;
  return (
    <div className="flex items-center gap-1 min-w-0">
      <div
        className="w-4 h-4 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}22` }}
      >
        {isGrupo ? <Layers size={10} className="text-nord-blue-light" /> : <Building2 size={10} style={{ color }} />}
      </div>
      <span className="text-[11px] text-nord-gray truncate">{isGrupo ? "Grupo Nord" : empresa.name}</span>
    </div>
  );
}

/** Hoje -> só a hora ("14:32"); outro dia -> data curta ("28/10"). Mesmo racional de
 * `nowInSaoPaulo`/`Clock` do Topbar, mas sem relógio ao vivo — só formata um timestamp já
 * recebido da API. */
function formatConversationTimestamp(iso: string): string {
  const date = new Date(iso);
  return isToday(date) ? format(date, "HH:mm") : format(date, "dd/MM");
}

export function NordAiConversationList({
  conversations,
  loading,
  error,
  createError,
  selectedId,
  onSelect,
  onNewConversation,
  creating,
}: {
  conversations: NordAiConversation[];
  loading: boolean;
  error: string | null;
  createError: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  creating: boolean;
}) {
  return (
    <div className="nord-card flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-nord-border shrink-0">
        <button
          onClick={onNewConversation}
          disabled={creating}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light text-white font-medium disabled:opacity-60 transition"
        >
          <Plus size={15} />
          {creating ? "Criando..." : "Nova conversa"}
        </button>
        {createError && <p className="text-xs text-nord-danger mt-2">{createError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto nord-scrollbar">
        {loading && <p className="p-4 text-center text-sm text-nord-gray">Carregando conversas...</p>}

        {!loading && error && <p className="p-4 text-center text-sm text-nord-danger">{error}</p>}

        {!loading && !error && conversations.length === 0 && (
          <p className="p-6 text-center text-sm text-nord-gray">
            Nenhuma conversa ainda. Clique em &ldquo;Nova conversa&rdquo; para começar.
          </p>
        )}

        {!loading &&
          !error &&
          conversations.map((conv) => {
            const active = conv.id === selectedId;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-nord-border/60 transition ${
                  active ? "bg-nord-blue/15" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-sm truncate ${active ? "text-white font-medium" : "text-white/90"}`}>
                    {conv.title}
                  </span>
                  <span className="text-[11px] text-nord-gray shrink-0">
                    {formatConversationTimestamp(conv.updatedAt)}
                  </span>
                </div>
                <EmpresaBadge empresa={conv.empresa} />
              </button>
            );
          })}
      </div>
    </div>
  );
}
