"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import type { ReuniaoCustomIndicatorDTO } from "@/lib/reuniao-server";

/**
 * "Fechamento do mês": lista de indicadores de referência (nome + ícone + 1
 * valor por mês, sem meta-alvo nem premiação) usada pela Reunião Salão,
 * Cozinha, Delivery e Liderança (ver model ReuniaoCustomIndicator/Value em
 * schema.prisma e loadReuniaoCustomIndicators/upsertReuniaoCustomIndicatorValues
 * em src/lib/reuniao-server.ts). Este arquivo reúne o hook de estado
 * (useFechamentoDoMes) e as duas peças visuais que 4 telas passaram a
 * repetir sem nenhuma diferença entre si — evita copiar/colar o mesmo bloco
 * em cada uma.
 *
 * A Reunião Gerente nasceu antes deste componente existir e mantém sua
 * própria implementação inline (o modal dela também pede um segundo valor —
 * "Resultado do período" — por indicador, algo que as outras 4 telas não
 * têm); não foi migrada para não arriscar regressão numa tela que já estava
 * no ar. As próximas 4 (Salão, Cozinha, Delivery, Liderança) já nascem
 * usando este componente.
 */

export type FechamentoIndicator = ReuniaoCustomIndicatorDTO;

const UNIDADE_LABEL: Record<FechamentoIndicator["unidade"], string> = {
  PERCENT: "Percentual (%)",
  CURRENCY: "Reais (R$)",
  NUMBER: "Número",
};

function formatIndicatorValue(unidade: FechamentoIndicator["unidade"], value: number) {
  if (unidade === "CURRENCY") return formatCurrency(value);
  if (unidade === "PERCENT") return `${formatNumber(value, 1)}%`;
  return formatNumber(value, value % 1 === 0 ? 0 : 1);
}

/** "(%)"/"(R$)"/"" — sufixo mostrado ao lado do rótulo "Valor" nos formulários,
 * conforme a unidade escolhida (mesmo texto repetido em vários pontos desta
 * tela antes de virar helper). */
function unidadeSuffix(unidade: FechamentoIndicator["unidade"]) {
  return unidade === "PERCENT" ? "(%)" : unidade === "CURRENCY" ? "(R$)" : "";
}

/**
 * Paleta usada para colorir o ícone de cada indicador da lista "Fechamento do
 * mês", por posição (a ordem em que o indicador aparece na lista) — nenhum
 * indicador tem "tipo"/"categoria" próprios para basear a cor neles, então a
 * meta aqui é só diferenciação visual entre métricas (não status), por isso
 * não usa os tokens de status (`--nord-success/warning/danger`, reservados
 * para indicar se uma meta foi batida ou não). Cor por posição, em vez de
 * calculada a partir do id do indicador, garante que dois indicadores vizinhos
 * na grade nunca caem na mesma cor (até o tamanho da paleta) — testado com
 * amostras de indicadores reais: colorir por id (hash do próprio id, mesmo
 * critério de `colorForUserId` em src/lib/user-color.ts) colidia com
 * frequência incômoda em listas de 9–13 indicadores (comum nesta tela) numa
 * paleta de 10 cores, já que o id não tem nenhuma relação com a posição na
 * lista. A cor de um indicador pode mudar de posição quando a lista muda
 * (outro é criado/excluído antes dele) — troca aceitável por uma
 * diferenciação bem melhor entre os indicadores visíveis no momento.
 */
const INDICATOR_COLOR_PALETTE = [
  "#22c55e", // verde
  "#3b82f6", // azul
  "#f59e0b", // âmbar
  "#a855f7", // roxo
  "#ec4899", // rosa
  "#14b8a6", // teal
  "#f97316", // laranja
  "#06b6d4", // ciano
  "#eab308", // amarelo
  "#8b5cf6", // violeta
];

export function indicatorAccentColor(index: number): string {
  return INDICATOR_COLOR_PALETTE[index % INDICATOR_COLOR_PALETTE.length];
}

