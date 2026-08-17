"use client";

import { AlertTriangle, X } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-900 mb-3">
      <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
      <p className="text-xs text-red-300">{message}</p>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  widthClass?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target (document.body) only exists after mount
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${widthClass} nord-card bg-nord-card shadow-2xl max-h-[90vh] overflow-y-auto nord-scrollbar`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-nord-border sticky top-0 bg-nord-card">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-nord-gray hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirmar",
  danger = false,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target (document.body) only exists after mount
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm nord-card bg-nord-card shadow-2xl p-5">
        <h3 className="text-white font-semibold mb-2">{title}</h3>
        <p className="text-sm text-nord-gray mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-nord-border text-nord-gray hover:text-white hover:border-white/30"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg text-white font-medium ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-nord-blue hover:bg-nord-blue-light"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
