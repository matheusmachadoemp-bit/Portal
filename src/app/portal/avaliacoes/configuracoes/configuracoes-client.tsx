"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";

export function ConfiguracoesClient({
  hasEmpresa,
  avaliacoesAutoReplyEnabled: initialEnabled,
  hasIfoodCredentials,
  canEdit,
  canExecute,
  riskKeywords,
}: {
  hasEmpresa: boolean;
  avaliacoesAutoReplyEnabled: boolean;
  hasIfoodCredentials: boolean;
  canEdit: boolean;
  canExecute: boolean;
  riskKeywords: string[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  // Estado SALVO de verdade (confirmado pelo servidor) — separado do `enabled` acima (que já
  // muda ao marcar/desmarcar o checkbox, antes de clicar em "Salvar"). O botão "Sincronizar
  // agora" usa este valor, não `enabled`: sem essa separação, marcar o checkbox e clicar
  // "Sincronizar agora" sem ter salvo antes devolveria o erro "toggle desligado" do servidor de
  // forma confusa (o toggle pareceria ligado na tela, mas ainda não estava salvo).
  const [confirmedEnabled, setConfirmedEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState<string | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  async function salvar() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/avaliacoes/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avaliacoesAutoReplyEnabled: enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Não foi possível salvar.");
        return;
      }
      setSaved(true);
      setConfirmedEnabled(enabled);
    } catch {
      setSaveError("Falha de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function sincronizarAgora() {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/integracoes/avaliacoes/ifood-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "real" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncError(data.error ?? "Não foi possível sincronizar agora.");
        return;
      }
      setSyncMessage(
        `Sincronização concluída: ${data.processed} avaliação(ões) processada(s) — ${data.respondidas} respondida(s), ` +
          `${data.precisaRevisaoManual} para revisão manual, ${data.autoPublicadas} publicada(s) sem resposta, ` +
          `${data.expiradas} expirada(s), ${data.erros} com erro.`
      );
    } catch {
      setSyncError("Falha de conexão. Tente novamente.");
    } finally {
      setSyncing(false);
    }
  }

  /**
   * "Simular" — gera a resposta da IA (com a checagem de palavra-chave de risco de sempre)
   * SEM publicar nada no iFood, mesmo com a resposta automática desligada. Mesma rota do
   * "Sincronizar agora", só muda o `mode` no corpo (ver `src/lib/review-sync.ts`).
   */
  async function simular() {
    setSimulating(true);
    setSimMessage(null);
    setSimError(null);
    try {
      const res = await fetch("/api/integracoes/avaliacoes/ifood-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "simulate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSimError(data.error ?? "Não foi possível simular agora.");
        return;
      }
      setSimMessage(
        `Simulação concluída: ${data.processed} avaliação(ões) processada(s) — ${data.simuladas} prévia(s) gerada(s) (nada foi ` +
          `publicado), ${data.precisaRevisaoManual} cairiam em revisão manual, ${data.erros} com erro. Veja o resultado em ` +
          `Avaliações > Respostas (status "Simulação").`
      );
    } catch {
      setSimError("Falha de conexão. Tente novamente.");
    } finally {
      setSimulating(false);
    }
  }

  if (!hasEmpresa) {
    return (
      <Section title="Configurações">
        <p className="text-sm text-nord-gray">Selecione uma loja específica para ver e editar as configurações de Avaliações.</p>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Resposta automática de avaliações (iFood)">
        <FormError message={saveError} />
        {!canEdit && <p className="text-xs text-nord-warning mb-3">Seu perfil de permissão só permite visualizar.</p>}

        {!hasIfoodCredentials && (
          <p className="text-xs text-nord-warning mb-3">
            Configure antes a credencial do iFood (Configurações &gt; iFood: Client ID, Client Secret e ID da loja) — sem ela não é
            possível ativar esta resposta automática.
          </p>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer max-w-xl">
          <input
            type="checkbox"
            className="accent-nord-blue mt-0.5"
            checked={enabled}
            disabled={!canEdit}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm text-white">
            Responder automaticamente, com IA, as avaliações recebidas no iFood desta loja — sem aprovação por avaliação individual.
            <span className="block text-xs text-nord-gray mt-1">
              A resposta é publicada sozinha assim que gerada. Mesmo com esta opção ligada, uma avaliação com indício de problema sério
              (ver lista abaixo) nunca é respondida automaticamente — fica esperando revisão manual em Avaliações &gt; Respostas.
            </span>
          </span>
        </label>

        {canEdit && (
          <button
            onClick={salvar}
            disabled={saving}
            className="mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        )}
        {saved && !saveError && <p className="text-xs text-nord-success mt-2">Configuração salva.</p>}
      </Section>

      <Section title="Palavra-chave de risco — por que algumas avaliações não publicam sozinhas">
        <div className="flex items-start gap-2.5 text-sm text-nord-gray max-w-2xl">
          <ShieldAlert size={16} className="text-nord-warning mt-0.5 shrink-0" />
          <p>
            Mesmo com a resposta automática ligada, uma avaliação cujo comentário mencione um indício de problema sério — contaminação
            alimentar, atendimento médico, objeto estranho na comida, etc. — nunca é publicada sozinha: fica marcada como
            &quot;Precisa revisão manual&quot; em Avaliações &gt; Respostas, para alguém da equipe ler e decidir a resposta final antes de
            publicar. É uma proteção, não um bug — o risco reputacional e legal desses casos é grande demais para confiar 100% em uma
            resposta gerada sem revisão humana.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {riskKeywords.map((kw) => (
            <span key={kw} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-nord-warning/15 text-nord-warning">
              {kw}
            </span>
          ))}
        </div>
      </Section>

      {canExecute && (
        <Section title="Simular (prévia, sem publicar nada)">
          <p className="text-xs text-nord-gray mb-3">
            Busca as avaliações novas no iFood e gera a resposta da IA pra cada uma — passando pela mesma checagem de palavra-chave de
            risco de sempre — mas <strong className="text-white">nunca publica nada no iFood</strong>. Funciona mesmo com a resposta
            automática desligada acima: é o jeito de ver como as respostas ficariam antes de decidir ativar de vez. As prévias
            aparecem em Avaliações &gt; Respostas com o status &quot;Simulação (não publicada)&quot;.
          </p>
          {!hasIfoodCredentials && (
            <p className="text-xs text-nord-warning mb-3">
              Configure antes a credencial do iFood (Configurações &gt; iFood) — sem ela não é possível buscar as avaliações pra
              simular.
            </p>
          )}
          <button
            onClick={simular}
            disabled={simulating || !hasIfoodCredentials}
            className="btn-outline px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {simulating ? "Simulando..." : "Simular"}
          </button>
          {simMessage && <p className="text-xs text-nord-success mt-2">{simMessage}</p>}
          <FormError message={simError} />
        </Section>
      )}

      {canExecute && (
        <Section title="Sincronizar agora (publica de verdade)">
          <p className="text-xs text-nord-gray mb-3">
            Busca as avaliações novas no iFood e processa imediatamente (mesma rotina que roda automaticamente todos os dias) —
            publicando a resposta no iFood quando for seguro. Só funciona com a resposta automática ligada e salva acima.
          </p>
          <button
            onClick={sincronizarAgora}
            disabled={syncing || !confirmedEnabled}
            className="btn-outline px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
          {enabled !== confirmedEnabled && (
            <p className="text-[11px] text-nord-warning mt-2">Salve a configuração acima antes de sincronizar.</p>
          )}
          {syncMessage && <p className="text-xs text-nord-success mt-2">{syncMessage}</p>}
          <FormError message={syncError} />
        </Section>
      )}
    </div>
  );
}
