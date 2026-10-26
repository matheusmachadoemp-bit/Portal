"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, FormError } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { loadDraftEntries, newDraftId, removeDraftEntry, upsertDraftEntry } from "@/lib/session-draft";

export type CategoriaCriada = { id: string; key: string; name: string; color: string; icon: string; active: boolean };

const EMPTY_FORM = { name: "", color: "#2952E3", icon: "ChefHat" };

// Chave do rascunho em sessionStorage (ver src/lib/session-draft.ts).
// Compartilhada pelas duas telas que usam este modal (Configurações e
// Produtos) de propósito: não importa de qual delas o usuário tentou criar
// a categoria, o rascunho precisa sobreviver e ser oferecido de volta do
// mesmo jeito. Guarda uma LISTA (ver `CategoriaDraftEntry`), não um
// rascunho só — duas tentativas interrompidas em sequência (ex. duas
// categorias diferentes, sem decidir o aviso da primeira) não podem fazer a
// segunda apagar a primeira em sessionStorage.
const DRAFT_KEY = "producao-nova-categoria-form-draft-v1";

type CategoriaDraftEntry = {
  // Identifica a TENTATIVA em si (gerado ao disparar o POST), nunca o nome
  // digitado — duas categorias podem legitimamente ter o mesmo nome.
  draftId: string;
  form: typeof EMPTY_FORM;
};

/**
 * Modal de criação rápida de categoria de produção — compartilhado entre
 * Produção > Configurações (onde a categoria é gerenciada de fato) e
 * Produção > Produtos (atalho "+ Nova categoria" pra não travar o cadastro
 * de um produto só porque ainda não existe nenhuma categoria cadastrada).
 * Mesmo contrato nas duas telas: POST /api/producao/categorias.
 */
