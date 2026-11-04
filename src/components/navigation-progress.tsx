"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
  type TransitionStartFunction,
} from "react";

type NavigationProgressContextValue = {
  isPending: boolean;
  /** Mesma assinatura do `startTransition` do React — envolva aqui qualquer chamada de
   *  navegação (ex.: `router.push(...)`) que não passe por um `<Link>` do Next (que já tem seu
   *  próprio indicador de pendência via `useLinkStatus`). */
  startNavigation: TransitionStartFunction;
};

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null);

/**
 * Indicador global de navegação (achado da auditoria visual: nenhuma tela dava feedback ao
 * clicar no menu lateral enquanto a próxima página — com várias consultas ao banco — ainda
 * estava carregando). Guarda um único `useTransition` compartilhado por toda a navegação
 * iniciada fora de um `<Link>` (menu lateral, notificações) e acende uma barra fina no topo
 * enquanto a transição está pendente. Ver `DESIGN_SYSTEM.md`.
 */
export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const [isPending, startNavigation] = useTransition();

  return (
    <NavigationProgressContext.Provider value={{ isPending, startNavigation }}>
      <NavigationProgressBar isPending={isPending} />
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress() {
  const ctx = useContext(NavigationProgressContext);
  if (!ctx) throw new Error("useNavigationProgress deve ser usado dentro de NavigationProgressProvider");
  return ctx;
}

/** Só mostra a barra se a navegação continuar pendente depois desse atraso — a maioria das
 *  navegações (rota já visitada, prefetch pronto) resolve bem antes disso, então a barra nunca
 *  chega a aparecer pra elas (sem esse atraso, haveria um "flash" incômodo de poucos
 *  milissegundos em toda navegação, mesmo as instantâneas). */
const SHOW_DELAY_MS = 150;

function NavigationProgressBar({ isPending }: { isPending: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isPending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- esconde a barra assim que a navegação (transição) termina
      setVisible(false);
      return;
    }
    const timeout = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isPending]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-[100] h-[3px] overflow-hidden bg-nord-border/40"
    >
      <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-nord-blue-light to-transparent animate-nav-progress" />
    </div>
  );
}
