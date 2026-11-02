"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Bot, Plus, Send, Sparkles, User, Building2, Layers, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { NordAiConversation, NordAiMessage } from "./types";
import { NORD_AI_MAX_MESSAGE_LENGTH } from "./types";

/** Perguntas de exemplo mostradas na tela de boas-vindas (nenhuma conversa selecionada ainda) —
 * só sugestões de UI, não têm nenhum efeito especial no backend: clicar nelas cria uma conversa
 * nova (igual o botão "Iniciar conversa") e já deixa a pergunta escrita no campo de mensagem,
 * pronta para o usuário revisar e enviar.
 *
 * Achado #170 (revisão de limpeza): as 2 perguntas originais ("Quais os itens mais vendidos" e
 * "Como está o CMV comparado com a meta") prometiam um dado que o CONTEXTO REAL desta etapa não
 * calcula (`buildBusinessContext`, @/lib/nord-ai.ts, só cobre faturamento/pedidos de hoje e
 * progresso da meta mensal) — o Nord AI respondia dizendo que não tinha esse dado ainda, uma
 * primeira experiência ruim pra quem clicasse num exemplo do próprio produto. Decisão: trocar
 * os exemplos por perguntas que o backend já responde de verdade agora, em vez de ampliar
 * `buildBusinessContext` para calcular itens mais vendidos/CMV (escopo maior, fora desta tarefa
 * de limpeza — ficaria para uma etapa futura do Nord AI, se o Matheus quiser esses dados no
 * assistente). */
const EXAMPLE_QUESTIONS = [
  "Como está o faturamento desse mês?",
  "Quantos pedidos tivemos hoje?",
  "Qual o progresso da meta mensal?",
];

function EmpresaLabel({ empresa }: { empresa: NordAiConversation["empresa"] }) {
  const isGrupo = !empresa;
  const color = isGrupo ? "#2952E3" : empresa.color;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}22` }}
      >
        {isGrupo ? <Layers size={11} className="text-nord-blue-light" /> : <Building2 size={11} style={{ color }} />}
      </div>
      <span className="text-xs text-nord-gray truncate">{isGrupo ? "Grupo Nord" : empresa.name}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: NordAiMessage }) {
  const isUser = message.role === "USER";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-nord-blue/15 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={14} className="text-nord-blue-light" />
        </div>
      )}
      <div
        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-nord-blue text-white rounded-br-sm"
            : "bg-nord-panel border border-nord-border text-white rounded-bl-sm"
        }`}
      >
        {message.content}
        <div className={`text-[10px] mt-1 text-right ${isUser ? "text-white/70" : "text-nord-gray"}`}>
          {format(new Date(message.createdAt), "HH:mm")}
        </div>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-nord-gray" />
        </div>
      )}
    </div>
  );
}

/** Indicador de "digitando..." enquanto a resposta do assistente não chegou — a chamada
 * `POST /messages` não é streaming, então uma pergunta mais elaborada pode levar alguns segundos
 * (ver comentário da rota, @/app/api/nord-ai/conversations/[id]/messages/route.ts). Sem isso, a
 * tela ficaria parada sem feedback nenhum durante a espera. */
function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 justify-start">
      <div className="w-7 h-7 rounded-lg bg-nord-blue/15 flex items-center justify-center shrink-0">
        <Bot size={14} className="text-nord-blue-light" />
      </div>
      <div className="rounded-2xl rounded-bl-sm px-4 py-3.5 bg-nord-panel border border-nord-border flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-nord-gray/70 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-nord-gray/70 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-nord-gray/70 animate-bounce" />
      </div>
    </div>
  );
}

