"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/calc";
import { periodoLabel } from "@/lib/reuniao";
import { indicatorAccentColor } from "@/components/reuniao/fechamento-do-mes";

/**
 * Card "Metas de [próximo mês]" (logo abaixo de "Observações da reunião") —
 * cadastro livre de metas para o mês seguinte ao período que o usuário está
 * vendo na tela (`periodo`, calculado pela própria tela como
 * `nextPeriodo(selectedPeriodo)` — não mais fixo em "o mês seguinte a
 * hoje"): cada uma com métrica, valor-alvo e o prêmio (valor +
 * destinatário, "Equipe" por padrão) ao bater. Mecanismo único (model
 * `MetaProximoMes`) compartilhado pelas 5 reuniões (ver GET/POST/PATCH/DELETE
 * /api/reuniao/{sub}/metas-proximo-mes(/[id]) — contrato idêntico nas 5, só o
 * `sub`/`meetingKey` muda).
 *
 * Nasceu só na Reunião Gerente (implementação inline, antes deste componente
 * existir) e foi extraído aqui pra ser reaproveitado pelas 5 reuniões sem
 * copiar/colar — mesmo padrão já usado por `fechamento-do-mes.tsx`
 * (hook de estado + peças visuais). A própria Reunião Gerente também foi
 * migrada para usar este componente (ver gerente-client.tsx), eliminando a
 * duplicação por completo.
 */

