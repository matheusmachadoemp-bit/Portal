"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";

type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  priority: "INFORMACAO" | "ATENCAO" | "CRITICA" | null;
  taskId: string | null;
  checklistOccurrenceId: string | null;
  chamadoId: string | null;
  read: boolean;
  createdAt: string;
};

const PRIORITY_BORDER: Record<string, string> = {
  INFORMACAO: "border-nord-blue",
  ATENCAO: "border-amber-400",
  CRITICA: "border-red-500",
};

const PANEL_WIDTH = 320;
const PANEL_MARGIN = 8;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function computePanelPos() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
    const left = Math.min(Math.max(PANEL_MARGIN, rect.right - width), window.innerWidth - width - PANEL_MARGIN);
    const top = rect.bottom + 4;
    setPanelPos({ top, left, width });
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

  async function load() {
    const res = await fetch("/api/notificacoes");
    if (!res.ok) return;
    const data = await res.json();
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega notificações no mount e a cada 60s
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  async function markAllRead() {
    await fetch("/api/notificacoes/marcar-todas-lidas", { method: "POST" });
    load();
  }

  async function handleOpenNotification(n: NotificationDTO) {
    if (!n.read) {
      await fetch(`/api/notificacoes/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
    }
    setOpen(false);
    load();
    if (n.checklistOccurrenceId) router.push(`/portal/tarefas/checklist/executar/${n.checklistOccurrenceId}`);
    else if (n.taskId) router.push("/portal/tarefas");
    else if (n.chamadoId) router.push(`/portal/manutencao/chamados/${n.chamadoId}`);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggleOpen}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-nord-gray hover:text-white hover:bg-white/5 transition"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && panelPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 nord-card bg-nord-card shadow-xl py-1.5 max-h-96 overflow-y-auto nord-scrollbar"
            style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
          >
            <div className="flex items-center justify-between px-3 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-nord-gray/70">Notificações</p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-nord-blue-light hover:underline">
                  <CheckCheck size={11} /> Marcar todas como lidas
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-xs text-nord-gray text-center">Nenhuma notificação por enquanto.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpenNotification(n)}
                  className={`w-full text-left px-3 py-2 hover:bg-white/5 border-l-2 ${
                    n.read ? "border-transparent" : PRIORITY_BORDER[n.priority ?? ""] ?? "border-nord-blue"
                  }`}
                >
                  <p className={`text-xs ${n.read ? "text-nord-gray" : "text-white font-medium"}`}>{n.title}</p>
                  {n.body && <p className="text-[11px] text-nord-gray mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-nord-gray/70 mt-1">{new Date(n.createdAt).toLocaleString("pt-BR")}</p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