/**
 * Cards prontos, no mesmo formato de `items` aceito por `SortableCardGrid`,
 * para os indicadores personalizados da seção "Fechamento do mês" — usa o
 * mesmo `IndicatorCard` (mesmo tamanho/estilo) que os cards fixos de cada
 * reunião, cada um com a cor de `indicatorAccentColor` acima (ver comentário
 * dela). `indicators` deve ser o próprio estado React (`customIndicators`/
 * `fdm.customIndicators`) que
 * criar, editar e excluir um indicador já atualiza sozinho — então o grid de
 * cards do topo de cada reunião fica em dia automaticamente, sem precisar de
 * nenhuma lógica de sincronização própria. Usado tanto pelas 4 telas que
 * usam este hook (Salão, Cozinha, Delivery, Liderança) quanto pela Reunião
 * Gerente, que mantém sua própria implementação inline de estado mas
 * consome esta função do mesmo jeito — o formato do indicador
 * (`FechamentoIndicator`/`GerenteCustomIndicatorDTO`) é idêntico nos dois
 * casos.
 *
 * Não recebe `comparison` (a linha "vs mês passado" que os cards fixos
 * mostram): o DTO só traz o valor do período atual, sem o do mês anterior.
 */
export function customIndicatorCards(indicators: FechamentoIndicator[]): { key: string; content: React.ReactNode }[] {
  return indicators.map((ind, index) => ({
    key: `custom-${ind.id}`,
    content: (
      <IndicatorCard
        icon={ind.icon}
        color={indicatorAccentColor(index)}
        label={ind.nome}
        status={statusOf(null)}
        valueSlot={
          <div>
            <span className="text-2xl font-semibold text-white">{formatIndicatorValue(ind.unidade, ind.valorReferencia)}</span>
            {/* Segundo valor (indicador "composto", ex.: Cancelamentos = % + quantidade) — só
                aparece quando o indicador tem unidadeSecundaria configurada; indicador simples
                (a maioria) segue mostrando só o valor principal acima, sem regressão. */}
            {ind.unidadeSecundaria && (
              <p className="text-xs text-nord-gray mt-1">
                {ind.nomeSecundario}:{" "}
                <span className="text-white font-medium">
                  {formatIndicatorValue(ind.unidadeSecundaria, ind.valorSecundario ?? 0)}
                </span>
              </p>
            )}
          </div>
        }
        metaText="Indicador informativo"
        premio={0}
      />
    ),
  }));
}

type IndicatorFormState = {
  nome: string;
  unidade: FechamentoIndicator["unidade"];
  icon: string;
  valorPadrao: string;
  /** Marca se este indicador tem um segundo valor por período (ex.: Cancelamentos = %
   * + quantidade). Quando `false`, `nomeSecundario`/`unidadeSecundaria` abaixo são
   * ignorados na hora de montar o payload — ver `buildSecondaryPayload` abaixo. */
  hasSecondary: boolean;
  nomeSecundario: string;
  unidadeSecundaria: FechamentoIndicator["unidade"];
};

function emptyIndicatorForm(): IndicatorFormState {
  return { nome: "", unidade: "PERCENT", icon: "Target", valorPadrao: "", hasSecondary: false, nomeSecundario: "", unidadeSecundaria: "PERCENT" };
}

/** Monta os campos `nomeSecundario`/`unidadeSecundaria` do body de criar/editar a
 * partir do formulário — sempre os 2 juntos (preenchidos quando `hasSecondary` está
 * marcado, ou "" nos 2 quando não está, o que o backend entende como "sem segundo
 * valor"/"remover o segundo valor já existente" — ver `parseSecondaryIndicatorFields`
 * em src/lib/reuniao-server.ts). */
function buildSecondaryPayload(form: IndicatorFormState) {
  return {
    nomeSecundario: form.hasSecondary ? form.nomeSecundario : "",
    unidadeSecundaria: form.hasSecondary ? form.unidadeSecundaria : "",
  };
}