export type MetaProximoMes = {
  id: string;
  periodo: string;
  metrica: string;
  valorAlvo: string;
  valorPremio: number;
  destinatario: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

function buildMetaForm(m?: MetaProximoMes | null) {
  return {
    metrica: m?.metrica ?? "",
    valorAlvo: m?.valorAlvo ?? "",
    valorPremio: m?.valorPremio != null ? String(m.valorPremio) : "",
    destinatario: m?.destinatario ?? "Equipe",
  };
}

/**
 * Busca as metas do próximo mês fresquinhas do servidor (não reaproveita o
 * estado já carregado na tela) — usado pelo `exportPdf()` de cada reunião na
 * hora do clique em Exportar, pra garantir que o PDF sai com o que está
 * salvo agora, inclusive em modo Grupo Nord (a API já devolve lista vazia e
 * o PDF mostra "nenhuma meta cadastrada" em vez de pular a página). Em caso
 * de erro de rede, cai num fallback vazio em vez de travar a exportação.
 * `periodo` é o mês-alvo (ex.: `nextPeriodo(selectedPeriodo)`, calculado pela
 * tela a partir do período selecionado no momento do clique em Exportar) —
 * garante que o PDF reflita o período que o usuário estava olhando, não "o
 * mês seguinte a hoje".
 */
export async function fetchMetasProximoMesForPdf(apiBase: string, periodo: string): Promise<{ periodoLabel: string; metas: MetaProximoMes[] }> {
  try {
    const res = await fetch(`${apiBase}/metas-proximo-mes?periodo=${periodo}`);
    if (!res.ok) return { periodoLabel: periodoLabel(periodo), metas: [] };
    const data = await res.json().catch(() => null);
    return { periodoLabel: data?.periodoLabel ?? periodoLabel(periodo), metas: data?.metas ?? [] };
  } catch {
    return { periodoLabel: periodoLabel(periodo), metas: [] };
  }
}

/**
 * Estado + chamadas de API do card "Metas de [próximo mês]" de uma reunião.
 * `apiBase` é a rota da própria reunião (ex.: "/api/reuniao/cozinha") — as
 * metas usam sempre `${apiBase}/metas-proximo-mes?periodo=...` (listar/criar)
 * e `${apiBase}/metas-proximo-mes/{id}` (editar/excluir, sem precisar mandar
 * `periodo` — operam numa meta já existente, identificada pelo próprio ID,
 * e editar/excluir não muda o período da meta). `canLoad` é o mesmo
 * `canCreate` (isSingle) do resto da tela — em modo Grupo Nord o card nem
 * aparece, então nem faz sentido buscar. `periodo` é o mês-alvo das metas
 * (normalmente `nextPeriodo(selectedPeriodo)`, calculado pela tela a partir
 * do período que o usuário está vendo agora — nunca mais fixo em "o mês
 * seguinte a hoje").
 *
 * Igual a `useFechamentoDoMes`, as metas do próximo mês dependem do período
 * selecionado na tela — trocar de período reexecuta o efeito de busca
 * abaixo, que usa a flag `cancelled` por execução pra descartar resposta
 * fora de ordem (troca rápida de período não deixa uma busca antiga
 * sobrescrever o resultado da busca mais recente, porque cada execução do
 * efeito tem sua própria flag, fechada por `cancelled = true` na limpeza
 * quando `periodo`/`canLoad`/`apiBase` mudam de novo ou o componente
 * desmonta).
 */
export function useMetasProximoMes(apiBase: string, canLoad: boolean, periodo: string) {
  const [metas, setMetas] = useState<MetaProximoMes[]>([]);
  // Só começa "carregando" quando o card vai mesmo aparecer (canLoad) — evita precisar
  // setState síncrono dentro do efeito abaixo só pra desligar o loading no modo Grupo Nord.
  const [metasLoading, setMetasLoading] = useState(canLoad);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState(buildMetaForm(null));
  const [creating, setCreating] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<MetaProximoMes | null>(null);
  const [editForm, setEditForm] = useState(buildMetaForm(null));
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<MetaProximoMes | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * Existem dois caminhos independentes que buscam metas do servidor e escrevem no mesmo
   * estado (`metas`): o `useEffect` abaixo (dispara quando `periodo` muda — ex. a tela trocou
   * de mês selecionado) e `refreshMetas()` (chamado por `createMeta()`/`saveEdit()`/
   * `confirmDelete()` depois do respectivo POST/PATCH/DELETE). Sem coordenação entre os dois, a
   * resposta atrasada de um caminho pode sobrescrever a tela com meta de um período que não é
   * mais o selecionado — mesma classe de corrida (e mesma solução, token de geração
   * compartilhado via `beginFetch()`) já corrigida em gerente-client.tsx e em
   * `useFechamentoDoMes` (fechamento-do-mes.tsx); ver os comentários ao redor de
   * `fetchGenerationRef`/`beginFetch` nesses dois arquivos para o raciocínio completo.
   *
   * Importante (mesmo cuidado de lá): o token de `refreshMetas()` precisa ser obtido pelo
   * CHAMADOR (`createMeta`, `saveEdit`, `confirmDelete`) como a PRIMEIRA coisa que cada um faz
   * — antes de disparar a própria mutação (POST/PATCH/DELETE) que antecede o `refreshMetas` —
   * nunca só dentro do `refreshMetas()` em si, depois da mutação já ter respondido. Senão, o
   * tempo da própria mutação abriria uma janela extra em que uma troca de período poderia
   * "vencer" essa edição mesmo tendo acontecido depois dela, na ordem real dos cliques do
   * usuário.
   */
  const fetchGenerationRef = useRef(0);
  function beginFetch(): number {
    fetchGenerationRef.current += 1;
    return fetchGenerationRef.current;
  }

  useEffect(() => {
    if (!canLoad) return;
    let cancelled = false;
    const token = beginFetch();
    fetch(`${apiBase}/metas-proximo-mes?periodo=${periodo}`)
      .then((res) => res.json())
      .then((data) => {
        // `cancelled`: esta própria instância do efeito foi desmontada/re-executada (ex.:
        // `periodo` mudou de novo) antes da resposta chegar. `token !== fetchGenerationRef.current`:
        // uma busca MAIS NOVA — deste mesmo efeito reexecutando, OU de `refreshMetas()` — já
        // começou desde então; ver o comentário de `fetchGenerationRef` acima. Nos dois casos,
        // descarta a resposta em silêncio.
        if (cancelled || token !== fetchGenerationRef.current) return;
        setMetas(data.metas ?? []);
      })
      .finally(() => !cancelled && setMetasLoading(false));
    return () => {
      cancelled = true;
    };
  }, [apiBase, canLoad, periodo]);

  // `token` vem do CHAMADOR (ver o comentário de `fetchGenerationRef`/`beginFetch` acima) —
  // obtido por ele antes de disparar a própria mutação (POST/PATCH/DELETE), nunca gerado aqui
  // dentro. Gerar um token novo aqui, DEPOIS da mutação já ter respondido, reabriria
  // exatamente o buraco que este mecanismo existe pra fechar (ver o mesmo comentário).
  async function refreshMetas(token: number) {
    const res = await fetch(`${apiBase}/metas-proximo-mes?periodo=${periodo}`);
    const data = await res.json();
    // Se uma busca mais nova (de qualquer chamador de refreshMetas(), ou do efeito de troca de
    // período acima) já começou enquanto esta estava em andamento, descarta a resposta por
    // completo — pra não sobrescrever a tela com meta de um período que não é mais o
    // selecionado (ver comentário de `fetchGenerationRef`/`beginFetch` acima).
    if (token !== fetchGenerationRef.current) return;
    setMetas(data.metas ?? []);
  }

  async function createMeta() {
    if (creating) return;
    setNewError(null);
    if (!newForm.metrica.trim()) {
      setNewError("Informe a métrica da meta (ex.: CMV, Tempo Pedido).");
      return;
    }
    if (!newForm.valorAlvo.trim()) {
      setNewError("Informe o valor-alvo da meta (ex.: 35%, 15min).");
      return;
    }
    // Pega o token ANTES do POST (não só antes do refreshMetas) — ver o comentário de
    // `fetchGenerationRef`/`beginFetch` acima sobre por que isso precisa acontecer já aqui. Só
    // depois das validações acima (nenhuma delas dispara fetch nenhum).
    const token = beginFetch();
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/metas-proximo-mes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, periodo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNewError(data?.error ?? "Não foi possível criar a meta.");
        return;
      }
      setNewOpen(false);
      setNewForm(buildMetaForm(null));
      await refreshMetas(token);
    } finally {
      setCreating(false);
    }
  }

  function openEdit(meta: MetaProximoMes) {
    setEditTarget(meta);
    setEditForm(buildMetaForm(meta));
    setEditError(null);
  }

  async function saveEdit() {
    if (!editTarget || savingEdit) return;
    setEditError(null);
    if (!editForm.metrica.trim()) {
      setEditError("Informe a métrica da meta.");
      return;
    }
    if (!editForm.valorAlvo.trim()) {
      setEditError("Informe o valor-alvo da meta.");
      return;
    }
    // Pega o token ANTES do PATCH (não só antes do refreshMetas) — ver o comentário de
    // `fetchGenerationRef`/`beginFetch` acima sobre por que isso precisa acontecer já aqui. Só
    // depois das validações acima (nenhuma delas dispara fetch nenhum).
    const token = beginFetch();
    setSavingEdit(true);
    try {
      const res = await fetch(`${apiBase}/metas-proximo-mes/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setEditError(data?.error ?? "Não foi possível salvar as alterações da meta.");
        return;
      }
      setEditTarget(null);
      await refreshMetas(token);
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    // Pega o token ANTES do DELETE (não só antes do refreshMetas) — ver o comentário de
    // `fetchGenerationRef`/`beginFetch` acima.
    const token = beginFetch();
    setDeleting(true);
    try {
      await fetch(`${apiBase}/metas-proximo-mes/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await refreshMetas(token);
    } finally {
      setDeleting(false);
    }
  }

  return {
    metas,
    metasLoading,
    periodo,
    newOpen,
    setNewOpen,
    newForm,
    setNewForm,
    creating,
    newError,
    createMeta,
    editTarget,
    setEditTarget,
    editForm,
    setEditForm,
    savingEdit,
    editError,
    openEdit,
    saveEdit,
    deleteTarget,
    setDeleteTarget,
    deleting,
    confirmDelete,
  };
}

