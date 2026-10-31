"use client";

import { AlertTriangle, X } from "lucide-react";
import { ReactNode, RefObject, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-nord-danger/10 border border-nord-danger/30 mb-3">
      <AlertTriangle size={14} className="text-nord-danger mt-0.5 shrink-0" />
      <p className="text-xs text-nord-danger">{message}</p>
    </div>
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pilha (module-level, compartilhada por todas as instâncias de Modal/
// ConfirmDialog na página) dos diálogos abertos no momento, em ordem de
// montagem — o último item é sempre o diálogo "do topo" (o mais recente,
// aberto por cima dos demais; ex.: um ConfirmDialog de exclusão aberto de
// dentro de um Modal de formulário, ou um Modal aninhado dentro de outro).
// Cada `useFocusTrap` ativo se empilha aqui ao montar e se desempilha ao
// desmontar. Só a instância do topo processa Tab/Shift+Tab e Esc — as
// demais (por baixo) ficam "dormentes" enquanto houver alguma por cima,
// pra não brigarem pelo foco (Tab travando no diálogo de baixo) nem
// fecharem em cascata com um único Esc.
const dialogStack: symbol[] = [];

/**
 * Focus trap simples pra Modal/ConfirmDialog: ao abrir, move o foco pro
 * primeiro elemento focável dentro do container (ou pro próprio container,
 * se não houver nenhum). Enquanto ativo, Tab/Shift+Tab ciclam só entre os
 * elementos focáveis do container (não escapam pro resto da página) e Esc
 * chama `onClose`. Ao desativar, devolve o foco pra quem estava focado
 * antes de abrir (ex.: o botão que disparou o modal). Quando há mais de um
 * diálogo aberto ao mesmo tempo (empilhados), só o do topo reage a
 * Tab/Shift+Tab/Esc — ver `dialogStack` acima.
 */
function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("dialog");

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const id = idRef.current!;
    dialogStack.push(id);
    const isTop = () => dialogStack[dialogStack.length - 1] === id;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    const focusable = getFocusable();
    (focusable[0] ?? container).focus();

    function onKeyDown(e: KeyboardEvent) {
      // Diálogo por baixo de outro (ex.: Modal com ConfirmDialog ou Modal
      // aninhado aberto por cima): não intercepta nada, deixa o evento
      // passar pra instância do topo (ou pro comportamento padrão do
      // navegador, se por algum motivo não houver nenhuma no topo).
      if (!isTop()) return;

      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        container?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeInside = !!container && container.contains(document.activeElement);
      if (e.shiftKey) {
        if (!activeInside || document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!activeInside || document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const idx = dialogStack.indexOf(id);
      if (idx !== -1) dialogStack.splice(idx, 1);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = "max-w-lg",
  closeDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  widthClass?: string;
  /**
   * Enquanto true, ignora o fechamento pelo X, pelo clique no fundo (backdrop) e pelo Esc —
   * use isso enquanto uma requisição que o usuário disparou (ex.: salvar) ainda está em
   * andamento. Sem essa trava, o usuário consegue fechar o modal achando que "cancelou" a
   * ação, mas a requisição já em voo continua rodando no servidor e termina criando/alterando
   * o dado de qualquer jeito, sem o usuário nunca ver o resultado — e se ele reabrir o mesmo
   * modal pra tentar de novo antes da requisição antiga terminar, a conclusão tardia dela pode
   * até fechar essa SEGUNDA tentativa no meio, descartando o que ele já tinha digitado (foi
   * exatamente assim que "Cachaça 51" apareceu sozinha ao tentar criar "Polvo" em Produção >
   * Produtos de Produção). Enquanto `closeDisabled` estiver true, o usuário só recupera o
   * controle quando a própria requisição terminar (sucesso fecha o modal normalmente; erro
   * mostra a mensagem com o modal ainda aberto para tentar de novo).
   */
  closeDisabled?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target (document.body) only exists after mount
    setMounted(true);
  }, []);

  function handleClose() {
    if (closeDisabled) return;
    onClose();
  }

  useFocusTrap(containerRef, open && mounted, handleClose);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative z-10 w-full ${widthClass} nord-card bg-nord-card shadow-2xl max-h-[90vh] overflow-y-auto nord-scrollbar`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-nord-border sticky top-0 z-10 bg-nord-card">
          <h2 id={titleId} className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={handleClose}
            disabled={closeDisabled}
            aria-label="Fechar"
            className="text-nord-gray hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-nord-gray"
          >
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
  /** Normalmente uma frase só, mas aceita `ReactNode` pra casos que precisam listar vários itens
   *  (ex.: aviso de cobertura mínima afetando vários colaboradores de um lote, Escala de Folgas) —
   *  todo uso existente já passava `string`, que é um `ReactNode` válido, então isso não muda nada
   *  pra quem já usa este componente. */
  message: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target (document.body) only exists after mount
    setMounted(true);
  }, []);

  useFocusTrap(containerRef, open && mounted, onCancel);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 w-full max-w-sm nord-card bg-nord-card shadow-2xl p-5"
      >
        <h3 id={titleId} className="text-white font-semibold mb-2">{title}</h3>
        {/* `<div>`, não `<p>`: `message` aceita `ReactNode` (ver comentário no tipo acima) e um
            `message` com bloco próprio (ex.: lista de itens) dentro de um `<p>` é HTML inválido
            (`<p>` não pode conter elemento de bloco, como outro `<p>` ou `<ul>`) — gera erro de
            hidratação. `<div>` com as mesmas classes mantém a aparência idêntica pra toda
            mensagem em texto puro (a grande maioria dos usos). */}
        <div className="text-sm text-nord-gray mb-5">{message}</div>
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
              danger ? "bg-nord-danger/90 hover:bg-nord-danger" : "bg-nord-blue hover:bg-nord-blue-light"
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