function buildCustomForm(indicators: FechamentoIndicator[]): Record<string, string> {
  return Object.fromEntries(indicators.map((ind) => [ind.id, String(ind.valorReferencia)]));
}

/** Rascunho do 2º valor ("Valor" do `nomeSecundario`) por indicador — só indicadores
 * "compostos" (`unidadeSecundaria` configurada) de fato usam isso; os demais ficam
 * com string vazia, sem nenhum campo extra aparecendo no formulário. */
function buildCustomFormSecundario(indicators: FechamentoIndicator[]): Record<string, string> {
  return Object.fromEntries(indicators.map((ind) => [ind.id, ind.valorSecundario != null ? String(ind.valorSecundario) : ""]));
}

/**
 * Estado + chamadas de API da seção "Fechamento do mês" de uma reunião.
 * `apiBase` é a rota da própria reunião (ex.: "/api/reuniao/cozinha") — os
 * indicadores usam sempre `${apiBase}/indicadores` (criar) e
 * `${apiBase}/indicadores/{id}` (editar/excluir). `periodo` é o período
 * (mês) selecionado na tela no momento — passe sempre o estado que a
 * própria tela já mantém (ex.: `selectedPeriodo`), atualizado a cada
 * render; é usado só para buscar de novo os indicadores do período certo
 * depois de editar um (ver `saveEdit` abaixo).
 *
 * O valor de referência de cada indicador (`valorReferencia`, o "1 valor"
 * mostrado nos cards) só é persistido quando a tela salva o restante da
 * reunião (POST /api/reuniao/{sub} já inclui `customIndicators` no corpo) —
 * por isso este hook não expõe um "salvar" próprio para ele; use
 * `buildIndicatorsPayload()` no submit da própria tela.
 *
 * Criar/excluir indicador atualizam a lista local direto a partir da
 * resposta da própria chamada (sem pedir pra tela recarregar o período
 * inteiro) — mais rápido e sem ambiguidade: um indicador recém-criado nunca
 * tem valor salvo pro período (sempre cai no valorPadrao) e um excluído
 * simplesmente some da lista — nos dois casos não há dúvida sobre o valor
 * certo a mostrar.
 *
 * Editar já não é tão simples: o PATCH devolve só o indicador "cru" (nome/
 * ícone/unidade/valorPadrao), sem dizer se o período atual já tinha ou não
 * um valorReferencia próprio salvo — e não dá pra decidir isso com certeza
 * só com o dado local (uma tentativa anterior tentava inferir comparando
 * com o valorPadrao antigo, e falhava sempre que o valor salvo do período
 * coincidia por acaso com esse valorPadrao antigo, indistinguível de "nunca
 * foi salvo"). Por isso `saveEdit`, depois de um PATCH bem-sucedido, busca
 * os indicadores do período de novo em `${apiBase}?periodo=...` — a mesma
 * rota que a tela já usa pra carregar/trocar de período — e aplica o
 * resultado via `sync()`, em vez de tentar adivinhar o valor no cliente.
 *
 * Como agora existem várias buscas assíncronas independentes que podem
 * terminar aplicando indicadores nesse estado — a da própria tela (mount e
 * troca de período, e o `refresh()` que cada tela declara depois de salvar/
 * excluir a reunião) e a de `refreshIndicators` acima — é preciso proteger
 * contra resposta fora de ordem: ex. o usuário edita um indicador estando
 * no período P (dispara uma busca pra P), troca pro período Q antes dela
 * voltar (dispara outra busca, mais nova, que volta rápido e mostra Q
 * certinho) — se a busca de P, mais lenta, for aplicada quando finalmente
 * chegar, ela sobrescreve Q com o dado errado de P sem nenhum aviso visual,
 * e esse valor errado pode até ser salvo de verdade se o usuário confirmar
 * a reunião logo depois. `beginFetch()`/`sync(token, ...)` abaixo existem
 * por causa disso: toda busca que vai terminar chamando `sync()` — na
 * própria tela ou aqui dentro — precisa chamar `beginFetch()` ANTES de
 * disparar o fetch, guardar o token devolvido, e passar esse token pra
 * `sync()` quando a resposta chegar; `sync()` só aplica o resultado se o
 * token ainda for o da busca mais recente, descartando silenciosamente
 * qualquer resposta que chegou fora de ordem.
 */
