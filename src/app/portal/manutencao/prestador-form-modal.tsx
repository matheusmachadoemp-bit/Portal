"use client";

import { useEffect, useState } from "react";
import { Modal, FormError } from "@/components/ui/modal";
import type { PrestadorDTO } from "./types";

type EmpresaOption = { id: string; name: string };

const emptyForm = () => ({
  nome: "",
  nomeContato: "",
  especialidade: "",
  telefone: "",
  whatsapp: "",
  email: "",
  documento: "",
  endereco: "",
  empresaIds: [] as string[],
  avaliacao: "",
  observacoes: "",
  active: true,
});

export function PrestadorFormModal({
  open,
  onClose,
  onSaved,
  prestador,
  empresas,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  prestador?: PrestadorDTO | null;
  empresas: EmpresaOption[];
}) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (prestador) {
      setForm({
        nome: prestador.nome,
        nomeContato: prestador.nomeContato ?? "",
        especialidade: prestador.especialidade ?? "",
        telefone: prestador.telefone ?? "",
        whatsapp: prestador.whatsapp ?? "",
        email: prestador.email ?? "",
        documento: prestador.documento ?? "",
        endereco: prestador.endereco ?? "",
        empresaIds: prestador.empresaIds,
        avaliacao: prestador.avaliacao != null ? String(prestador.avaliacao) : "",
        observacoes: prestador.observacoes ?? "",
        active: prestador.active,
      });
    } else {
      setForm(emptyForm());
    }
    setError(null);
  }, [open, prestador]);

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleEmpresa(id: string) {
    setForm((f) => ({
      ...f,
      empresaIds: f.empresaIds.includes(id) ? f.empresaIds.filter((e) => e !== id) : [...f.empresaIds, id],
    }));
  }

  async function handleSubmit() {
    setError(null);
    if (!form.nome.trim()) return setError("Informe o nome ou razão social.");

    setSaving(true);
    try {
      const payload = { ...form, avaliacao: form.avaliacao || undefined };
      const res = await fetch(prestador ? `/api/manutencao/prestadores/${prestador.id}` : "/api/manutencao/prestadores", {
        method: prestador ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao salvar prestador.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar prestador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={prestador ? "Editar prestador" : "Novo prestador"} widthClass="max-w-xl">
      <FormError message={error} />
      <div className="space-y-4">
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Nome ou razão social *</label>
          <input className="input w-full" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Nome do contato</label>
            <input className="input w-full" value={form.nomeContato} onChange={(e) => set("nomeContato", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Especialidade</label>
            <input className="input w-full" value={form.especialidade} onChange={(e) => set("especialidade", e.target.value)} placeholder="Ex.: Refrigeração" />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Telefone</label>
            <input className="input w-full" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">WhatsApp</label>
            <input className="input w-full" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">E-mail</label>
            <input type="email" className="input w-full" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">CNPJ ou CPF</label>
            <input className="input w-full" value={form.documento} onChange={(e) => set("documento", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Endereço</label>
          <input className="input w-full" value={form.endereco} onChange={(e) => set("endereco", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Lojas atendidas</label>
          <div className="flex flex-wrap gap-2">
            {empresas.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleEmpresa(e.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  form.empresaIds.includes(e.id) ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
                }`}
              >
                {e.name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-nord-gray mt-1">Nenhuma loja selecionada = atende todas as lojas.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Avaliação (1 a 5)</label>
            <input type="number" min={1} max={5} className="input w-full" value={form.avaliacao} onChange={(e) => set("avaliacao", e.target.value)} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-white">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              Ativo
            </label>
          </div>
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Observações</label>
          <textarea className="input w-full min-h-[60px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar prestador"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