export function NovaCategoriaModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (categoria: CategoriaCriada) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Conta uma "sessão" do modal, incrementada toda vez que ele é fechado —
  // pra uma resposta tardia do POST (chegando depois que o usuário já
  // fechou, e talvez reaberto, o modal) saber se ainda faz sentido
  // fechar/resetar o formulário atual, sem descartar a resposta inteira (se
  // a criação deu certo no servidor, a categoria é real e precisa aparecer
  // na lista de qualquer forma) nem atrapalhar uma tentativa nova já
  // iniciada depois de reabrir. Mesma proteção que motivou originalmente
  // esse padrão em Produção > Configurações.
  const sessionRef = useRef(0);
  // Fila de rascunhos pendentes (uma por TENTATIVA interrompida por
  // navegação). Normalmente tem no máximo 1 item, mas pode ter mais se o
  // usuário ignorar o aviso de uma tentativa e começar outra categoria
  // antes de decidir a primeira — nesse caso as duas sobrevivem, e esta
  // tela oferece uma de cada vez (a da frente da fila), avançando pra
  // próxima sempre que a atual é salva ou descartada.
  const [draftQueue, setDraftQueue] = useState<CategoriaDraftEntry[]>([]);
  // Id da entrada da fila que o formulário ATUAL representa — nunca o nome
  // digitado (ver `CategoriaDraftEntry`). `null` quando o formulário atual
  // é uma tentativa nova, ainda não gravada em sessionStorage.
  const draftIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Este componente fica sempre montado nas duas telas que o usam
    // (Configurações e Produtos), então este efeito roda uma vez quando
    // aquela TELA carrega — exatamente o momento certo pra notar rascunhos
    // deixados por tentativas de criação interrompidas por navegação
    // (botão "voltar" do navegador, fechar a aba etc. — ver
    // `src/lib/session-draft.ts` pro raciocínio completo).
    const queue = loadDraftEntries<CategoriaDraftEntry>(DRAFT_KEY);
    if (queue.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage só existe no cliente; decide, só na montagem, se existem rascunhos de uma navegação anterior pra oferecer
    setDraftQueue(queue);
    setForm(queue[0].form);
    draftIdRef.current = queue[0].draftId;
  }, []);

  const draftPending = draftQueue.length > 0;
  // Fica visível tanto quando o chamador abriu normalmente (clique em "+
  // Nova categoria") quanto quando detectamos, ao montar, algum rascunho
  // pendente de uma tentativa anterior — nesse segundo caso o modal se abre
  // por conta própria, com o formulário pré-preenchido e um aviso
  // explicando o motivo, em vez de deixar o usuário sem nenhum feedback
  // (que foi exatamente o problema original: a categoria nunca é criada e
  // ninguém percebe).
  const effectiveOpen = open || draftPending;

  // Remove a entrada `draftId` da fila (tanto do estado quanto da
  // sessionStorage) e avança o formulário pra próxima pendência, se houver
  // — ou volta pro formulário em branco, se não houver mais nenhuma.
  // Centraliza a lógica usada tanto ao fechar (`handleClose`) quanto ao
  // salvar com sucesso (`criar`), pra não duplicar/dessincronizar as duas.
  function advanceQueueAfterRemoving(draftId: string) {
    removeDraftEntry(DRAFT_KEY, draftId);
    const next = draftQueue.filter((d) => d.draftId !== draftId);
    setDraftQueue(next);
    if (next.length > 0) {
      setForm(next[0].form);
      draftIdRef.current = next[0].draftId;
    } else {
      setForm(EMPTY_FORM);
      draftIdRef.current = null;
    }
  }

  function handleClose() {
    sessionRef.current += 1;
    setError(null);
    // Fechamento explícito (X, Esc, clique no fundo) — vale tanto pra um
    // formulário em branco quanto pra um rascunho recuperado: em ambos os
    // casos o usuário decidiu, de forma deliberada, não salvar agora. Só
    // remove a entrada ATUAL da fila (se houver) — qualquer outra tentativa
    // pendente continua guardada; se sobrar mais alguma, o modal permanece
    // aberto oferecendo a próxima (ver `effectiveOpen` acima).
    if (draftIdRef.current) {
      advanceQueueAfterRemoving(draftIdRef.current);
    } else {
      setForm(EMPTY_FORM);
    }
    onClose();
  }

  async function criar() {
    if (!form.name || saving) return;
    setError(null);
    setSaving(true);
    const session = sessionRef.current;
    if (!draftIdRef.current) draftIdRef.current = newDraftId();
    const thisDraftId = draftIdRef.current;
    // Grava/atualiza só ESTA entrada ANTES de disparar a requisição — mesma
    // lógica do formulário de produto em `produtos-client.tsx` (ver
    // comentário lá e em `src/lib/session-draft.ts`): se a navegação
    // abortar esta requisição no meio do caminho, a categoria digitada não
    // se perde, e qualquer OUTRA tentativa pendente (ver `draftQueue`) não é
    // afetada.
    upsertDraftEntry<CategoriaDraftEntry>(DRAFT_KEY, { draftId: thisDraftId, form });
    try {
      const res = await fetch("/api/producao/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (sessionRef.current === session) {
          setError(data.error ?? "Não foi possível criar a categoria.");
        }
        return;
      }
      const data = await res.json();
      // Criada de verdade no servidor — precisa refletir na lista do
      // chamador mesmo que o modal já tenha sido fechado nesse meio-tempo.
      onCreated(data.categoria);
      // Sucesso de verdade: essa entrada específica não serve mais pra
      // nada, mesmo que esta não seja mais a "sessão" atual (ver
      // `sessionRef` acima). Outras tentativas pendentes não são afetadas.
      if (sessionRef.current === session) {
        advanceQueueAfterRemoving(thisDraftId);
        // Se ainda sobrar alguma tentativa na fila, `effectiveOpen`
        // continua `true` (via `draftPending`, já atualizado acima) mesmo
        // com `onClose()` chamado — o modal não fecha de verdade, só avança
        // pra próxima pendência (`form`/`draftIdRef` já apontam pra ela).
        onClose();
      } else {
        // Sessão já tinha sido trocada (ex.: o modal foi fechado e reaberto
        // antes dessa resposta chegar) — ainda assim a entrada precisa
        // sumir da fila, só sem mexer no `form`/`draftIdRef` da sessão ATUAL
        // (que pode já pertencer a outra tentativa).
        removeDraftEntry(DRAFT_KEY, thisDraftId);
        setDraftQueue((prev) => prev.filter((d) => d.draftId !== thisDraftId));
      }
    } catch {
      if (sessionRef.current === session) {
        setError("Não foi possível criar a categoria.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={effectiveOpen} onClose={handleClose} closeDisabled={saving} title="Nova categoria de produção">
      <div className="space-y-3">
        {draftPending && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-nord-warning/10 border border-nord-warning/30">
            <AlertTriangle size={14} className="text-nord-warning mt-0.5 shrink-0" />
            <p className="text-xs text-nord-warning">
              Você tinha uma categoria em andamento que não foi salva — a navegação foi interrompida antes do
              salvamento terminar. Os dados abaixo foram recuperados; revise e clique em &quot;Criar categoria&quot;
              de novo, ou feche esta janela pra descartar.
              {draftQueue.length > 1 && (
                <> Há mais {draftQueue.length - 1} tentativa(s) pendente(s), oferecida(s) uma de cada vez.</>
              )}
            </p>
          </div>
        )}
        <FormError message={error} />
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Nome</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            autoFocus
          />
        </label>
        <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <button
          onClick={criar}
          disabled={saving}
          className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Criando..." : "Criar categoria"}
        </button>
      </div>
    </Modal>
  );
}