export function useFechamentoDoMes(apiBase: string, periodo: string, initialCustomIndicators: FechamentoIndicator[]) {
  const [customIndicators, setCustomIndicators] = useState(initialCustomIndicators);
  const [customForm, setCustomForm] = useState(buildCustomForm(initialCustomIndicators));
  // Rascunho do 2º valor (só usado por indicadores "compostos", ver
  // `buildCustomFormSecundario`) — mesma ideia de `customForm`, mas separado porque nem
  // todo indicador tem um 2º valor pra editar.
  const [customFormSecundario, setCustomFormSecundario] = useState(buildCustomFormSecundario(initialCustomIndicators));
  // Incrementado a cada `beginFetch()` — "geração" da busca mais recente.
  // Ver o comentário de `useFechamentoDoMes` acima sobre resposta fora de
  // ordem.
  const fetchGenerationRef = useRef(0);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState(emptyIndicatorForm());
  const [creating, setCreating] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<FechamentoIndicator | null>(null);
  const [editForm, setEditForm] = useState(emptyIndicatorForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<FechamentoIndicator | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Chame ANTES de disparar qualquer fetch que vá terminar chamando
   * `sync()` (troca de período, `refresh()` de cada tela, ou
   * `refreshIndicators` abaixo) — devolve um token que identifica essa
   * busca como a mais recente até então. Guarde o valor devolvido e passe
   * pra `sync()` quando a resposta chegar; ver o comentário de
   * `useFechamentoDoMes` acima sobre por que isso é necessário. */
  function beginFetch(): number {
    fetchGenerationRef.current += 1;
    return fetchGenerationRef.current;
  }

  /** Aplica os indicadores vindos do servidor — mas só se `token` (obtido de
   * `beginFetch()` chamado antes do fetch que trouxe esses dados) ainda for
   * a busca mais recente; uma resposta fora de ordem é descartada em
   * silêncio, sem sobrescrever o que já está correto na tela. Quando aceita,
   * mantém a lista e o rascunho de edição em dia com o que veio da API,
   * preservando a digitação em andamento do campo "Valor" de qualquer
   * indicador que o usuário já tenha alterado (o texto atual é diferente do
   * que estava carregado antes desta chamada) — só os campos ainda
   * intocados acompanham o valor novo vindo do servidor. Isso importa
   * porque `refreshIndicators` (chamado por `saveEdit` no meio de uma
   * edição pontual de indicador) também passa por aqui, sem que o restante
   * do formulário da reunião — incluindo o "Valor" dos outros indicadores —
   * tenha sido salvo ainda. */
  function sync(token: number, indicators: FechamentoIndicator[]) {
    if (token !== fetchGenerationRef.current) return;
    setCustomForm((prevForm) => {
      const next: Record<string, string> = {};
      for (const ind of indicators) {
        const prevInd = customIndicators.find((p) => p.id === ind.id);
        const prevDraft = prevForm[ind.id];
        const draftTouched = prevInd !== undefined && prevDraft !== undefined && prevDraft !== String(prevInd.valorReferencia);
        next[ind.id] = draftTouched ? prevDraft : String(ind.valorReferencia);
      }
      return next;
    });
    // Mesma lógica de cima, aplicada ao rascunho do 2º valor — só existe pra indicadores
    // "compostos" (unidadeSecundaria configurada); os demais entram como string vazia.
    setCustomFormSecundario((prevForm) => {
      const next: Record<string, string> = {};
      for (const ind of indicators) {
        if (!ind.unidadeSecundaria) continue;
        const prevInd = customIndicators.find((p) => p.id === ind.id);
        const prevValue = prevInd?.valorSecundario != null ? String(prevInd.valorSecundario) : "";
        const prevDraft = prevForm[ind.id];
        const draftTouched = prevInd !== undefined && prevDraft !== undefined && prevDraft !== prevValue;
        next[ind.id] = draftTouched ? prevDraft : ind.valorSecundario != null ? String(ind.valorSecundario) : "";
      }
      return next;
    });
    setCustomIndicators(indicators);
  }

  /** Busca de novo, direto do servidor, os indicadores personalizados do
   * período informado (mesma rota `${apiBase}?periodo=...` que a tela usa
   * pra carregar/trocar de período) e aplica o resultado via `sync()`. Usado
   * por `saveEdit`: ver o comentário de `useFechamentoDoMes` acima sobre por
   * que uma edição não dá pra resolver só com o dado local. Erro de rede
   * aqui (depois do PATCH já ter tido sucesso no servidor) é engolido em
   * silêncio — o dado real já está correto, só o estado desta aba que fica
   * desatualizado até trocar de período ou recarregar a página; não vale
   * quebrar a UI do modal (que já fechou) por causa disso. */
  async function refreshIndicators(targetPeriodo: string) {
    const token = beginFetch();
    try {
      const res = await fetch(`${apiBase}?periodo=${targetPeriodo}`);
      const data = await res.json().catch(() => null);
      // `res.ok` importa aqui: numa resposta de erro (401/403/500...) o corpo
      // ainda pode ser um JSON válido (ex.: `{ error: "..." }`), só que sem
      // `customIndicators` — sem essa checagem, `data.customIndicators ?? []`
      // aplicaria uma lista vazia e apagaria os indicadores da tela.
      if (res.ok && data) sync(token, data.customIndicators ?? []);
    } catch (err) {
      console.error("Não foi possível recarregar os indicadores do período depois de editar:", err);
    }
  }

  function updateValorReferencia(id: string, value: string) {
    setCustomForm((prev) => ({ ...prev, [id]: value }));
  }

  function updateValorSecundario(id: string, value: string) {
    setCustomFormSecundario((prev) => ({ ...prev, [id]: value }));
  }

  /** Monta o array `customIndicators` esperado pelo POST da reunião (mesmo
   * formato `{id, valorReferencia}` já usado hoje pela Reunião Gerente) — inclui
   * `valorSecundario` só para indicadores "compostos" (unidadeSecundaria
   * configurada); o backend também ignora esse campo pra indicador simples, mas
   * evitar mandar à toa deixa o payload mais claro. */
  function buildIndicatorsPayload() {
    return customIndicators.map((ind) => ({
      id: ind.id,
      valorReferencia: customForm[ind.id] ?? String(ind.valorReferencia),
      ...(ind.unidadeSecundaria
        ? { valorSecundario: customFormSecundario[ind.id] ?? String(ind.valorSecundario ?? "") }
        : {}),
    }));
  }

  async function createIndicator() {
    if (creating) return;
    setNewError(null);
    if (!newForm.nome.trim()) {
      setNewError("Informe um nome para o indicador.");
      return;
    }
    if (newForm.hasSecondary && !newForm.nomeSecundario.trim()) {
      setNewError("Informe o nome do segundo valor (ou desmarque a opção de segundo valor).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/indicadores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newForm.nome,
          unidade: newForm.unidade,
          icon: newForm.icon,
          valorPadrao: newForm.valorPadrao,
          ...buildSecondaryPayload(newForm),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNewError(data?.error ?? "Não foi possível criar o indicador.");
        return;
      }
      // A rota devolve o registro "cru" (sem valor/valorReferencia, que vivem
      // à parte em ReuniaoCustomIndicatorValue) — um indicador recém-criado
      // ainda não tem valor salvo em nenhum período, então cai no valorPadrao
      // (mesma regra de loadReuniaoCustomIndicators). Idem para valorSecundario:
      // sem período salvo ainda, começa null mesmo que o indicador já nasça
      // composto.
      const created: FechamentoIndicator = {
        id: data.indicator.id,
        nome: data.indicator.nome,
        icon: data.indicator.icon,
        unidade: data.indicator.unidade,
        valorPadrao: data.indicator.valorPadrao,
        valor: null,
        valorReferencia: data.indicator.valorPadrao,
        nomeSecundario: data.indicator.nomeSecundario ?? null,
        unidadeSecundaria: data.indicator.unidadeSecundaria ?? null,
        valorSecundario: null,
      };
      setCustomIndicators((prev) => [...prev, created]);
      setCustomForm((prev) => ({ ...prev, [created.id]: String(created.valorReferencia) }));
      setCustomFormSecundario((prev) => ({ ...prev, [created.id]: "" }));
      setNewOpen(false);
      setNewForm(emptyIndicatorForm());
    } finally {
      setCreating(false);
    }
  }

  function openEdit(ind: FechamentoIndicator) {
    setEditTarget(ind);
    setEditForm({
      nome: ind.nome,
      unidade: ind.unidade,
      icon: ind.icon,
      valorPadrao: String(ind.valorPadrao),
      hasSecondary: !!ind.unidadeSecundaria,
      nomeSecundario: ind.nomeSecundario ?? "",
      unidadeSecundaria: ind.unidadeSecundaria ?? "PERCENT",
    });
    setEditError(null);
  }

  async function saveEdit() {
    if (!editTarget || savingEdit) return;
    setEditError(null);
    if (!editForm.nome.trim()) {
      setEditError("Informe um nome para o indicador.");
      return;
    }
    if (editForm.hasSecondary && !editForm.nomeSecundario.trim()) {
      setEditError("Informe o nome do segundo valor (ou desmarque a opção de segundo valor).");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`${apiBase}/indicadores/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editForm.nome,
          unidade: editForm.unidade,
          icon: editForm.icon,
          valorPadrao: editForm.valorPadrao,
          ...buildSecondaryPayload(editForm),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError(data?.error ?? "Não foi possível salvar as alterações do indicador.");
        return;
      }
      setEditTarget(null);
      // Busca os indicadores do período de novo em vez de tentar atualizar o
      // estado local a partir da resposta do PATCH (que não diz se o período
      // atual já tinha ou não um valorReferencia próprio salvo) — ver o
      // comentário de `useFechamentoDoMes` acima.
      await refreshIndicators(periodo);
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDeleteIndicator() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const deletedId = deleteTarget.id;
      await fetch(`${apiBase}/indicadores/${deletedId}`, { method: "DELETE" });
      setCustomIndicators((prev) => prev.filter((ind) => ind.id !== deletedId));
      setCustomForm((prev) => {
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      setCustomFormSecundario((prev) => {
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return {
    customIndicators,
    customForm,
    customFormSecundario,
    beginFetch,
    sync,
    updateValorReferencia,
    updateValorSecundario,
    buildIndicatorsPayload,
    newOpen,
    setNewOpen,
    newForm,
    setNewForm,
    creating,
    newError,
    createIndicator,
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
    confirmDeleteIndicator,
  };
}

export type FechamentoDoMesState = ReturnType<typeof useFechamentoDoMes>;

/** Resumo direto na tela (fora do modal) — a lista sempre visível, com um
 * link "Editar" que abre o modal de criar/editar/excluir da própria tela. */
export function FechamentoDoMesSection({
  indicators,
  onEditClick,
}: {
  indicators: FechamentoIndicator[];
  onEditClick: () => void;
}) {
  return (
    <Section
      title="Fechamento do mês"
      action={
        <button onClick={onEditClick} className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline">
          <Pencil size={12} /> Editar
        </button>
      }
    >
      {indicators.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {indicators.map((ind, index) => {
            const color = indicatorAccentColor(index);
            return (
              <div key={ind.id} className="flex items-center gap-2.5 rounded-lg border border-nord-border/60 px-3 py-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}22` }}
                >
                  <DynamicIcon name={ind.icon} size={15} style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    <span className="text-nord-gray">{ind.nome}:</span>{" "}
                    <span className="text-white font-semibold">{formatIndicatorValue(ind.unidade, ind.valorReferencia)}</span>
                  </p>
                  {/* Segundo valor (indicador "composto", ex.: Cancelamentos = % + quantidade) —
                      só aparece quando o indicador tem unidadeSecundaria configurada. */}
                  {ind.unidadeSecundaria && (
                    <p className="text-xs text-nord-gray truncate">
                      {ind.nomeSecundario}:{" "}
                      <span className="text-white font-medium">
                        {formatIndicatorValue(ind.unidadeSecundaria, ind.valorSecundario ?? 0)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-nord-gray">
          Nenhum indicador cadastrado ainda. Clique em Editar para adicionar o primeiro (ex.: CMV, Ticket Médio, Turnover...).
        </p>
      )}
    </Section>
  );
}

/**
 * Lista de criar/editar/excluir indicadores, pensada para ser renderizada
 * dentro do modal de "Fechamento do mês" de cada reunião — a própria tela
 * decide o restante do conteúdo do modal (ex.: campos de "Resultado do
 * período" específicos daquela reunião) e o rodapé de salvar/excluir.
 */
export function FechamentoDoMesEditor({ fdm }: { fdm: FechamentoDoMesState }) {
  return (
    <div>
      <p className="text-xs text-nord-gray mb-2 font-medium">Fechamento do mês</p>
      {fdm.customIndicators.length > 0 ? (
        <div className="space-y-3">
          {fdm.customIndicators.map((ind, index) => {
            const color = indicatorAccentColor(index);
            return (
              <div key={ind.id} className="rounded-lg border border-nord-border/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}22` }}
                    >
                      <DynamicIcon name={ind.icon} size={14} style={{ color }} />
                    </div>
                    <span className="text-sm text-white font-medium truncate">{ind.nome}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => fdm.openEdit(ind)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      onClick={() => fdm.setDeleteTarget(ind)}
                      className="text-nord-gray hover:text-nord-danger flex items-center gap-1 text-xs"
                    >
                      <Trash2 size={12} /> Excluir indicador
                    </button>
                  </div>
                </div>
                <div className={ind.unidadeSecundaria ? "grid grid-cols-2 gap-3" : ""}>
                  <label className="block">
                    <span className="block text-xs text-nord-gray mb-1">Valor {unidadeSuffix(ind.unidade)}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={fdm.customForm[ind.id] ?? String(ind.valorReferencia)}
                      onChange={(e) => fdm.updateValorReferencia(ind.id, e.target.value)}
                      className="input"
                    />
                  </label>
                  {/* Segundo valor (indicador "composto") — só aparece quando o indicador tem
                      unidadeSecundaria configurada; indicador simples segue com 1 campo só. */}
                  {ind.unidadeSecundaria && (
                    <label className="block">
                      <span className="block text-xs text-nord-gray mb-1">
                        {ind.nomeSecundario} {unidadeSuffix(ind.unidadeSecundaria)}
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        value={fdm.customFormSecundario[ind.id] ?? String(ind.valorSecundario ?? "")}
                        onChange={(e) => fdm.updateValorSecundario(ind.id, e.target.value)}
                        className="input"
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-nord-gray">Nenhum indicador cadastrado ainda.</p>
      )}

      <button
        onClick={() => fdm.setNewOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline"
      >
        <Plus size={13} /> Novo indicador
      </button>

      <Modal open={fdm.newOpen} onClose={() => fdm.setNewOpen(false)} title="Novo indicador">
        <FormError message={fdm.newError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={fdm.newForm.nome}
              onChange={(e) => fdm.setNewForm({ ...fdm.newForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={fdm.newForm.icon} onChange={(icon) => fdm.setNewForm({ ...fdm.newForm, icon })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={fdm.newForm.unidade}
                onChange={(e) => fdm.setNewForm({ ...fdm.newForm, unidade: e.target.value as FechamentoIndicator["unidade"] })}
                className="input"
              >
                {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor padrão</span>
              <input
                type="number"
                step="0.1"
                value={fdm.newForm.valorPadrao}
                onChange={(e) => fdm.setNewForm({ ...fdm.newForm, valorPadrao: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={fdm.newForm.hasSecondary}
              onChange={(e) => fdm.setNewForm({ ...fdm.newForm, hasSecondary: e.target.checked })}
            />
            Este indicador tem um segundo valor
          </label>
          {/* Ex.: "Cancelamentos" registra um percentual (campos acima) + uma quantidade de
              atrasos/cancelamentos (campos abaixo) — os dois valores por período. */}
          {fdm.newForm.hasSecondary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do segundo valor</span>
                <input
                  type="text"
                  value={fdm.newForm.nomeSecundario}
                  onChange={(e) => fdm.setNewForm({ ...fdm.newForm, nomeSecundario: e.target.value })}
                  placeholder="Ex.: Quantidade de atrasos"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do segundo valor</span>
                <select
                  value={fdm.newForm.unidadeSecundaria}
                  onChange={(e) => fdm.setNewForm({ ...fdm.newForm, unidadeSecundaria: e.target.value as FechamentoIndicator["unidade"] })}
                  className="input"
                >
                  {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            onClick={fdm.createIndicator}
            disabled={fdm.creating}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {fdm.creating ? "Criando..." : "Criar indicador"}
          </button>
        </div>
      </Modal>

      <Modal open={fdm.editTarget !== null} onClose={() => fdm.setEditTarget(null)} title="Editar indicador">
        <FormError message={fdm.editError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={fdm.editForm.nome}
              onChange={(e) => fdm.setEditForm({ ...fdm.editForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={fdm.editForm.icon} onChange={(icon) => fdm.setEditForm({ ...fdm.editForm, icon })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={fdm.editForm.unidade}
                onChange={(e) => fdm.setEditForm({ ...fdm.editForm, unidade: e.target.value as FechamentoIndicator["unidade"] })}
                className="input"
              >
                {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor padrão</span>
              <input
                type="number"
                step="0.1"
                value={fdm.editForm.valorPadrao}
                onChange={(e) => fdm.setEditForm({ ...fdm.editForm, valorPadrao: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={fdm.editForm.hasSecondary}
              onChange={(e) => fdm.setEditForm({ ...fdm.editForm, hasSecondary: e.target.checked })}
            />
            Este indicador tem um segundo valor
          </label>
          {/* Desmarcar remove o 2º valor deste indicador (volta a ser simples) — o histórico
              de valores já salvos em meses anteriores permanece no banco, só deixa de
              aparecer/ser editável enquanto a opção estiver desmarcada. */}
          {fdm.editForm.hasSecondary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do segundo valor</span>
                <input
                  type="text"
                  value={fdm.editForm.nomeSecundario}
                  onChange={(e) => fdm.setEditForm({ ...fdm.editForm, nomeSecundario: e.target.value })}
                  placeholder="Ex.: Quantidade de atrasos"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do segundo valor</span>
                <select
                  value={fdm.editForm.unidadeSecundaria}
                  onChange={(e) => fdm.setEditForm({ ...fdm.editForm, unidadeSecundaria: e.target.value as FechamentoIndicator["unidade"] })}
                  className="input"
                >
                  {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            onClick={fdm.saveEdit}
            disabled={fdm.savingEdit}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {fdm.savingEdit ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={fdm.deleteTarget !== null}
        title="Excluir indicador"
        message={`Tem certeza que quer excluir o indicador "${fdm.deleteTarget?.nome}"? Isso remove esse indicador e o histórico de valores dele em todos os meses — o restante da reunião não é afetado.`}
        confirmLabel={fdm.deleting ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={fdm.confirmDeleteIndicator}
        onCancel={() => fdm.setDeleteTarget(null)}
      />
    </div>
  );
}
