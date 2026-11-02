"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NordAiConversationList } from "./conversation-list";
import { NordAiChatPanel } from "./chat-panel";
import type { NordAiConversation, NordAiMessage } from "./types";

const GENERIC_FETCH_ERROR = "Não foi possível carregar. Verifique sua conexão e tente novamente.";
const GENERIC_SEND_ERROR = "Não foi possível enviar a mensagem. Tente novamente.";

/** Lê `{ error: string }` do corpo de uma resposta de erro, com fallback genérico — mesmo
 * padrão usado nas outras telas do Portal (ex.: `store-switcher.tsx`). */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

/**
 * Orquestrador da tela de chat do Nord AI (`/portal/nord-ai/painel`). Dono de todo o estado:
 * lista de conversas, conversa selecionada, histórico de mensagens e rascunho do campo de envio.
 * Delega a apresentação para `NordAiConversationList` (coluna da esquerda) e `NordAiChatPanel`
 * (conversa ativa à direita) — ver `src/app/portal/nord-ai/painel/types.ts` para os tipos
 * trocados entre os três.
 *
 * Em telas pequenas, só uma das duas colunas fica visível por vez (classes `hidden md:flex`
 * abaixo, nunca desmontando os componentes) — conforme `selectedId` está ou não preenchido.
 */
