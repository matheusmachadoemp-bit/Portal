"use client";

import { useRef, useState } from "react";
import { Modal, FormError } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";

export type CategoriaCriada = { id: string; key: string; name: string; color: string; icon: string; active: boolean };

const EMPTY_FORM = { name: "", color: "#2952E3", icon: "ChefHat" };

/**
 * Modal de criação rápida de categoria de produção — compartilhado entre
 * Produção > Configurações (onde a categoria é gerenciada de fato) e
 * Produção > Produtos (atalho "+ Nova categoria" pra não travar o cadastro
 * de um produto só porque ainda não existe nenhuma categoria cadastrada).
 * Mesmo contrato nas duas telas: POST /api/producao/categorias.
 */
export function NovaCategoriaModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (categoria: CategoriaCriada) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Conta uma "sessão" do modal, incrementada toda vez que ele é fechado —
  // pra uma resposta tardia do POST (chegando depois que o usuário já
  // fechou, e talvez reaberto, o modal) saber se ainda faz sentido
  // fechar/resetar o formulário atual, sem descartar a resposta inteira (se
  // a criação deu certo no servidor, a categoria é real e precisa aparecer
  // na lista de qualquer forma) nem atrapalhar uma tentativa nova já
  // iniciada depois de reabrir. Mesma proteção que motivou originalmente
  // esse padrão em Produção > Configurações.
  const sessionRef = useRef(0);

  function handleClose() {
    sessionRef.current += 1;
    setError(null);
    setForm(EMPTY_FORM);
    onClose();
  }

  async function criar() {
    if (!form.name || saving) return;
    setError(null);
    setSaving(true);
    const session = sessionRef.current;
    try {
      const res = await fetch("/api/producao/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (sessionRef.current === session) {
          setError(data.error ?? "Não foi possível criar a categoria.");
        }
        return;
      }
      const data = await res.json();
      // Criada de verdade no servidor — precisa refletir na lista do
      // chamador mesmo que o modal já tenha sido fechado nesse meio-tempo.
      onCreated(data.categoria);
      if (sessionRef.current === session) {
        setForm(EMPTY_FORM);
        onClose();
      }
    } catch {
      if (sessionRef.current === session) {
        setError("Não foi possível criar a categoria.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nova categoria de produção">
      <div className="space-y-3">
        <FormError message={error} />
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Nome</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            autoFocus
          />
        </label>
        <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <button
          onClick={criar}
          disabled={saving}
          className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Criando..." : "Criar categoria"}
        </button>
      </div>
    </Modal>
  );
}
