"use client";

import { useEffect, useState } from "react";
import { Modal, FormError } from "@/components/ui/modal";

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmarSenha("");
    setError(null);
    setSuccess(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Depois de trocar a senha com sucesso, fecha o modal sozinho (o usuário
  // ainda pode fechar na hora clicando em "Fechar", fora do modal ou com Esc).
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(handleClose, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose só precisa disparar 1x quando success vira true
  }, [success]);

  async function handleSubmit() {
    setError(null);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setError("Preencha todos os campos.");
      return;
    }
    if (novaSenha.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/usuarios/me/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Não foi possível trocar a senha.");
        return;
      }
      setSuccess(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch {
      setError("Não foi possível trocar a senha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Trocar senha" widthClass="max-w-sm">
      <FormError message={error} />
      {success ? (
        <div className="text-center py-2">
          <p className="text-sm text-nord-success font-medium mb-4">Senha alterada com sucesso.</p>
          <button
            onClick={handleClose}
            className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
          >
            Fechar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Senha atual</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="input"
            />
          </label>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : "Salvar nova senha"}
          </button>
        </div>
      )}
    </Modal>
  );
}
