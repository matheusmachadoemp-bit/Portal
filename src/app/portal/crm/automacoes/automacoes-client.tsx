"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatNumber } from "@/lib/calc";
import { AUTOMATION_TEMPLATES, AUTOMATION_ACTION_LABEL, type AutomationTriggerKey } from "@/lib/crm";

type Template = {
  trigger: AutomationTriggerKey;
  name: string;
  icon: string;
  description: string;
  waitDays: number;
  message: string;
  matchCount: number;
  existing: { id: string; active: boolean } | null;
};

type Custom = {
  id: string;
  name: string;
  trigger: AutomationTriggerKey;
  waitDays: number;
  actionType: string;
  message: string | null;
  active: boolean;
  matchCount: number;
};

export function AutomacoesClient({ templates, custom, canCreate }: { templates: Template[]; custom: Custom[]; canCreate: boolean }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", trigger: "RECUPERACAO" as AutomationTriggerKey, waitDays: 0, message: "" });
  const [saving, setSaving] = useState(false);

  async function ativarTemplate(t: Template) {
    setBusyKey(t.trigger);
    await fetch("/api/crm/automacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t.name, trigger: t.trigger, waitDays: t.waitDays, actionType: "MENSAGEM", message: t.message, active: true }),
    });
    setBusyKey(null);
    router.refresh();
  }

  async function toggleAtivo(id: string, active: boolean) {
    setBusyKey(id);
    await fetch(`/api/crm/automacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setBusyKey(null);
    router.refresh();
  }

  async function excluir(id: string) {
    setBusyKey(id);
    await fetch(`/api/crm/automacoes/${id}`, { method: "DELETE" });
    setBusyKey(null);
    router.refresh();
  }

  async function criarCustom() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/crm/automacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, actionType: "MENSAGEM", active: true }),
    });
    setSaving(false);
    setShowCreate(false);
    setForm({ name: "", trigger: "RECUPERACAO", waitDays: 0, message: "" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Section
        title="Automações prontas"
        action={
          canCreate && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light text-white">
              <Plus size={13} /> Criar Automação
            </button>
          )
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {templates.map((t) => (
            <div key={t.trigger} className="rounded-xl border border-nord-border p-4 space-y-3">
              <div className="flex items-center gap-2.5 flex-wrap text-xs">
                <FlowStep icon={t.icon} label={t.name} />
                <ArrowRight size={13} className="text-nord-gray/50" />
                <FlowStep icon="Clock" label={t.waitDays > 0 ? `Aguardar ${t.waitDays}d` : "Imediato"} />
                <ArrowRight size={13} className="text-nord-gray/50" />
                <FlowStep icon="Send" label="Enviar mensagem" />
              </div>
              <p className="text-xs text-nord-gray">{t.description}</p>
              <p className="text-xs text-nord-gray">
                <span className="text-white font-medium">{formatNumber(t.matchCount)}</span> clientes correspondem hoje
              </p>
              <div className="flex items-center justify-between pt-1">
                {t.existing ? (
                  <button
                    onClick={() => toggleAtivo(t.existing!.id, t.existing!.active)}
                    disabled={busyKey === t.existing.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${t.existing.active ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-nord-gray"}`}
                  >
                    {t.existing.active ? "Ativa" : "Inativa"} · clique para {t.existing.active ? "desativar" : "ativar"}
                  </button>
                ) : (
                  <button
                    onClick={() => ativarTemplate(t)}
                    disabled={busyKey === t.trigger || !canCreate}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white"
                  >
                    {busyKey === t.trigger ? "Ativando..." : "Ativar automação"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {custom.length > 0 && (
        <Section title="Automações personalizadas">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {custom.map((c) => (
              <div key={c.id} className="rounded-xl border border-nord-border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <p className="text-white text-sm font-medium">{c.name}</p>
                  <button onClick={() => excluir(c.id)} className="text-nord-gray hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="text-xs text-nord-gray">
                  {AUTOMATION_ACTION_LABEL[c.actionType]} · {c.waitDays > 0 ? `após ${c.waitDays} dias` : "imediato"}
                </p>
                <p className="text-xs text-nord-gray">
                  <span className="text-white font-medium">{formatNumber(c.matchCount)}</span> clientes correspondem hoje
                </p>
                <button
                  onClick={() => toggleAtivo(c.id, c.active)}
                  disabled={busyKey === c.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${c.active ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-nord-gray"}`}
                >
                  {c.active ? "Ativa" : "Inativa"}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Criar Automação" widthClass="max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-nord-gray mb-1.5">Nome</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue" />
          </div>
          <div>
            <label className="block text-xs text-nord-gray mb-1.5">Gatilho</label>
            <select
              value={form.trigger}
              onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value as AutomationTriggerKey }))}
              className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
            >
              {AUTOMATION_TEMPLATES.map((t) => (
                <option key={t.trigger} value={t.trigger}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-nord-gray mb-1.5">Aguardar (dias)</label>
            <input type="number" value={form.waitDays} onChange={(e) => setForm((f) => ({ ...f, waitDays: Number(e.target.value) }))} className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue" />
          </div>
          <div>
            <label className="block text-xs text-nord-gray mb-1.5">Mensagem</label>
            <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={4} className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue resize-none" />
          </div>
          <button onClick={criarCustom} disabled={!form.name.trim() || saving} className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5">
            {saving ? "Salvando..." : "Criar automação"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function FlowStep({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 text-white">
      <DynamicIcon name={icon} size={12} className="text-nord-blue-light" />
      {label}
    </span>
  );
}
