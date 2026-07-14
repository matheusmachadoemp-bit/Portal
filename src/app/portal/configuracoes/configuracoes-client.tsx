"use client";

import { useActionState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { changePasswordAction } from "@/app/actions/account";
import { format } from "date-fns";

const INTEGRATIONS = [
  { name: "Saipos", webhook: "/api/webhooks/saipos", status: "Aguardando configuração" },
  { name: "iFood", webhook: "/api/webhooks/ifood", status: "Aguardando configuração" },
  { name: "99Food", webhook: "/api/webhooks/99food", status: "Aguardando configuração" },
  { name: "Site próprio", webhook: "/api/webhooks/site", status: "Aguardando configuração" },
  { name: "Meta Ads", webhook: "/api/webhooks/meta-ads", status: "Aguardando configuração" },
  { name: "Google Ads", webhook: "/api/webhooks/google-ads", status: "Aguardando configuração" },
];

export function ConfiguracoesClient({
  userName,
  userEmail,
  userRole,
  isAdmin,
  auditLogs,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
  isAdmin: boolean;
  auditLogs: { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; userName: string }[];
}) {
  const [state, formAction, pending] = useActionState(changePasswordAction, {});

  return (
    <div className="space-y-6">
      <Section title="Minha conta">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div>
            <p className="text-xs text-nord-gray">Nome</p>
            <p className="text-white text-sm">{userName}</p>
          </div>
          <div>
            <p className="text-xs text-nord-gray">E-mail</p>
            <p className="text-white text-sm">{userEmail}</p>
          </div>
          <div>
            <p className="text-xs text-nord-gray">Nível de acesso</p>
            <Badge tone="info">{userRole}</Badge>
          </div>
        </div>

        <form action={formAction} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end max-w-2xl">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Senha atual</span>
            <input name="currentPassword" type="password" required className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nova senha</span>
            <input name="newPassword" type="password" required className="input" />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            Alterar senha
          </button>
        </form>
        {state?.error && <p className="text-sm text-red-400 mt-2">{state.error}</p>}
        {state?.message && <p className="text-sm text-emerald-400 mt-2">{state.message}</p>}
      </Section>

      <Section title="Integrações e webhooks (em preparação)">
        <p className="text-xs text-nord-gray mb-4">
          O Portal Nord está preparado para receber dados automaticamente destas plataformas.
          As credenciais e o mapeamento de campos podem ser configurados assim que os
          convênios forem liberados.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {INTEGRATIONS.map((i) => (
            <div key={i.name} className="flex items-center justify-between bg-nord-panel border border-nord-border rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm text-white">{i.name}</p>
                <p className="text-xs text-nord-gray font-mono">{i.webhook}</p>
              </div>
              <Badge tone="warning">{i.status}</Badge>
            </div>
          ))}
        </div>
      </Section>

      {isAdmin && (
        <Section title="Auditoria — últimas alterações no sistema">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Usuário</th>
                  <th className="py-2 pr-4">Ação</th>
                  <th className="py-2 pr-4">Entidade</th>
                  <th className="py-2 pr-4">Data</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((l) => (
                  <tr key={l.id} className="border-b border-nord-border/50">
                    <td className="py-2 pr-4 text-white">{l.userName}</td>
                    <td className="py-2 pr-4 text-nord-gray">{l.action}</td>
                    <td className="py-2 pr-4 text-nord-gray">{l.entityType}</td>
                    <td className="py-2 pr-4 text-nord-gray">{format(new Date(l.createdAt), "dd/MM/yyyy HH:mm")}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-nord-gray">
                      Nenhum registro de auditoria ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}