export type MetasProximoMesState = ReturnType<typeof useMetasProximoMes>;

/**
 * Card "Metas de [próximo mês]" completo (resumo na tela + os 3 modais de
 * criar/editar/excluir) — a própria tela decide quando renderizar isto
 * (normalmente só quando `canCreate`/isSingle, mesmo critério do resto da
 * tela) logo abaixo de "Observações da reunião". `canDelete` é
 * especificamente `canDelete` no módulo "reuniao" (diferente de
 * canCreate/canEdit — o perfil "gerente", por exemplo, tem os dois primeiros
 * mas não o terceiro), controlando só a visibilidade do botão "Excluir" de
 * cada meta.
 */
export function MetasProximoMesSection({ mp, canDelete }: { mp: MetasProximoMesState; canDelete: boolean }) {
  const mesLabel = periodoLabel(mp.periodo);

  return (
    <>
      <Section
        title={`Metas de ${mesLabel}`}
        titleClassName="capitalize"
        action={
          <button onClick={() => mp.setNewOpen(true)} className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline">
            <Plus size={12} /> Nova meta
          </button>
        }
      >
        {mp.metasLoading ? (
          <p className="text-xs text-nord-gray">Carregando metas...</p>
        ) : mp.metas.length > 0 ? (
          <div className="space-y-2">
            {mp.metas.map((meta, index) => {
              const color = indicatorAccentColor(index);
              return (
                <div key={meta.id} className="flex items-center justify-between gap-3 rounded-lg border border-nord-border/60 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}22` }}
                    >
                      <Trophy size={15} style={{ color }} />
                    </div>
                    <p className="text-sm min-w-0 truncate">
                      <span className="text-white font-semibold">
                        {meta.metrica}: {meta.valorAlvo}
                      </span>{" "}
                      <span className="text-nord-gray">→ Ganha</span>{" "}
                      <span className="text-nord-success font-semibold">{formatCurrency(meta.valorPremio)}</span>{" "}
                      <span className="text-nord-gray">{meta.destinatario}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => mp.openEdit(meta)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                      <Pencil size={12} /> Editar
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => mp.setDeleteTarget(meta)}
                        className="text-nord-gray hover:text-nord-danger flex items-center gap-1 text-xs"
                      >
                        <Trash2 size={12} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-nord-gray">
            Nenhuma meta cadastrada ainda para {mesLabel}. Clique em &quot;Nova meta&quot; para adicionar a primeira (ex.: CMV: 35% →
            Ganha R$500 Equipe).
          </p>
        )}
      </Section>

      <Modal open={mp.newOpen} onClose={() => mp.setNewOpen(false)} title="Nova meta">
        <FormError message={mp.newError} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Métrica</span>
              <input
                type="text"
                value={mp.newForm.metrica}
                onChange={(e) => mp.setNewForm({ ...mp.newForm, metrica: e.target.value })}
                placeholder="Ex.: CMV, Tempo Pedido..."
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor-alvo</span>
              <input
                type="text"
                value={mp.newForm.valorAlvo}
                onChange={(e) => mp.setNewForm({ ...mp.newForm, valorAlvo: e.target.value })}
                placeholder="Ex.: 35%, 15min..."
                className="input"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Prêmio ao bater a meta (R$)</span>
              <input
                type="number"
                step="0.01"
                value={mp.newForm.valorPremio}
                onChange={(e) => mp.setNewForm({ ...mp.newForm, valorPremio: e.target.value })}
                placeholder="R$"
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Destinatário</span>
              <select
                value={mp.newForm.destinatario}
                onChange={(e) => mp.setNewForm({ ...mp.newForm, destinatario: e.target.value })}
                className="input"
              >
                <option value="Equipe">Equipe</option>
                <option value="Individual">Individual</option>
              </select>
            </label>
          </div>
          <button
            onClick={mp.createMeta}
            disabled={mp.creating}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {mp.creating ? "Criando..." : "Criar meta"}
          </button>
        </div>
      </Modal>

      <Modal open={mp.editTarget !== null} onClose={() => mp.setEditTarget(null)} title="Editar meta">
        <FormError message={mp.editError} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Métrica</span>
              <input
                type="text"
                value={mp.editForm.metrica}
                onChange={(e) => mp.setEditForm({ ...mp.editForm, metrica: e.target.value })}
                placeholder="Ex.: CMV, Tempo Pedido..."
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor-alvo</span>
              <input
                type="text"
                value={mp.editForm.valorAlvo}
                onChange={(e) => mp.setEditForm({ ...mp.editForm, valorAlvo: e.target.value })}
                placeholder="Ex.: 35%, 15min..."
                className="input"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Prêmio ao bater a meta (R$)</span>
              <input
                type="number"
                step="0.01"
                value={mp.editForm.valorPremio}
                onChange={(e) => mp.setEditForm({ ...mp.editForm, valorPremio: e.target.value })}
                placeholder="R$"
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Destinatário</span>
              <select
                value={mp.editForm.destinatario}
                onChange={(e) => mp.setEditForm({ ...mp.editForm, destinatario: e.target.value })}
                className="input"
              >
                <option value="Equipe">Equipe</option>
                <option value="Individual">Individual</option>
              </select>
            </label>
          </div>
          <button
            onClick={mp.saveEdit}
            disabled={mp.savingEdit}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {mp.savingEdit ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={mp.deleteTarget !== null}
        title="Excluir meta"
        message={`Tem certeza que quer excluir a meta "${mp.deleteTarget?.metrica}: ${mp.deleteTarget?.valorAlvo}"? Essa ação não pode ser desfeita.`}
        confirmLabel={mp.deleting ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={mp.confirmDelete}
        onCancel={() => mp.setDeleteTarget(null)}
      />
    </>
  );
}