export function NordAiPainelClient() {
  const [conversations, setConversations] = useState<NordAiConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NordAiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  // Guarda o CONJUNTO de conversas com um envio em andamento (nunca um slot único — ver
  // comentário abaixo) — a resposta da IA não é streaming e pode levar alguns segundos (ver
  // `handleSend`), e nesse intervalo o usuário pode trocar de conversa na lista à esquerda e
  // mandar outra mensagem ali também, sem esperar a primeira terminar. Precisa ser um `Set`
  // (não um `string | null` só com o ID "atual") porque é perfeitamente possível ter DUAS (ou
  // mais) conversas com envio pendente ao mesmo tempo — um slot único faria a segunda
  // sobrescrever o registro da primeira, perdendo a informação de que ela ainda está no ar
  // (2º achado do Teulis nesta tela: com um slot único, voltar pra uma conversa A que ainda
  // estava esperando resposta, depois de já ter mandado outra em B, fazia o indicador de
  // "digitando" de A desaparecer e liberava reenviar nela, dois POSTs concorrentes pra mesma
  // conversa). Checagem/alteração sempre via `.has(id)`/novo `Set`, nunca comparação de
  // igualdade — assim cada conversa mantém seu próprio registro, independente das outras.
  const [sendingConversationIds, setSendingConversationIds] = useState<Set<string>>(() => new Set());
  const [sendError, setSendError] = useState<string | null>(null);

  // Incrementado pelo botão "Tentar novamente" do histórico (ver `retryMessages`) — dependência
  // extra do `useEffect` de carregamento de mensagens abaixo, para forçar uma nova busca sem
  // duplicar a lógica de fetch num segundo lugar.
  const [messagesReloadToken, setMessagesReloadToken] = useState(0);

  // Garante que a seleção automática da conversa mais recente só acontece UMA vez, na primeira
  // carga — sem isso, cada `refreshConversations()` disparado depois de enviar uma mensagem
  // (para atualizar título/ordem na lista) tentaria "roubar" a seleção atual do usuário de volta
  // para o topo da lista.
  const autoSelectedRef = useRef(false);

  // Sempre reflete o `selectedId` MAIS RECENTE, lido dentro de callbacks assíncronos (depois de
  // um `await`) que não podem confiar no `selectedId` capturado por closure no momento em que a
  // ação começou — esse valor fica "congelado" (stale closure) e não muda mesmo que o usuário
  // troque de conversa enquanto a resposta ainda não chegou. Atribuído direto no corpo do
  // componente (sem `useEffect`) porque é só a leitura mais atual de um valor já renderizado,
  // não uma sincronização com nada externo — não dispara render nem precisa disparar. Achado do
  // Teulis: sem isso, a resposta de uma pergunta enviada na conversa A podia aparecer colada no
  // histórico da conversa B, se o usuário trocasse de conversa antes da resposta chegar.
  const selectedIdRef = useRef(selectedId);
  // Atualiza o ref num efeito (nunca direto no corpo do componente): mutar um ref durante o
  // render é desencorajado pelo próprio React (quebra em modo concorrente) e é pego pela regra
  // `react-hooks/refs`. Só leitura depois de algum `await`, nunca durante o render em si — o
  // efeito roda depois do commit, exatamente quando precisamos que o valor já esteja atualizado
  // pra qualquer callback assíncrono que executar a partir daqui.
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Encadeada via `.then()/.catch()/.finally()` (em vez de `async`/`await` direto) de propósito:
  // nenhuma chamada de `setState` acontece de forma síncrona no corpo da função — todas vivem
  // dentro de callbacks de Promise — para que chamar `refreshConversations()` de dentro de um
  // `useEffect` (abaixo) não dispare a regra `react-hooks/set-state-in-effect`. Mesmo racional já
  // usado no efeito de carregar módulos/usuários em `bugs-melhorias-client.tsx`.
  const refreshConversations = useCallback(() => {
    fetch("/api/nord-ai/conversations")
      .then(async (res) => {
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!res.ok) {
          setConversationsError(await readErrorMessage(res, GENERIC_FETCH_ERROR));
          return;
        }
        setConversationsError(null);
        const data = await res.json();
        const list: NordAiConversation[] = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(list);
        if (!autoSelectedRef.current && list.length > 0) {
          autoSelectedRef.current = true;
          setSelectedId(list[0].id);
        }
      })
      .catch(() => {
        setConversationsError("Falha de conexão ao carregar as conversas. Tente novamente.");
      })
      .finally(() => {
        setConversationsLoading(false);
      });
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    // Nenhuma conversa selecionada: `NordAiChatPanel` ignora `messages`/`messagesError` nesse
    // caso (renderiza a tela de boas-vindas só a partir de `conversation === null`) — não há
    // necessidade de limpar esses dois estados aqui, só de não disparar a busca.
    if (!selectedId) return;
    let cancelled = false;
    // Única chamada de `setState` síncrona deste efeito — necessária para o spinner aparecer já
    // no primeiro render após trocar de conversa, antes da busca em si resolver. As demais
    // (sucesso/erro) vivem dentro do `.then()/.catch()` abaixo, fora do corpo síncrono do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mostra o spinner imediatamente ao trocar de conversa, antes da busca resolver
    setMessagesLoading(true);
    fetch(`/api/nord-ai/conversations/${selectedId}/messages`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!res.ok) {
          setMessagesError(await readErrorMessage(res, GENERIC_FETCH_ERROR));
          setMessages([]);
          return;
        }
        setMessagesError(null);
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      })
      .catch(() => {
        if (!cancelled) setMessagesError("Falha de conexão ao carregar o histórico. Tente novamente.");
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, messagesReloadToken]);

  const retryMessages = useCallback(() => {
    setMessagesReloadToken((t) => t + 1);
  }, []);

  async function handleNewConversation(prefill?: string) {
    // Capturado ANTES do `await` — compara com `selectedIdRef.current` depois da criação
    // resolver pra saber se o usuário já trocou de conversa manualmente nesse meio tempo (ver
    // comentário de `selectedIdRef` acima). Só assim sabemos se é seguro "entrar" na conversa
    // nova automaticamente, sem roubar a tela de uma conversa que o usuário já escolheu.
    const selectedIdBeforeCreate = selectedIdRef.current;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/nord-ai/conversations", { method: "POST" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        setCreateError(await readErrorMessage(res, "Não foi possível criar uma nova conversa. Tente novamente."));
        return;
      }
      const data = await res.json();
      const conversation: NordAiConversation = { ...data.conversation, _count: { messages: 0 } };
      // Adiciona à lista sempre — a conversa foi criada de verdade no servidor, não pode se
      // perder só porque o usuário clicou em outra coisa enquanto esperava.
      setConversations((prev) => [conversation, ...prev]);
      if (selectedIdRef.current === selectedIdBeforeCreate) {
        autoSelectedRef.current = true;
        setSelectedId(conversation.id);
        setMessages([]);
        setMessagesError(null);
        setSendError(null);
        setDraft(prefill ?? "");
      }
    } catch {
      setCreateError("Falha de conexão ao criar a conversa. Tente novamente.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSend() {
    const content = draft.trim();
    // `.has(selectedId)`, nunca comparação de igualdade com um único ID "atual" (ver comentário
    // de `sendingConversationIds` acima) — nada impede o usuário de mandar outra mensagem numa
    // conversa DIFERENTE enquanto outra(s) ainda está(ão) no ar, só não pode mandar duas ao
    // mesmo tempo na MESMA conversa.
    if (!content || !selectedId || sendingConversationIds.has(selectedId)) return;

    // Capturado ANTES do `await` (igual `handleNewConversation`) — a resposta desta pergunta
    // pertence a ESTA conversa (`conversationId`), nunca à que estiver selecionada quando a
    // resposta chegar. Sem isso, trocar de conversa enquanto a IA ainda está respondendo fazia a
    // pergunta+resposta de uma conversa aparecer colada no histórico de outra (achado do
    // Teulis). `selectedId` (a variável de estado, sem o `Ref`) só é seguro de usar ATÉ aqui,
    // antes do primeiro `await` — depois disso, qualquer leitura precisa ser via
    // `selectedIdRef.current` (ver comentário dele acima).
    const conversationId = selectedId;
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: NordAiMessage = {
      id: tempId,
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");
    setSendingConversationIds((prev) => new Set(prev).add(conversationId));
    setSendError(null);

    try {
      const res = await fetch(`/api/nord-ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      // Verdadeiro só se o usuário ainda está olhando pra ESTA conversa quando a resposta chega.
      const stillOnSameConversation = selectedIdRef.current === conversationId;
      if (!res.ok) {
        const message = await readErrorMessage(res, GENERIC_SEND_ERROR);
        // Remove a mensagem otimista sempre — ela nunca pertenceu à conversa que está sendo
        // exibida agora, caso o usuário já tenha trocado (ver comentário de `conversationId`).
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (stillOnSameConversation) {
          setSendError(message);
          setDraft(content);
        }
        return;
      }
      const data = await res.json();
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        // Só acrescenta a pergunta+resposta se o usuário ainda estiver na mesma conversa — caso
        // contrário essas duas mensagens pertencem a uma conversa que não é mais a exibida (o
        // efeito que busca o histórico da conversa atualmente aberta já cuidou de carregar o
        // dela; só precisamos tirar a mensagem otimista daqui, nunca inserir estas duas).
        return stillOnSameConversation ? [...withoutTemp, data.userMessage, data.assistantMessage] : withoutTemp;
      });
      // Atualiza título (pode ter saído de "Nova conversa" na 1ª pergunta), ordem (`updatedAt`) e
      // contagem de mensagens na lista — sem roubar a seleção atual (ver `autoSelectedRef`).
      refreshConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (selectedIdRef.current === conversationId) {
        setSendError("Falha de conexão ao enviar a mensagem. Tente novamente.");
        setDraft(content);
      }
    } finally {
      // Remove só o registro DESTA conversa — nunca zera o conjunto inteiro (que apagaria o
      // registro de qualquer outra conversa com envio ainda pendente em paralelo).
      setSendingConversationIds((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  }

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[560px]">
      <div className={`h-full min-h-0 ${selectedId ? "hidden md:flex md:flex-col" : "flex flex-col"}`}>
        <NordAiConversationList
          conversations={conversations}
          loading={conversationsLoading}
          error={conversationsError}
          createError={createError}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSendError(null);
          }}
          onNewConversation={() => handleNewConversation()}
          creating={creating}
        />
      </div>

      <div className={`h-full min-h-0 ${selectedId ? "flex flex-col" : "hidden md:flex md:flex-col"}`}>
        <NordAiChatPanel
          conversation={selectedConversation}
          messages={messages}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
          onRetryMessages={retryMessages}
          sending={selectedId !== null && sendingConversationIds.has(selectedId)}
          sendError={sendError}
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          onBack={() => setSelectedId(null)}
          creating={creating}
          onNewConversation={() => handleNewConversation()}
          onExampleClick={(question) => handleNewConversation(question)}
        />
      </div>
    </div>
  );
}
