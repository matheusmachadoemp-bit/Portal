/**
 * Helper genérico de "rascunho de formulário" em `sessionStorage` (não em
 * `localStorage` — não é pra sobreviver entre sessões/dias, só pra aba atual
 * aberta agora).
 *
 * Caso de uso: uma tela dispara uma requisição de criação/edição a partir de
 * um modal (ex.: Produção > Produtos) e o usuário aperta "voltar" do
 * navegador (ou fecha a aba) enquanto ela está em voo. O `Modal` tem uma
 * prop `closeDisabled` que bloqueia fechar PELO PRÓPRIO MODAL (X, Esc,
 * clique no fundo) enquanto a requisição está rodando — mas isso não tem
 * como (e não deveria tentar) bloquear uma navegação de página inteira.
 * Quando essa navegação acontece, o navegador pode abortar a própria
 * requisição em voo antes dela terminar (`net::ERR_ABORTED`), e o dado nunca
 * chega a ser salvo — sem nenhuma mensagem de erro, porque a tela já mudou.
 *
 * Em vez de tentar impedir a navegação (frágil e não confiável no App
 * Router: não existe um jeito robusto de interceptar o botão "voltar" do
 * navegador em navegação client-side), a estratégia aqui é aceitar que ela
 * pode acontecer e evitar a PERDA do que foi digitado: salvar um rascunho
 * ANTES de disparar a requisição, e só apagá-lo depois que ela terminar com
 * sucesso. Se o usuário sair no meio e voltar pra mesma tela depois, o
 * rascunho ainda está lá e pode ser oferecido de volta.
 */

export function saveFormDraft<T>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage pode falhar (modo privado, quota cheia, etc.) — nesse
    // caso simplesmente não há rede de segurança, mas o salvamento em si
    // (fetch) continua funcionando normalmente.
  }
}

export function loadFormDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ver saveFormDraft
  }
}

/**
 * Gera um id curto e único o bastante pra identificar uma TENTATIVA de
 * preenchimento (não o conteúdo digitado — duas tentativas podem ter o
 * mesmo nome de produto/categoria de propósito, ex. duas categorias
 * "Arroz"). Mesmo padrão de `newLineKey()` em `produtos-client.tsx`:
 * suficiente pra uma chave só da aba atual, não precisa da força de um
 * UUID de verdade.
 */
export function newDraftId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Lê a LISTA de rascunhos pendentes guardada sob `key` — nunca um objeto
 * único. Guardar uma lista (em vez de um rascunho só) é o que permite mais
 * de uma tentativa interrompida coexistir: ex. começar "Polvo", ser
 * interrompido por navegação, sem decidir o aviso começar "Lula" também, e
 * ser interrompido de novo — as duas precisam sobreviver, não só a mais
 * recente. Cada entrada precisa ter um campo `draftId` (ver `newDraftId`)
 * que identifica a TENTATIVA em si, nunca o nome digitado — comparar por
 * nome pra decidir se uma tentativa "já foi salva" dá falso positivo
 * sempre que dois itens diferentes legitimamente têm o mesmo nome.
 */
export function loadDraftEntries<T extends { draftId: string }>(key: string): T[] {
  return loadFormDraft<T[]>(key) ?? [];
}

/** Grava/atualiza só a entrada com esse `draftId`, preservando as demais. */
export function upsertDraftEntry<T extends { draftId: string }>(key: string, entry: T) {
  const current = loadDraftEntries<T>(key);
  const next = [...current.filter((e) => e.draftId !== entry.draftId), entry];
  saveFormDraft(key, next);
}

/** Remove só a entrada com esse `draftId`, preservando as demais. */
export function removeDraftEntry(key: string, draftId: string) {
  const current = loadDraftEntries<{ draftId: string }>(key);
  const next = current.filter((e) => e.draftId !== draftId);
  if (next.length > 0) {
    saveFormDraft(key, next);
  } else {
    // Nenhuma entrada sobrando — remove a chave inteira em vez de deixar um
    // array vazio `"[]"` ocupando espaço à toa.
    clearFormDraft(key);
  }
}
