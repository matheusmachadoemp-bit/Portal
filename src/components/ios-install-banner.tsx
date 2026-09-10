"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISSED_KEY = "pwa-ios-banner-dismissed";

/**
 * iPhone/iPad rodando Safari fora do modo instalado ("Adicionado à Tela de
 * Início"): o iOS só entrega notificação push para web apps nesse modo — numa
 * aba comum do Safari a API de push nem existe. Detecta:
 * - Aparelho iOS: userAgent bate com iPad/iPhone/iPod, OU é um iPad
 *   "disfarçado" de Mac (iPadOS 13+ reporta userAgent de desktop Safari, mas
 *   com suporte a multitoque — truque documentado para diferenciar de um Mac
 *   de verdade, que não tem tela sensível ao toque).
 * - Já instalado: `display-mode: standalone` (padrão atual) ou
 *   `navigator.standalone` (propriedade específica do Safari/iOS, única forma
 *   de detectar em versões mais antigas que não suportam a media query).
 */
function shouldShowIosBanner(): boolean {
  if (typeof window === "undefined") return false;

  const nav = window.navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && nav.maxTouchPoints > 1);
  if (!isIOS) return false;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  return !isStandalone;
}

/**
 * Banner discreto e dispensável avisando quem acessa o Portal pelo Safari do
 * iPhone/iPad (sem ter instalado na Tela de Início) que precisa instalar
 * para poder receber notificações — limitação do próprio iOS, não do Portal.
 * Renderizado uma vez em `src/app/portal/layout.tsx`, ao lado de
 * `PushRegistration`. Aparece só uma vez por navegador: ao fechar, grava em
 * `localStorage` e não volta a aparecer nesse aparelho/navegador.
 */
export function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decide, só no cliente, se mostra a dica de instalação (depende de userAgent/matchMedia do navegador e do que o usuário já dispensou antes)
    setVisible(shouldShowIosBanner() && window.localStorage.getItem(DISMISSED_KEY) !== "1");
  }, []);

  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="bg-nord-blue/10 border-b border-nord-blue/25 px-4 md:px-6 py-2.5">
      <div className="flex items-center gap-3">
        <Share size={16} className="text-nord-blue-light shrink-0" />
        <p className="flex-1 text-xs sm:text-sm text-white leading-snug">
          Para receber notificações no iPhone, toque em <strong className="font-semibold">Compartilhar</strong> e
          depois em <strong className="font-semibold">Adicionar à Tela de Início</strong>.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso"
          className="shrink-0 text-nord-gray hover:text-white p-1 -m-1 rounded-lg hover:bg-white/10 transition"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
