"use client";

import { useActionState, useState } from "react";
import { Section, Badge } from "@/components/ui/stat-card";
import { changePasswordAction } from "@/app/actions/account";
import { format } from "date-fns";

const INTEGRATIONS = [
  { name: "iFood", webhook: "/api/webhooks/ifood", status: "Aguardando configuração" },
  { name: "99Food", webhook: "/api/webhooks/99food", status: "Aguardando configuração" },
  { name: "Site próprio", webhook: "/api/webhooks/site", status: "Aguardando configuração" },
  { name: "Google Ads", webhook: "/api/webhooks/google-ads", status: "Aguardando configuração" },
];

export function ConfiguracoesClient({
  userName,
  userEmail,
  userRole,
  isAdmin,
  auditLogs,
  taxaIfoodPadrao,
  empresaNome,
  saipos,
  metaAds,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
  isAdmin: boolean;
  auditLogs: { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; userName: string }[];
  taxaIfoodPadrao: number | null;
  empresaNome: string | null;
  saipos: { lojaId: string | null; syncEnabled: boolean; hasToken: boolean; lastSyncAt: string | null } | null;
  metaAds: {
    adAccountId: string | null;
    adAccountName: string | null;
    graphVersion: string;
    instagramAccountId: string | null;
    instagramUsername: string | null;
    syncEnabled: boolean;
    hasToken: boolean;
    lastSyncAt: string | null;
  } | null;
}) {
  const [state, formAction, pending] = useActionState(changePasswordAction, {});
  const [ifoodValue, setIfoodValue] = useState(taxaIfoodPadrao !== null ? String(taxaIfoodPadrao) : "");
  const [ifoodSaving, setIfoodSaving] = useState(false);
  const [ifoodMessage, setIfoodMessage] = useState<string | null>(null);

  const [saiposToken, setSaiposToken] = useState("");
  const [saiposLojaId, setSaiposLojaId] = useState(saipos?.lojaId ?? "");
  const [saiposSyncEnabled, setSaiposSyncEnabled] = useState(saipos?.syncEnabled ?? false);
  const [saiposHasToken, setSaiposHasToken] = useState(saipos?.hasToken ?? false);
  const [saiposSaving, setSaiposSaving] = useState(false);
  const [saiposSyncing, setSaiposSyncing] = useState(false);
  const [saiposMessage, setSaiposMessage] = useState<string | null>(null);

  async function saveSaiposConfig() {
    setSaiposSaving(true);
    setSaiposMessage(null);
    const res = await fetch("/api/configuracoes/saipos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiToken: saiposToken, lojaId: saiposLojaId, syncEnabled: saiposSyncEnabled }),
    });
    const data = await res.json().catch(() => ({}));
    setSaiposSaving(false);
    if (res.ok && saiposToken) setSaiposHasToken(true);
    setSaiposToken("");
    setSaiposMessage(res.ok ? "Configuração da Saipos salva com sucesso." : data.error ?? "Não foi possível salvar.");
  }

  async function syncSaiposNow() {
    setSaiposSyncing(true);
    setSaiposMessage(null);
    const res = await fetch("/api/integracoes/saipos/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSaiposSyncing(false);
    setSaiposMessage(
      res.ok ? `Sincronização concluída: ${data.recordsSynced} venda(s) importada(s).` : data.error ?? "Falha ao sincronizar."
    );
  }

  const [metaToken, setMetaToken] = useState("");
  const [metaAdAccountId, setMetaAdAccountId] = useState(metaAds?.adAccountId ?? "");
  const [metaGraphVersion, setMetaGraphVersion] = useState(metaAds?.graphVersion ?? "v21.0");
  const [metaSyncEnabled, setMetaSyncEnabled] = useState(metaAds?.syncEnabled ?? false);
  const [metaHasToken, setMetaHasToken] = useState(metaAds?.hasToken ?? false);
  const [metaAdAccountName, setMetaAdAccountName] = useState(metaAds?.adAccountName ?? "");
  const [metaInstagramAccountId, setMetaInstagramAccountId] = useState(metaAds?.instagramAccountId ?? "");
  const [metaInstagramUsername, setMetaInstagramUsername] = useState(metaAds?.instagramUsername ?? "");
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaMessage, setMetaMessage] = useState<string | null>(null);

  async function saveMetaAdsConfig() {
    setMetaSaving(true);
    setMetaMessage(null);
    const res = await fetch("/api/configuracoes/meta-ads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: metaToken,
        adAccountId: metaAdAccountId,
        graphVersion: metaGraphVersion,
        instagramAccountId: metaInstagramAccountId,
        syncEnabled: metaSyncEnabled,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setMetaSaving(false);
    if (res.ok) {
      if (metaToken) setMetaHasToken(true);
      if (data.adAccountName) setMetaAdAccountName(data.adAccountName);
      setMetaInstagramUsername(metaInstagramAccountId ? data.instagramUsername ?? "" : "");
    }
    setMetaToken("");
    setMetaMessage(res.ok ? "Configuração do Meta Ads salva com sucesso." : data.error ?? "Não foi possível salvar.");
  }

  async function syncMetaAdsNow() {
    setMetaSyncing(true);
    setMetaMessage(null);
    const res = await fetch("/api/integracoes/meta-ads/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMetaSyncing(false);
    setMetaMessage(
      res.ok ? `Sincronização concluída: ${data.recordsSynced} registro(s) importado(s).` : data.error ?? "Falha ao sincronizar."
    );
  }

  async function saveIfoodRate() {
    setIfoodSaving(true);
    setIfoodMessage(null);
    const res = await fetch("/api/configuracoes/ifood", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxaIfoodPadrao: ifoodValue }),
    });
    setIfoodSaving(false);
    setIfoodMessage(res.ok ? "Taxa atualizada com sucesso." : "Não foi possível atualizar a taxa.");
  }

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

      {isAdmin && (
        <Section title="Ficha Técnica — Taxa iFood padrão">
          {taxaIfoodPadrao === null ? (
            <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
              Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
              configurar a taxa iFood padrão.
            </p>
          ) : (
            <div className="flex items-end gap-3 max-w-md">
              <label className="block flex-1">
                <span className="block text-xs text-nord-gray mb-1">Taxa iFood padrão para {empresaNome} (%)</span>
                <input
                  type="number"
                  value={ifoodValue}
                  onChange={(e) => setIfoodValue(e.target.value)}
                  className="input"
                />
              </label>
              <button
                onClick={saveIfoodRate}
                disabled={ifoodSaving}
                className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
              >
                Salvar
              </button>
            </div>
          )}
          {ifoodMessage && <p className="text-xs text-emerald-400 mt-2">{ifoodMessage}</p>}
          <p className="text-xs text-nord-gray mt-3">
            Usada para calcular o preço sugerido no iFood em cada ficha técnica. Pode ser sobrescrita
            individualmente em cada produto.
          </p>
        </Section>
      )}

      {isAdmin && (
        <Section title="Integração Saipos — vendas">
          {saipos === null ? (
            <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
              Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
              configurar a integração com a Saipos.
            </p>
          ) : (
            <>
              <p className="text-xs text-nord-gray mb-4">
                Conecta o Portal à API de Dados da Saipos para importar vendas automaticamente
                (endpoint <code>search_sales</code>). O token é armazenado de forma criptografada.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Token da API (Bearer)</span>
                  <input
                    type="password"
                    value={saiposToken}
                    onChange={(e) => setSaiposToken(e.target.value)}
                    placeholder={saiposHasToken ? "•••••••• (configurado)" : "Cole o token aqui"}
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">ID da loja na Saipos (opcional)</span>
                  <input
                    type="text"
                    value={saiposLojaId}
                    onChange={(e) => setSaiposLojaId(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    checked={saiposSyncEnabled}
                    onChange={(e) => setSaiposSyncEnabled(e.target.checked)}
                  />
                  <span className="text-xs text-nord-gray">Sincronização automática diária ativa</span>
                </label>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={saveSaiposConfig}
                  disabled={saiposSaving}
                  className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 px-4"
                >
                  {saiposSaving ? "Salvando..." : "Salvar configuração"}
                </button>
                <button
                  onClick={syncSaiposNow}
                  disabled={saiposSyncing || !saiposHasToken}
                  className="bg-nord-panel border border-nord-border hover:border-nord-blue disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 px-4"
                >
                  {saiposSyncing ? "Sincronizando..." : "Sincronizar agora"}
                </button>
                {saipos.lastSyncAt && (
                  <span className="text-xs text-nord-gray">
                    Última sincronização: {format(new Date(saipos.lastSyncAt), "dd/MM/yyyy HH:mm")}
                  </span>
                )}
              </div>
              {saiposMessage && <p className="text-xs text-emerald-400 mt-2">{saiposMessage}</p>}
            </>
          )}
        </Section>
      )}

      {isAdmin && (
        <Section title="Integração Meta Ads — tráfego pago">
          {metaAds === null ? (
            <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2">
              Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para
              configurar a integração com o Meta Ads.
            </p>
          ) : (
            <>
              <p className="text-xs text-nord-gray mb-4">
                Conecta o Portal à Graph API da Meta para importar investimento, alcance, impressões e
                resultados de campanhas automaticamente, preenchendo o lançamento mensal de{" "}
                <strong>Tráfego Pago</strong>. Também busca o número de seguidores do Instagram, se o ID da
                conta for informado. O token é armazenado de forma criptografada e precisa da permissão{" "}
                <code>ads_read</code>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-4xl">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Token de acesso (Graph API)</span>
                  <input
                    type="password"
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder={metaHasToken ? "•••••••• (configurado)" : "Cole o token aqui"}
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">ID da conta de anúncios</span>
                  <input
                    type="text"
                    value={metaAdAccountId}
                    onChange={(e) => setMetaAdAccountId(e.target.value)}
                    placeholder="Ex: 3975948865839697"
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Versão da Graph API</span>
                  <input
                    type="text"
                    value={metaGraphVersion}
                    onChange={(e) => setMetaGraphVersion(e.target.value)}
                    placeholder="v21.0"
                    className="input"
                  />
                </label>
                <label className="flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    checked={metaSyncEnabled}
                    onChange={(e) => setMetaSyncEnabled(e.target.checked)}
                  />
                  <span className="text-xs text-nord-gray">Sincronização automática diária ativa</span>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-4xl mt-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">ID da conta do Instagram (opcional)</span>
                  <input
                    type="text"
                    value={metaInstagramAccountId}
                    onChange={(e) => setMetaInstagramAccountId(e.target.value)}
                    placeholder="Ex: 17841452307575010"
                    className="input"
                  />
                </label>
              </div>
              {metaAdAccountName && (
                <p className="text-xs text-nord-gray mt-2">
                  Conta de anúncios conectada: <span className="text-white">{metaAdAccountName}</span>
                </p>
              )}
              {metaInstagramUsername && (
                <p className="text-xs text-nord-gray mt-1">
                  Instagram conectado: <span className="text-white">@{metaInstagramUsername}</span>
                </p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={saveMetaAdsConfig}
                  disabled={metaSaving}
                  className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 px-4"
                >
                  {metaSaving ? "Salvando..." : "Salvar configuração"}
                </button>
                <button
                  onClick={syncMetaAdsNow}
                  disabled={metaSyncing || !metaHasToken}
                  className="bg-nord-panel border border-nord-border hover:border-nord-blue disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 px-4"
                >
                  {metaSyncing ? "Sincronizando..." : "Sincronizar agora"}
                </button>
                {metaAds.lastSyncAt && (
                  <span className="text-xs text-nord-gray">
                    Última sincronização: {format(new Date(metaAds.lastSyncAt), "dd/MM/yyyy HH:mm")}
                  </span>
                )}
              </div>
              {metaMessage && <p className="text-xs text-emerald-400 mt-2">{metaMessage}</p>}
            </>
          )}
        </Section>
      )}

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
