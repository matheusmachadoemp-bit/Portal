"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, Coins, KeyRound, LogOut, Pencil } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { logoutAction } from "@/app/actions/logout";
import { sanitizeFileName } from "@/lib/upload";
import { formatNumber } from "@/lib/calc";
import { ChangePasswordModal } from "./change-password-modal";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
};

function UserAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string | null; size: number }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar vem do Vercel Blob (domínio variável)
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-nord-blue/20 text-nord-blue-light flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const PANEL_WIDTH = 288; // w-72
const PANEL_MARGIN = 8;

// Menu de perfil no canto superior direito de toda tela autenticada: foto/
// iniciais do usuário, nome/e-mail, saldo de pontos (Loja Nord), atalho para
// trocar a própria senha e sair do portal.
//
// O painel é desenhado via portal direto no <body> (em vez de "absolute"
// dentro do próprio Topbar) porque o cabeçalho usa "backdrop-blur": isso faz
// o navegador tratar o cabeçalho como a "tela" de referência de qualquer
// elemento "fixed" dentro dele, então um overlay "fixed inset-0" (usado para
// fechar o menu ao clicar fora) ficaria preso na faixa de 64px do cabeçalho
// em vez de cobrir a página inteira. Calculando a posição do botão e
// desenhando o painel fora dessa árvore (igual ao já feito em
// `sidebar/notification-bell.tsx`) o clique fora passa a funcionar em
// qualquer ponto da tela.
export function UserMenu({ user }: { user: UserProfile | null }) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function computePanelPos() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
    const left = Math.min(Math.max(PANEL_MARGIN, rect.right - width), window.innerWidth - width - PANEL_MARGIN);
    const top = rect.bottom + 4;
    setPanelPos({ top, left });
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) computePanelPos();
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function onResize() {
      computePanelPos();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/loja-nord/saldo")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setSaldo(data.saldo);
      })
      .catch(() => {
        // Sem saldo disponível (ex.: módulo Loja Nord indisponível) — mantém "..." em vez de quebrar o menu.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleAvatarChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const blob = await upload(sanitizeFileName(file.name), file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      const res = await fetch("/api/usuarios/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: blob.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data?.error ?? "Não foi possível salvar a foto.");
        return;
      }
      setAvatarUrl(blob.url);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!user) return null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggleOpen}
        aria-label="Abrir menu do usuário"
        className={`rounded-full border transition ${open ? "border-nord-blue" : "border-nord-border hover:border-nord-blue"}`}
      >
        <UserAvatar name={user.name} avatarUrl={avatarUrl} size={32} />
      </button>

      {open &&
        panelPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 w-72 nord-card bg-nord-card shadow-xl p-3"
              style={{ top: panelPos.top, left: panelPos.left }}
            >
              <div className="flex items-center gap-3 pb-3 border-b border-nord-border">
                <div className="relative shrink-0">
                  <UserAvatar name={user.name} avatarUrl={avatarUrl} size={48} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    title="Alterar foto"
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-nord-blue hover:bg-nord-blue-light border-2 border-nord-card flex items-center justify-center text-white disabled:opacity-60"
                  >
                    <Pencil size={10} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => handleAvatarChange(e.target.files)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{user.name}</p>
                  <p className="text-xs text-nord-gray truncate">{user.email}</p>
                </div>
              </div>

              {uploadingAvatar && <p className="text-[11px] text-nord-gray pt-2">Enviando foto...</p>}
              {avatarError && <p className="text-[11px] text-red-400 pt-2">{avatarError}</p>}

              <Link
                href="/portal/loja-nord/meus-pontos"
                onClick={() => setOpen(false)}
                className="-mx-3 mt-1 px-3 py-2.5 flex items-center justify-between gap-2 border-b border-nord-border hover:bg-white/5 transition"
              >
                <span className="flex items-center gap-2 text-sm text-white">
                  <Coins size={15} className="text-nord-blue-light" /> Pontos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white">
                    {saldo === null ? "..." : formatNumber(saldo)}
                  </span>
                  <ChevronRight size={13} className="text-nord-gray" />
                </span>
              </Link>

              <button
                onClick={() => {
                  setShowPasswordModal(true);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 text-sm text-nord-gray hover:text-white px-1 py-2.5 mt-1 rounded-lg hover:bg-white/5 transition"
              >
                <KeyRound size={15} /> Trocar senha
              </button>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 text-sm text-nord-gray hover:text-red-400 px-1 py-2.5 rounded-lg hover:bg-red-950/20 transition"
                >
                  <LogOut size={15} /> Sair do portal
                </button>
              </form>
            </div>
          </>,
          document.body
        )}

      <ChangePasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </div>
  );
}
