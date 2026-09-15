"use client";

import { useMemo, useState } from "react";
import { Check, Store } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import type { NotificacaoUserOption } from "../types";

const ROLE_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ADMINISTRADOR: "danger",
  GESTOR: "info",
  GERENTE: "info",
  SUPERVISOR: "warning",
  COLABORADOR: "default",
};

function sameIds(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Nota compacta sobre a parte de aprovação financeira, que ainda não existe (fica para uma próxima etapa). */
function AprovacaoFinanceiraNota() {
  return (
    <div className="nord-card p-4">
      <p className="text-xs text-nord-gray">Limites de aprovação financeira: em breve.</p>
    </div>
  );
}

export function ConfiguracoesNotificacaoClient({
  empresaName,
  users,
  initialConfiguredUserIds,
  canEdit,
}: {
  /** Nome da loja ativa, ou `null` quando o modo ativo é "Grupo Nord" (consolidado) ou não há loja selecionável. */
  empresaName: string | null;
  users: NotificacaoUserOption[];
  initialConfiguredUserIds: string[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialConfiguredUserIds));
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(initialConfiguredUserIds));
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => !sameIds(selected, savedIds), [selected, savedIds]);

  function toggle(id: string) {
    setJustSaved(false);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setJustSaved(false);
    setError(null);
    setSelected(new Set(users.map((u) => u.id)));
  }

  function clearAll() {
    setJustSaved(false);
    setError(null);
    setSelected(new Set());
  }

  async function salvar() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/manutencao/configuracoes/notificacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar as configurações. Tente novamente.");
        return;
      }
      setSavedIds(new Set<string>(data.configuredUserIds ?? Array.from(selected)));
      setJustSaved(true);
    } catch {
      setError("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (!empresaName) {
    return (
      <div className="space-y-6">
        <Section title="Quem recebe notificação de chamado novo">
          <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
            <div className="w-12 h-12 rounded-2xl bg-nord-blue/15 flex items-center justify-center">
              <Store size={22} className="text-nord-blue-light" />
            </div>
            <p className="text-sm text-nord-gray max-w-sm">
              Selecione uma loja específica no menu lateral para configurar quem recebe notificação de chamado novo.
              Essa configuração é feita loja por loja e não fica disponível no modo consolidado &quot;Grupo Nord&quot;.
            </p>
          </div>
        </Section>
        <AprovacaoFinanceiraNota />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="Quem recebe notificação de chamado novo"
        action={
          canEdit && users.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={selectAll} className="text-xs text-nord-blue-light hover:text-white">
                Selecionar todos
              </button>
              <button onClick={clearAll} className="text-xs text-nord-gray hover:text-white">
                Limpar tudo
              </button>
              <button
                onClick={salvar}
                disabled={!dirty || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
              >
                {saving ? (
                  "Salvando..."
                ) : justSaved && !dirty ? (
                  <>
                    <Check size={13} /> Salvo
                  </>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          ) : undefined
        }
      >
        <p className="text-sm text-nord-gray mb-4">
          Esses usuários recebem uma notificação toda vez que um chamado novo de manutenção é aberto em{" "}
          <span className="text-white font-medium">{empresaName}</span> — independente da prioridade do chamado ou de
          quem for definido como responsável.
        </p>

        {!canEdit && (
          <p className="text-xs text-nord-warning mb-3">Seu perfil de permissão só permite visualizar esta lista.</p>
        )}

        {users.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-8">
            Nenhum usuário disponível para configurar notificações nesta loja.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto nord-scrollbar -mx-1">
            {users.map((u) => (
              <label
                key={u.id}
                className={`flex items-center gap-3 px-1 py-2.5 border-b border-nord-border/50 last:border-0 rounded-lg ${
                  canEdit ? "cursor-pointer hover:bg-white/5" : "cursor-default opacity-80"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-nord-blue shrink-0"
                  checked={selected.has(u.id)}
                  disabled={!canEdit}
                  onChange={() => toggle(u.id)}
                />
                <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white truncate">{u.name}</span>
                  <Badge tone={ROLE_TONE[u.role] ?? "default"}>{u.role}</Badge>
                  <span className="text-xs text-nord-gray truncate">{u.email}</span>
                </div>
              </label>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      </Section>

      <AprovacaoFinanceiraNota />
    </div>
  );
}
