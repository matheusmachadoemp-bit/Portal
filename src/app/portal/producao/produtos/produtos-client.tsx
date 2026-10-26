"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { PRODUCTION_ITEM_TYPE_LABEL, PRODUCTION_ITEM_TYPE_OPTIONS, PRODUCTION_PRIORITY_OPTIONS } from "@/lib/producao";
import { loadDraftEntries, newDraftId, removeDraftEntry, upsertDraftEntry } from "@/lib/session-draft";
import type { CategoriaOption, ProductionItemDTO, SetorOption } from "../types";
import { NovaCategoriaModal, type CategoriaCriada } from "../nova-categoria-modal";

type IngredientOption = { id: string; name: string; unidade: string };
type IngredienteLine = { key: string; ingredientId: string; quantidadeUsada: string; unidade: string };

const emptyForm = {
  name: "",
  categoryId: "",
  setorId: "",
  unidade: "kg",
  descricao: "",
  modoPreparo: "",
  tipo: "VARIAVEL",
  quantidadeMinima: "0",
  margemSeguranca: "10",
  tamanhoLote: "",
  validadeDias: "",
  horarioLimitePadrao: "15:00",
  prioridadePadrao: "NORMAL",
  ingredientId: "",
};

function newLineKey() {
  return Math.random().toString(36).slice(2);
}

// Chave do rascunho em sessionStorage (ver src/lib/session-draft.ts) — só
// este formulário (criar/editar produto de produção) usa essa chave. Guarda
// uma LISTA de tentativas (ver `ProdutoDraftEntry`), não um rascunho só:
// mais de uma tentativa interrompida (ex.: "Polvo" e, depois, "Lula", sem
// decidir o aviso da primeira) precisa sobreviver ao mesmo tempo, sem uma
// sobrescrever a outra em sessionStorage.
const DRAFT_KEY = "producao-produtos-form-draft-v1";

type ProdutoDraftEntry = {
  // Identifica a TENTATIVA em si (gerado ao abrir o formulário), nunca o
  // nome digitado — duas tentativas podem ter legitimamente o mesmo nome
  // (ex.: duas categorias diferentes de "Arroz"), então nunca usamos o nome
  // pra decidir se algo "já foi salvo" (ver efeito de recuperação abaixo).
  draftId: string;
  form: typeof emptyForm;
  lines: IngredienteLine[];
  // null quando o rascunho é de um produto NOVO (POST); com valor quando é
  // de uma EDIÇÃO (PATCH) de um produto já existente.
  editingId: string | null;
};