function WelcomeState({
  creating,
  onStart,
  onExampleClick,
}: {
  creating: boolean;
  onStart: () => void;
  onExampleClick: (question: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6 sm:p-10">
      <div className="w-14 h-14 rounded-2xl bg-nord-blue/15 flex items-center justify-center">
        <Sparkles size={26} className="text-nord-blue-light" />
      </div>
      <div>
        <h3 className="text-white font-medium text-base mb-1">Converse com o Nord AI</h3>
        <p className="text-sm text-nord-gray max-w-sm">
          Pergunte sobre o desempenho da sua loja — faturamento, vendas, CMV e muito mais.
        </p>
      </div>
      <button
        onClick={onStart}
        disabled={creating}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light text-white font-medium disabled:opacity-60 transition"
      >
        <Plus size={15} />
        {creating ? "Criando..." : "Iniciar conversa"}
      </button>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-2 max-w-md">
        {EXAMPLE_QUESTIONS.map((question) => (
          <button
            key={question}
            onClick={() => onExampleClick(question)}
            disabled={creating}
            className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-full px-3 py-1.5 hover:border-nord-blue hover:text-white transition disabled:opacity-60"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NordAiChatPanel({
  conversation,
  messages,
  messagesLoading,
  messagesError,
  onRetryMessages,
  sending,
  sendError,
  draft,
  onDraftChange,
  onSend,
  onBack,
  creating,
  onNewConversation,
  onExampleClick,
}: {
  conversation: NordAiConversation | null;
  messages: NordAiMessage[];
  messagesLoading: boolean;
  messagesError: string | null;
  onRetryMessages: () => void;
  sending: boolean;
  sendError: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  /** Só usado em telas pequenas — volta para a lista de conversas (ver uso de `hidden md:flex`
   * em `nord-ai-painel-client.tsx`). */
  onBack: () => void;
  creating: boolean;
  onNewConversation: () => void;
  onExampleClick: (question: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Auto-resize do textarea (cresce até um teto, depois rola por dentro) — comportamento padrão
  // de qualquer campo de chat. Só manipula o DOM via ref (nunca chama setState), então não entra
  // na regra `react-hooks/set-state-in-effect`.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  if (!conversation) {
    return (
      <div className="nord-card flex flex-col h-full overflow-hidden">
        <WelcomeState creating={creating} onStart={onNewConversation} onExampleClick={onExampleClick} />
      </div>
    );
  }

  const trimmed = draft.trim();
  const overLimit = draft.length > NORD_AI_MAX_MESSAGE_LENGTH;
  const canSend = trimmed.length > 0 && !overLimit && !sending;

  function handleSend() {
    if (!canSend) return;
    onSend();
  }

  return (
    <div className="nord-card flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-nord-border shrink-0">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 rounded-lg text-nord-gray hover:text-white hover:bg-white/5 transition shrink-0"
          aria-label="Voltar para a lista de conversas"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-medium truncate">{conversation.title}</p>
          <EmpresaLabel empresa={conversation.empresa} />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto nord-scrollbar p-4 space-y-3">
        {messagesLoading && <p className="text-center text-sm text-nord-gray py-6">Carregando conversa...</p>}

        {!messagesLoading && messagesError && (
          <div className="flex flex-col items-center gap-2 text-center py-6">
            <AlertTriangle size={20} className="text-nord-danger" />
            <p className="text-sm text-nord-danger">{messagesError}</p>
            <button onClick={onRetryMessages} className="btn-outline text-xs px-3 py-1.5">
              Tentar novamente
            </button>
          </div>
        )}

        {!messagesLoading && !messagesError && messages.length === 0 && (
          <p className="text-center text-sm text-nord-gray py-6">
            Nenhuma mensagem ainda — escreva algo abaixo para começar.
          </p>
        )}

        {!messagesLoading &&
          !messagesError &&
          messages.map((message) => <MessageBubble key={message.id} message={message} />)}

        {sending && <TypingIndicator />}
      </div>

      <div className="p-3 border-t border-nord-border shrink-0">
        {sendError && <p className="text-xs text-nord-danger mb-2">{sendError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="input flex-1 resize-none max-h-40 nord-scrollbar"
            rows={1}
            placeholder="Escreva sua pergunta... (Enter para enviar, Shift+Enter para nova linha)"
            value={draft}
            disabled={sending}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Enviar mensagem"
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-nord-blue hover:bg-nord-blue-light text-white disabled:opacity-40 disabled:hover:bg-nord-blue transition shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="flex justify-end mt-1">
          <span className={`text-[11px] ${overLimit ? "text-nord-danger" : "text-nord-gray"}`}>
            {draft.length}/{NORD_AI_MAX_MESSAGE_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}
