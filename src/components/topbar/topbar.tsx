"use client";

import { Search, Menu, MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useMobileSidebar } from "@/components/sidebar/mobile-sidebar-context";
import { NotificationBell } from "@/components/sidebar/notification-bell";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { UserMenu, type UserProfile } from "./user-menu";

function nowInSaoPaulo() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }),
  };
}

/** Só passa a mostrar a hora após montar no cliente, para não divergir da renderização no servidor. */
function Clock() {
  const [value, setValue] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inicia o relógio só no cliente, evitando divergência com a renderização no servidor
    setValue(nowInSaoPaulo());
    const id = setInterval(() => setValue(nowInSaoPaulo()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!value) return null;

  return (
    <div className="hidden sm:flex flex-col items-end leading-tight">
      <span className="text-white text-sm font-medium tabular-nums">{value.time}</span>
      <span className="text-nord-gray text-[11px] tabular-nums">{value.date}</span>
    </div>
  );
}

/** Botão do ícone fixo da Central de Bugs e Melhorias — em azul (cor de destaque do Design
 * System) pra ficar claro que é uma ação diferente dos demais ícones neutros do Topbar (ex.:
 * `NotificationBell`). Renderizado duas vezes no `Topbar` (versão centralizada para telas com
 * folga e versão ao lado dos ícones da direita no mobile), ambas disparando a mesma modal. A
 * partir de `lg` (telas com espaço de sobra — nessa largura o sidebar permanente já assumiu, então
 * o cabeçalho tem menos concorrência por espaço) o nome "Bugs e Melhorias" aparece do lado do
 * ícone; abaixo disso (inclusive a versão mobile, que nunca chega a renderizar em `lg` porque já
 * está escondida desde `sm`) mostra só o ícone, pra não brigar por espaço com título/busca. */
function FeedbackTriggerButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      title="Bugs e Melhorias — Reportar Bug ou Sugerir Melhoria"
      aria-label="Bugs e Melhorias — Reportar Bug ou Sugerir Melhoria"
      className={`h-9 px-2 lg:px-3 rounded-lg flex items-center gap-2 text-nord-blue-light hover:bg-nord-blue/15 transition shrink-0 ${className}`}
    >
      <MessageSquarePlus size={20} className="shrink-0" />
      <span className="hidden lg:inline text-sm font-medium whitespace-nowrap">Bugs e Melhorias</span>
    </button>
  );
}

export function Topbar({
  title,
  subtitle,
  user = null,
}: {
  title: string;
  subtitle?: string;
  user?: UserProfile | null;
}) {
  const { setOpen: setMobileMenuOpen } = useMobileSidebar();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <header className="h-16 border-b border-nord-border bg-nord-panel/60 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 gap-2">
      {/* `max-w-[calc(50%-Xpx)]` a partir de `sm` (mesmo breakpoint em que o ícone centralizado
          abaixo aparece): como esta div é filha direta do `<header>` (flex container), um
          `max-width` em porcentagem resolve contra a largura do PRÓPRIO header — trava esse
          grupo (botão de menu + título) para nunca passar da metade do cabeçalho, garantindo que
          o título (incluindo saudações dinâmicas longas, ex. "Bem-vindo(a) de volta, Fulano" na
          Tela de Início) nunca sobreponha o ícone centralizado, por mais comprido que o título
          fique — sem isso, um título comprido o bastante conseguia ficar por cima do ícone em
          larguras intermediárias (confirmado ao testar em 640px de largura). O valor de X muda
          por breakpoint porque o botão centralizado muda de largura: de `sm` a `lg` ele é só o
          ícone (36px medido ao vivo, por isso 32px de margem — metade do botão + folga), e a
          partir de `lg` ele ganha o texto "Bugs e Melhorias" do lado (174px medido ao vivo, por
          isso 100px de margem — metade do botão + folga). Revalidado com varredura de larguras de
          320 a 1920px, incluindo os breakpoints exatos (640, 768, 1024) e um título/subtítulo
          propositalmente extremo pra forçar este grupo a esticar até o próprio limite máximo —
          nenhuma sobreposição encontrada (ver relatório da tarefa). */}
      <div className="flex items-center gap-2 min-w-0 sm:max-w-[calc(50%-32px)] lg:max-w-[calc(50%-100px)]">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="lg:hidden shrink-0 text-nord-gray hover:text-white p-2 -ml-2 rounded-lg hover:bg-white/5"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-white font-semibold text-lg leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-nord-gray text-xs truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Centralizado de verdade no cabeçalho (posicionamento absoluto — o header já é um
          contexto de posicionamento por ser `sticky`), igual em toda página, independente do
          tamanho do título. Só a partir de `sm` (telas com folga o bastante pra não sobrepor um
          título truncado) — no mobile some daqui e reaparece junto dos ícones da direita, ver
          abaixo. */}
      <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <FeedbackTriggerButton onClick={() => setFeedbackOpen(true)} />
      </div>

      {/* Mesmo `max-w-[calc(50%-Xpx)]` do grupo da esquerda (ver comentário lá pros valores de X
          por breakpoint), e pela mesma razão: sem ele, a barra de pesquisa (256px fixos, só
          visível a partir de `md`) ou o sidebar permanente (que passa a ocupar largura a partir
          de `lg`) conseguiam, bem em cima desses dois breakpoints, empurrar esse grupo pra dentro
          da metade esquerda do cabeçalho e cobrir o ícone centralizado (confirmado ao vivo:
          exatamente em 768px e 1024px de largura — as duas larguras mais comuns de iPad — o ícone
          ficava clicável "por baixo" da barra de pesquisa). A busca virou flexível (`flex-1
          min-w-0 max-w-64` + input `w-full`) pra poder encolher dentro desse limite em vez de
          insistir nos 256px fixos e estourar o grupo. */}
      <div className="flex items-center gap-3 sm:min-w-0 sm:max-w-[calc(50%-32px)] lg:max-w-[calc(50%-100px)]">
        <FeedbackTriggerButton onClick={() => setFeedbackOpen(true)} className="sm:hidden" />
        <NotificationBell />
        <div className="relative hidden md:flex flex-1 min-w-0 max-w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            placeholder="Pesquisar no portal..."
            className="bg-nord-card border border-nord-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue w-full"
          />
        </div>
        <Clock />
        <UserMenu user={user} />
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </header>
  );
}