export function ProdutosClient({
  initialItens,
  categorias,
  setores,
  ingredientOptions,
  canCreate = true,
}: {
  initialItens: ProductionItemDTO[];
  categorias: CategoriaOption[];
  setores: SetorOption[];
  ingredientOptions: IngredientOption[];
  canCreate?: boolean;
}) {
  const [itens, setItens] = useState(initialItens);
  const [categoriasState, setCategoriasState] = useState<CategoriaOption[]>(categorias);
  const [showForm, setShowForm] = useState(false);
  const [showNovaCategoria, setShowNovaCategoria] = useState(false);
  const [editing, setEditing] = useState<ProductionItemDTO | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<IngredienteLine[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Trava síncrona além do estado `saving` acima: `saving` só reflete a UI depois que o React
  // processa o `setSaving(true)` (pode levar um "tick"), então dois cliques/toques muito
  // rápidos no botão Salvar (comum em tablet de cozinha/bar) poderiam, em teoria, passar os
  // dois pelo `if (saving) return` antes do primeiro re-render acontecer. `useRef` muda na
  // hora, sem esperar o React re-renderizar, então bloqueia esse segundo disparo de verdade.
  const savingRef = useRef(false);
  // Lista de rascunhos pendentes (uma por TENTATIVA interrompida por
  // navegação — ver `DRAFT_KEY`/`submit` abaixo e o comentário em
  // `src/lib/session-draft.ts`). Mais de uma pode coexistir: ex. começar
  // "Polvo", ser interrompido, sem decidir o aviso começar "Lula" também, e
  // ser interrompido de novo — as duas precisam continuar oferecidas, não só
  // a mais recente.
  const [drafts, setDrafts] = useState<ProdutoDraftEntry[]>([]);
  // Rascunho de EDIÇÃO cujo produto original não existe mais na lista
  // carregada (foi desativado por outra aba/pessoa nesse meio-tempo) — só é
  // setado quando o usuário clica "Continuar de onde parou" nesse caso
  // específico. Em vez de silenciosamente virar uma CRIAÇÃO (POST) disfarçada
  // de edição, pede confirmação explícita primeiro (ver `ConfirmDialog`
  // abaixo), porque criar um produto novo com o mesmo nome do que sumiu é
  // uma decisão que o usuário precisa tomar de olhos abertos, não que o
  // sistema tome por ele.
  const [pendingOrphanEdit, setPendingOrphanEdit] = useState<ProdutoDraftEntry | null>(null);
  // Id da tentativa (rascunho) que a sessão ATUAL do modal representa —
  // sempre setado ao abrir o formulário (`openNew`/`openEdit`/`restoreDraft`
  // via `applyDraft`), nunca o nome digitado (ver `ProdutoDraftEntry`).
  const draftIdRef = useRef<string | null>(null);
  // Marca se a sessão ATUAL do modal já gravou/assumiu SUA PRÓPRIA entrada
  // (`draftIdRef.current`) em sessionStorage — ou seja, se um fechamento
  // explícito agora (X/Esc/backdrop) deve apagar essa entrada específica.
  // Sem isso, abrir "Novo produto" pra cadastrar algo totalmente diferente e
  // cancelar sem salvar removeria, de brinde, a entrada de OUTRA tentativa
  // (ex.: o "Polvo" interrompido por navegação) que ainda nem foi
  // oferecida/decidida pelo usuário. Note que isso só protege a entrada
  // desta sessão — as demais, de outras tentativas, nunca são tocadas por
  // `closeForm`/`submit` desta sessão de qualquer forma, já que cada uma
  // vive sob seu próprio `draftId`.
  const sessionOwnsDraftRef = useRef(false);

  useEffect(() => {
    // Intencionalmente só na montagem: é uma checagem "a página acabou de
    // carregar, sobrou algum rascunho de antes?", não algo que deva reagir a
    // toda atualização da lista enquanto o usuário já está trabalhando na
    // tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage só existe no cliente; carrega, só na montagem, os rascunhos de uma navegação anterior pra oferecer
    setDrafts(loadDraftEntries<ProdutoDraftEntry>(DRAFT_KEY));
  }, []);

  // Nunca decide sozinho que uma tentativa "já foi salva" — só informa (ver
  // aviso no JSX abaixo). Comparar por NOME contra a lista inteira já foi
  // tentado antes e causou um bug pior: dois produtos diferentes podem
  // legitimamente ter o mesmo nome (ex. duas categorias com "Arroz"), então
  // descartar automaticamente nesse caso já chegou a apagar, em silêncio,
  // uma segunda tentativa de verdade que nunca tinha sido salva.
  function existeProdutoComEsseNome(nome: string) {
    const alvo = nome.trim().toLowerCase();
    if (!alvo) return false;
    return itens.some((i) => i.name.trim().toLowerCase() === alvo);
  }

  function applyDraft(entry: ProdutoDraftEntry, item: ProductionItemDTO | null) {
    setEditing(item);
    setForm(entry.form);
    setLines(entry.lines);
    setError(null);
    setShowForm(true);
    draftIdRef.current = entry.draftId;
    sessionOwnsDraftRef.current = true;
    // Só esconde essa entrada do aviso — ela continua em sessionStorage até
    // a próxima tentativa de salvar terminar com sucesso (ou até o usuário
    // fechar o modal explicitamente), caso essa navegação seja interrompida
    // de novo. As demais entradas da lista (outras tentativas) continuam
    // exibidas normalmente.
    setDrafts((prev) => prev.filter((d) => d.draftId !== entry.draftId));
  }

  function restoreDraft(entry: ProdutoDraftEntry) {
    if (!entry.editingId) {
      applyDraft(entry, null);
      return;
    }
    const item = itens.find((i) => i.id === entry.editingId) ?? null;
    if (item) {
      applyDraft(entry, item);
      return;
    }
    // O produto que esse rascunho estava editando não existe mais na lista
    // (foi desativado nesse meio-tempo) — pede confirmação explícita antes
    // de deixar isso virar uma CRIAÇÃO disfarçada de edição (ver
    // `ConfirmDialog` no JSX abaixo).
    setPendingOrphanEdit(entry);
  }

  function discardDraft(draftId: string) {
    removeDraftEntry(DRAFT_KEY, draftId);
    setDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
    if (pendingOrphanEdit?.draftId === draftId) setPendingOrphanEdit(null);
  }

  async function refresh() {
    const res = await fetch("/api/producao/itens");
    const data = await res.json();
    setItens(data.itens);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categoriasState[0]?.id ?? "" });
    setLines([]);
    setError(null);
    setShowForm(true);
    // Nova tentativa, novo id — nunca reusa o id de um rascunho pendente
    // diferente. Não mexe em `drafts`/sessionStorage: outras tentativas
    // ainda não decididas continuam lá, intactas, pro aviso continuar
    // oferecendo elas separadamente.
    draftIdRef.current = newDraftId();
    sessionOwnsDraftRef.current = false;
  }

  function openEdit(item: ProductionItemDTO) {
    setEditing(item);
    setForm({
      name: item.name,
      categoryId: item.category.id,
      setorId: item.setorId ?? "",
      unidade: item.unidade,
      descricao: item.descricao ?? "",
      modoPreparo: item.modoPreparo ?? "",
      tipo: item.tipo,
      quantidadeMinima: String(item.quantidadeMinima),
      margemSeguranca: String(item.margemSeguranca),
      tamanhoLote: item.tamanhoLote ? String(item.tamanhoLote) : "",
      validadeDias: item.validadeDias ? String(item.validadeDias) : "",
      horarioLimitePadrao: item.horarioLimitePadrao ?? "15:00",
      prioridadePadrao: item.prioridadePadrao,
      ingredientId: item.ingredientId ?? "",
    });
    setLines(
      item.ingredientes.map((ing) => ({
        key: newLineKey(),
        ingredientId: ing.ingredientId,
        quantidadeUsada: String(ing.quantidadeUsada),
        unidade: ing.unidade,
      }))
    );
    setError(null);
    setShowForm(true);
    // Ver comentário equivalente em `openNew`.
    draftIdRef.current = newDraftId();
    sessionOwnsDraftRef.current = false;
  }

  function addLine() {
    setLines((l) => [...l, { key: newLineKey(), ingredientId: ingredientOptions[0]?.id ?? "", quantidadeUsada: "", unidade: "g" }]);
  }
  function removeLine(key: string) {
    setLines((l) => l.filter((line) => line.key !== key));
  }
  function updateLine(key: string, patch: Partial<IngredienteLine>) {
    setLines((l) => l.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function categoriaCriada(categoria: CategoriaCriada) {
    setCategoriasState((c) => [...c, categoria]);
    // Já que o usuário acabou de criar essa categoria de dentro do próprio
    // formulário do produto, o mais útil é deixá-la já selecionada em vez de
    // fazer ele voltar no <select> e procurar de novo.
    setForm((f) => ({ ...f, categoryId: categoria.id }));
  }

  async function submit() {
    if (savingRef.current) return;
    if (!form.name || !form.categoryId) {
      setError("Nome e categoria são obrigatórios.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      setorId: form.setorId || null,
      ingredientId: form.ingredientId || null,
      ingredientes: lines.filter((l) => l.ingredientId && l.quantidadeUsada),
    };
    // Garante que esta sessão do modal tem um id de rascunho — normalmente
    // já vem de `openNew`/`openEdit`/`restoreDraft`, mas defensivo caso
    // algum caminho futuro abra o form sem passar por eles.
    if (!draftIdRef.current) draftIdRef.current = newDraftId();
    const thisDraftId = draftIdRef.current;
    // Grava o rascunho ANTES de disparar a requisição (ver `src/lib/
    // session-draft.ts`): se o usuário apertar "voltar" do navegador (ou
    // fechar a aba) enquanto ela está em voo, o navegador pode abortar a
    // própria requisição antes de terminar (`net::ERR_ABORTED`) e o produto
    // nunca chega a ser criado/editado — sem nenhuma mensagem de erro,
    // porque a tela já mudou. `closeDisabled` no `Modal` só bloqueia fechar
    // PELO MODAL (X/Esc/clique no fundo); não tem como, e não deveria
    // tentar, bloquear uma navegação de página inteira (interceptar o botão
    // "voltar" do navegador de forma confiável não é trivial nesta versão
    // do Next.js App Router). Em vez disso, aceita que a navegação pode
    // acontecer e evita a PERDA do que foi digitado: ao reabrir esta tela,
    // o efeito de montagem acima detecta esse rascunho e oferece recuperá-lo.
    // `upsertDraftEntry` grava SÓ a entrada com esse `draftId`, preservando
    // qualquer outra tentativa pendente já guardada (ver `drafts` acima).
    upsertDraftEntry<ProdutoDraftEntry>(DRAFT_KEY, {
      draftId: thisDraftId,
      form,
      lines,
      editingId: editing?.id ?? null,
    });
    sessionOwnsDraftRef.current = true;
    try {
      const res = await fetch(editing ? `/api/producao/itens/${editing.id}` : "/api/producao/itens", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Não foi possível salvar o produto de produção.");
        return;
      }
      // Sucesso de verdade: essa entrada específica não serve mais pra nada
      // (as demais, de outras tentativas, não são afetadas).
      removeDraftEntry(DRAFT_KEY, thisDraftId);
      setDrafts((prev) => prev.filter((d) => d.draftId !== thisDraftId));
      setShowForm(false);
      refresh();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function closeForm() {
    // Fechamento explícito e deliberado do usuário (X, Esc, clique no
    // fundo) — diferente de uma navegação involuntária, aqui dá pra
    // confiar que ele realmente quis abandonar o que estava digitando.
    // `closeDisabled` (abaixo, na prop do Modal) já impede isso enquanto
    // `saving` for true, então a essa altura não há requisição em voo. Só
    // apaga a entrada DESTA sessão em sessionStorage se ela chegou a
    // gravá-la/assumi-la (ver `sessionOwnsDraftRef`) — senão corre o risco
    // de descartar, de brinde, o rascunho de uma tentativa completamente
    // diferente que o aviso no topo da tela ainda nem ofereceu. Outras
    // entradas (de outras tentativas) nunca são tocadas aqui de qualquer
    // forma, já que cada uma vive sob seu próprio `draftId`.
    if (sessionOwnsDraftRef.current && draftIdRef.current) {
      const thisDraftId = draftIdRef.current;
      removeDraftEntry(DRAFT_KEY, thisDraftId);
      setDrafts((prev) => prev.filter((d) => d.draftId !== thisDraftId));
    }
    setShowForm(false);
  }

  async function doDelete() {
    if (!confirmDeleteId) return;
    await fetch(`/api/producao/itens/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    refresh();
  }

  return (
    <Section
      title="Produtos de produção cadastrados"
      action={
        canCreate ? (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
          >
            <Plus size={13} /> Novo produto
          </button>
        ) : undefined
      }
    >
      {drafts.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {drafts.map((d) => {
            // Avisos adicionais, meramente informativos — nunca decidem
            // nada sozinhos (ver `existeProdutoComEsseNome` e o motivo de
            // não auto-descartar mais acima).
            const possivelDuplicado = !d.editingId && existeProdutoComEsseNome(d.form.name);
            const edicaoOrfa = !!d.editingId && !itens.some((i) => i.id === d.editingId);
            return (
              <div
                key={d.draftId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-nord-warning/10 border border-nord-warning/30"
              >
                <div className="text-xs text-nord-warning">
                  <p>
                    Você tinha {d.editingId ? "uma edição de produto" : "um produto"} em andamento
                    {d.form.name ? (
                      <>
                        {" "}
                        (<span className="font-medium">{d.form.name}</span>)
                      </>
                    ) : null}{" "}
                    que não foi salvo — a navegação foi interrompida antes do salvamento terminar. Continuar de onde
                    parou?
                  </p>
                  {possivelDuplicado && (
                    <p className="mt-1 text-nord-warning/80">
                      Atenção: já existe um produto chamado &quot;{d.form.name}&quot; cadastrado — confira se essa
                      tentativa já não foi salva antes, pra não duplicar.
                    </p>
                  )}
                  {edicaoOrfa && (
                    <p className="mt-1 text-nord-warning/80">
                      O produto que você estava editando não existe mais (pode ter sido desativado nesse
                      meio-tempo) — continuar vai pedir confirmação antes de criar um produto NOVO com esses dados.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => discardDraft(d.draftId)} className="text-xs text-nord-gray hover:text-white px-2 py-1.5">
                    Descartar
                  </button>
                  <button
                    onClick={() => restoreDraft(d)}
                    className="text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium px-3 py-1.5 rounded-lg"
                  >
                    Continuar de onde parou
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {itens.map((item) => (
          <div key={item.id} className="nord-card p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <DynamicIcon name={item.category.icon} size={16} style={{ color: item.category.color }} />
                <p className="text-white font-medium text-sm truncate">{item.name}</p>
              </div>
              <Badge tone={item.tipo === "FIXO" ? "info" : "default"}>{PRODUCTION_ITEM_TYPE_LABEL[item.tipo]?.split(" ")[0]}</Badge>
            </div>
            <p className="text-xs text-nord-gray">{item.category.name}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-nord-gray">
              <span>
                Estoque pronto: <span className="text-white">{item.stock?.saldoAtual ?? 0} {item.unidade}</span>
              </span>
              <span>
                Margem: <span className="text-white">{item.margemSeguranca}%</span>
              </span>
              {item.tamanhoLote && (
                <span>
                  Lote: <span className="text-white">{item.tamanhoLote} {item.unidade}</span>
                </span>
              )}
              {item.tipo === "FIXO" && (
                <span>
                  Mínimo: <span className="text-white">{item.quantidadeMinima} {item.unidade}</span>
                </span>
              )}
            </div>
            {canCreate && (
              <div className="flex items-center gap-2 pt-2 border-t border-nord-border/60 mt-1">
                <button onClick={() => openEdit(item)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-white py-1.5">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => setConfirmDeleteId(item.id)} className="flex-1 flex items-center justify-center gap-1 text-xs text-nord-gray hover:text-nord-danger py-1.5">
                  <Trash2 size={12} /> Desativar
                </button>
              </div>
            )}
          </div>
        ))}
        {itens.length === 0 && <p className="text-sm text-nord-gray col-span-full text-center py-10">Nenhum produto de produção cadastrado ainda.</p>}
      </div>

      <Modal
        key={editing?.id ?? "producao-produto-novo"}
        open={showForm}
        onClose={closeForm}
        closeDisabled={saving}
        title={editing ? "Editar produto de produção" : "Novo produto de produção"}
        widthClass="max-w-2xl"
      >
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              list="producao-nome-sugestoes"
              placeholder="Digite ou escolha um insumo da ficha técnica"
              autoComplete="off"
              className="input"
            />
            <datalist id="producao-nome-sugestoes">
              {ingredientOptions.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <div className="flex items-center gap-2">
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input flex-1">
                {categoriasState.length === 0 && <option value="">Nenhuma categoria cadastrada</option>}
                {categoriasState.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNovaCategoria(true)}
                title="Nova categoria"
                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-nord-border text-nord-gray hover:text-white hover:border-white/30"
              >
                <Plus size={14} />
              </button>
            </div>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Setor (opcional)</span>
            <select value={form.setorId} onChange={(e) => setForm({ ...form, setorId: e.target.value })} className="input">
              <option value="">Nenhum</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Unidade</span>
            <input
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
              autoComplete="off"
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tipo de produção</span>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input">
              {PRODUCTION_ITEM_TYPE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Prioridade padrão</span>
            <select value={form.prioridadePadrao} onChange={(e) => setForm({ ...form, prioridadePadrao: e.target.value })} className="input">
              {PRODUCTION_PRIORITY_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {form.tipo === "FIXO" && (
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Quantidade mínima diária</span>
              <input
                value={form.quantidadeMinima}
                onChange={(e) => setForm({ ...form, quantidadeMinima: e.target.value })}
                autoComplete="off"
                className="input"
              />
            </label>
          )}
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Margem de segurança (%)</span>
            <input
              value={form.margemSeguranca}
              onChange={(e) => setForm({ ...form, margemSeguranca: e.target.value })}
              autoComplete="off"
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Tamanho do lote (opcional)</span>
            <input
              value={form.tamanhoLote}
              onChange={(e) => setForm({ ...form, tamanhoLote: e.target.value })}
              autoComplete="off"
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Validade (dias, opcional)</span>
            <input
              value={form.validadeDias}
              onChange={(e) => setForm({ ...form, validadeDias: e.target.value })}
              autoComplete="off"
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Horário limite padrão</span>
            <input type="time" value={form.horarioLimitePadrao} onChange={(e) => setForm({ ...form, horarioLimitePadrao: e.target.value })} className="input" />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Ligar a um insumo da ficha técnica (opcional)</span>
            <select value={form.ingredientId} onChange={(e) => setForm({ ...form, ingredientId: e.target.value })} className="input">
              <option value="">Nenhum (não entra na previsão automática)</option>
              {ingredientOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-nord-gray mt-1">
              Ligue ao insumo que os produtos vendidos usam na ficha técnica (ex.: &quot;Frango Desfiado&quot;) para que a
              previsão de vendas calcule a necessidade automaticamente.
            </span>
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-nord-gray mb-1">Modo de preparo (opcional)</span>
            <textarea
              value={form.modoPreparo}
              onChange={(e) => setForm({ ...form, modoPreparo: e.target.value })}
              rows={4}
              className="input"
              placeholder="Ex.: 1) Cozinhe o arroz na proporção 2:1... 2) Tempere com..."
            />
            <span className="block text-[11px] text-nord-gray mt-1">
              Esse passo a passo aparece pra equipe de produção no botão &quot;Modo de preparo&quot; da tela Produção de Hoje.
            </span>
          </label>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-nord-gray">Insumos usados na produção</span>
            <button onClick={addLine} className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline">
              <Plus size={12} /> Adicionar insumo
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <select
                  value={line.ingredientId}
                  onChange={(e) => updateLine(line.key, { ingredientId: e.target.value })}
                  className="input flex-1"
                >
                  {ingredientOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  value={line.quantidadeUsada}
                  onChange={(e) => updateLine(line.key, { quantidadeUsada: e.target.value })}
                  placeholder="Qtd."
                  className="input w-20"
                />
                <input
                  value={line.unidade}
                  onChange={(e) => updateLine(line.key, { unidade: e.target.value })}
                  placeholder="un."
                  className="input w-16"
                />
                <button onClick={() => removeLine(line.key)} className="text-nord-gray hover:text-nord-danger">
                  <X size={14} />
                </button>
              </div>
            ))}
            {lines.length === 0 && <p className="text-xs text-nord-gray">Nenhum insumo adicionado ainda.</p>}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-4 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </Modal>

      <NovaCategoriaModal open={showNovaCategoria} onClose={() => setShowNovaCategoria(false)} onCreated={categoriaCriada} />

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Desativar produto de produção"
        message="Isso desativa o produto de produção (o histórico de ordens já geradas é mantido). Deseja continuar?"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
        confirmLabel="Desativar"
        danger
      />

      <ConfirmDialog
        open={!!pendingOrphanEdit}
        title="Produto original não encontrado"
        message={`O produto que você estava editando ("${pendingOrphanEdit?.form.name ?? ""}") não existe mais — pode ter sido desativado nesse meio-tempo. Continuar vai criar um produto NOVO com os dados recuperados, não uma edição. Deseja continuar?`}
        onConfirm={() => {
          if (pendingOrphanEdit) applyDraft(pendingOrphanEdit, null);
          setPendingOrphanEdit(null);
        }}
        onCancel={() => setPendingOrphanEdit(null)}
        confirmLabel="Criar como produto novo"
      />
    </Section>
  );
}
