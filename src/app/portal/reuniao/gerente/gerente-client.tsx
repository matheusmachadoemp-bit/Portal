"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, FileDown, Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import {
  indicatorAccentColor,
  fetchFechamentoDoMesIndicatorsForPdf,
  buildCustomIndicatorPdfEntries,
} from "@/components/reuniao/fechamento-do-mes";
import { useMetasProximoMes, MetasProximoMesSection, fetchMetasProximoMesForPdf } from "@/components/reuniao/metas-proximo-mes";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { nextPeriodo, periodoLabel, resolveComparePeriodos } from "@/lib/reuniao";
import type { GerenteCustomIndicatorDTO } from "@/lib/reuniao-server";

type Meeting = {
  id: string;
  periodo: string;
  faturamentoTotalValor: number | null;
  cmvPercent: number | null;
  npsPercent: number | null;
  cancelamentoDeliveryPercent: number | null;
  // `turnoverPercent`/`faltasAtrasosAtestados`/`checklistOperacionalPercent` seguem existindo na
  // coluna do banco — o modal "Fechamento do mês" deixou de ter campo pra editá-los (seção
  // "Resultado do período" removida), mas o tipo continua com os 3 porque `buildForm` precisa
  // deles pra fazer round-trip no `submit()` (ver comentário lá: sem isso, salvar qualquer outra
  // coisa no modal apagaria retroativamente valores já lançados em meses anteriores, já que a
  // rota `POST /api/reuniao/gerente` trata campo ausente no body como "grava null").
  turnoverPercent: number | null;
  faltasAtrasosAtestados: number | null;
  checklistOperacionalPercent: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

function buildForm(m?: Meeting | null) {
  // Turnover (%), Faltas/Atrasos/Atestados e Checklist Operacional (%) não têm mais input no
  // modal (seção "Resultado do período" removida), mas continuam aqui "congelados" com o valor
  // já salvo — mesmo padrão usado pro campo `valor` dos indicadores customizados (ver
  // `buildCustomForm`/`CustomForm` abaixo). É só pra fazer round-trip no payload do `submit()`:
  // como a rota POST grava `null` em qualquer campo que não vier no body, se essas 3 chaves
  // simplesmente não existissem no form, qualquer "Salvar" (ex.: só criando um indicador
  // customizado, sem tocar nesses 3) apagaria retroativamente um valor já lançado em um mês
  // anterior. Congelado = nunca mudam pela UI, mas sempre voltam pro servidor do jeito que já
  // estavam.
  return {
    turnoverPercent: m?.turnoverPercent != null ? String(m.turnoverPercent) : "",
    faltasAtrasosAtestados: m?.faltasAtrasosAtestados != null ? String(m.faltasAtrasosAtestados) : "",
    checklistOperacionalPercent: m?.checklistOperacionalPercent != null ? String(m.checklistOperacionalPercent) : "",
    notas: m?.notas ?? "",
  };
}

// `valor` era escrito por um input duplicado na antiga seção "Resultado do período" (removida
// a pedido do usuário) e nunca é lido/exibido em nenhum outro lugar do app — quem alimenta a
// tela é sempre `valorReferencia`, usado no card "Fechamento do mês" (dentro e fora do modal).
// Mantido aqui só porque divide a mesma estrutura de estado que `valorReferencia`; sem input
// escrevendo nele, fica congelado no valor carregado da API (comportamento aceito pelo usuário).
// `valorSecundario`/`valorTerciario`: 2º/3º valor de um indicador "composto" (ex.:
// Cancelamentos = % + quantidade) — só têm input de verdade quando o indicador tem
// `unidadeSecundaria`/`unidadeTerciaria` configurada (o 3º só existe junto do 2º — ver
// comentário de `nomeTerciario` em schema.prisma); para os demais ficam sempre "" e nunca
// são enviados de fato (ver upsertReuniaoCustomIndicatorValues em src/lib/reuniao-server.ts,
// que ignora esses campos quando o indicador não é composto).
type CustomForm = Record<string, { valor: string; valorReferencia: string; valorSecundario: string; valorTerciario: string }>;

/** Converte um indicador (como vem da API) para a forma de texto usada no formulário —
 * usado tanto por `buildCustomForm` (carga inicial/troca de período) quanto por `refresh`
 * (que precisa comparar o valor "conhecido do servidor" antigo com o novo, campo a campo,
 * pra decidir se preserva um rascunho digitado — ver comentário em `refresh` abaixo). */
function indicatorFormEntry(ind: GerenteCustomIndicatorDTO) {
  return {
    valor: ind.valor != null ? String(ind.valor) : "",
    valorReferencia: String(ind.valorReferencia),
    valorSecundario: ind.valorSecundario != null ? String(ind.valorSecundario) : "",
    valorTerciario: ind.valorTerciario != null ? String(ind.valorTerciario) : "",
  };
}

function buildCustomForm(indicators: GerenteCustomIndicatorDTO[]): CustomForm {
  return Object.fromEntries(indicators.map((ind) => [ind.id, indicatorFormEntry(ind)]));
}

const UNIDADE_LABEL: Record<GerenteCustomIndicatorDTO["unidade"], string> = {
  PERCENT: "Percentual (%)",
  CURRENCY: "Reais (R$)",
  NUMBER: "Número",
};

function formatCustomValue(unidade: GerenteCustomIndicatorDTO["unidade"], value: number) {
  if (unidade === "CURRENCY") return formatCurrency(value);
  if (unidade === "PERCENT") return `${formatNumber(value, 1)}%`;
  return formatNumber(value, value % 1 === 0 ? 0 : 1);
}

/** "(%)"/"(R$)"/"" — sufixo mostrado ao lado do rótulo "Valor" nos formulários,
 * conforme a unidade escolhida. */
function unidadeSuffix(unidade: GerenteCustomIndicatorDTO["unidade"]) {
  return unidade === "PERCENT" ? "(%)" : unidade === "CURRENCY" ? "(R$)" : "";
}

/** Estado do formulário de criar/editar indicador — `hasSecondary` marca se este
 * indicador tem um 2º valor por período (ex.: Cancelamentos = % + quantidade);
 * `nomeSecundario`/`unidadeSecundaria` só importam quando `hasSecondary` está
 * marcado (ver `buildSecondaryPayload` abaixo). `hasTertiary`/`nomeTerciario`/
 * `unidadeTerciaria`: mesma ideia pro 3º valor, mas só faz sentido quando
 * `hasSecondary` também está marcado (ver comentário de `nomeTerciario` em
 * schema.prisma) — a tela só mostra/habilita o checkbox do 3º valor quando o do
 * 2º já está marcado, e desmarcar o do 2º também desmarca o do 3º. */
type IndicatorFormState = {
  nome: string;
  unidade: GerenteCustomIndicatorDTO["unidade"];
  icon: string;
  valorPadrao: string;
  hasSecondary: boolean;
  nomeSecundario: string;
  unidadeSecundaria: GerenteCustomIndicatorDTO["unidade"];
  hasTertiary: boolean;
  nomeTerciario: string;
  unidadeTerciaria: GerenteCustomIndicatorDTO["unidade"];
};

function emptyIndicatorForm(): IndicatorFormState {
  return {
    nome: "",
    unidade: "PERCENT",
    icon: "Target",
    valorPadrao: "",
    hasSecondary: false,
    nomeSecundario: "",
    unidadeSecundaria: "PERCENT",
    hasTertiary: false,
    nomeTerciario: "",
    unidadeTerciaria: "PERCENT",
  };
}

/** Monta os campos `nomeSecundario`/`unidadeSecundaria` do body de criar/editar a
 * partir do formulário — sempre os 2 juntos (ver `parseSecondaryIndicatorFields`
 * em src/lib/reuniao-server.ts): preenchidos quando `hasSecondary` está marcado, ou
 * "" nos 2 quando não está (indicador simples, ou removendo um 2º valor existente). */
function buildSecondaryPayload(form: IndicatorFormState) {
  return {
    nomeSecundario: form.hasSecondary ? form.nomeSecundario : "",
    unidadeSecundaria: form.hasSecondary ? form.unidadeSecundaria : "",
  };
}

/** Mesma ideia de `buildSecondaryPayload`, agora pro 3º valor — ver
 * `parseTertiaryIndicatorFields` em src/lib/reuniao-server.ts. */
function buildTertiaryPayload(form: IndicatorFormState) {
  return {
    nomeTerciario: form.hasTertiary ? form.nomeTerciario : "",
    unidadeTerciaria: form.hasTertiary ? form.unidadeTerciaria : "",
  };
}

/**
 * Rastreia, por período, se uma mutação (salvar o fechamento do mês, excluir a reunião) está
 * em andamento NESTE MOMENTO — em vez de um único `useState<boolean>` compartilhado por todos
 * os períodos, que trataria "existe uma mutação em andamento, de QUALQUER período" como se
 * fosse sempre a do período que está na tela agora. Isso fazia o botão de salvar/excluir
 * aparecer "Salvando.../Excluindo..." (e desabilitado) num período Q sem nada pendente, só
 * porque uma mutação do período P (ex.: o usuário salvou P e trocou rápido pra Q antes do POST
 * responder) ainda não tinha terminado em segundo plano (#474).
 *
 * `isPending(periodo)` é o que a UI usa pra decidir texto/estado do botão — sempre comparando
 * contra o período realmente exibido (`selectedPeriodo`/`current.periodo`), nunca "existe algo
 * rodando em algum período". `start`/`finish` marcam um período específico como pendente/livre;
 * um `Set` (não uma única `string | null`) porque mais de um período pode estar com uma mutação
 * em voo ao mesmo tempo (ex.: salva P, troca pra Q antes da resposta, e também salva Q) — uma
 * única string seria sobrescrita pelo período mais recente e "esqueceria" o anterior ainda em
 * andamento, arriscando inclusive um segundo POST concorrente pro MESMO período se o usuário
 * voltasse nele e clicasse salvar de novo antes do primeiro terminar.
 *
 * Só serve pra `saving`/`deleting` (ações de um período específico: o fechamento do mês de
 * `selectedPeriodo`, a reunião de `current.periodo`) — `creatingIndicator`/
 * `savingEditIndicator`/`deletingIndicator` ficam de fora de propósito: criar/editar/excluir um
 * indicador é uma ação sobre a DEFINIÇÃO do indicador (nome/unidade/ícone/valor padrão), que
 * vale pra todos os períodos igualmente (ver rotas em src/app/api/reuniao/gerente/indicadores/)
 * — não existe um "período certo" pra comparar, então não há o mesmo risco de UI presa num
 * período errado.
 */
function usePeriodoMutating(): [(periodo: string) => boolean, (periodo: string) => void, (periodo: string) => void] {
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const isPending = (periodo: string) => pending.has(periodo);
  const start = (periodo: string) => setPending((prev) => (prev.has(periodo) ? prev : new Set(prev).add(periodo)));
  const finish = (periodo: string) =>
    setPending((prev) => {
      if (!prev.has(periodo)) return prev;
      const next = new Set(prev);
      next.delete(periodo);
      return next;
    });
  return [isPending, start, finish];
}

export function GerenteClient({
  initialMeetings,
  initialCurrent,
  initialCustomIndicators,
  periodo,
  canCreate,
  isGrupoNordMode,
  canDeleteMetas,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialCustomIndicators: GerenteCustomIndicatorDTO[];
  periodo: string;
  canCreate: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode: boolean;
  /** Perfil "gerente" tem canCreate/canEdit mas não canDelete no módulo "reuniao" — controla
   * só o botão de excluir meta (criar/editar segue o mesmo `canCreate` do resto da tela). */
  canDeleteMetas: boolean;
  empresaName: string;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [form, setForm] = useState(buildForm(initialCurrent));
  const [isSaving, startSaving, finishSaving] = usePeriodoMutating();
  const [loading, setLoading] = useState(false);
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [isDeleting, startDeleting, finishDeleting] = usePeriodoMutating();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  // `saving`/`deleting` só devem refletir uma mutação do período que está REALMENTE em tela
  // agora (#474), não "existe uma mutação em andamento, de QUALQUER período" — ver comentário
  // de `usePeriodoMutating` acima. O save do fechamento do mês (`submit`) é sempre do período
  // `selectedPeriodo`; o delete da reunião (`doDelete`) é sempre do período de `current`.
  const saving = isSaving(selectedPeriodo);
  const deleting = current ? isDeleting(current.periodo) : false;

  const [customIndicators, setCustomIndicators] = useState(initialCustomIndicators);
  const [customForm, setCustomForm] = useState(buildCustomForm(initialCustomIndicators));
  const [newIndicatorOpen, setNewIndicatorOpen] = useState(false);
  const [newIndicatorForm, setNewIndicatorForm] = useState<IndicatorFormState>(emptyIndicatorForm());
  const [creatingIndicator, setCreatingIndicator] = useState(false);
  const [newIndicatorError, setNewIndicatorError] = useState<string | null>(null);
  const [deleteIndicatorTarget, setDeleteIndicatorTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
  const [deletingIndicator, setDeletingIndicator] = useState(false);
  const [editIndicatorTarget, setEditIndicatorTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
  const [editIndicatorForm, setEditIndicatorForm] = useState<IndicatorFormState>(emptyIndicatorForm());
  const [savingEditIndicator, setSavingEditIndicator] = useState(false);
  const [editIndicatorError, setEditIndicatorError] = useState<string | null>(null);

  const mp = useMetasProximoMes("/api/reuniao/gerente", canCreate, nextPeriodo(selectedPeriodo));

  const mounted = useRef(false);

  /**
   * Existem dois caminhos independentes que buscam dados do servidor e escrevem no mesmo
   * estado (`current`/`customIndicators`/`customForm` etc.): o `useEffect` abaixo
   * (dispara quando `selectedPeriodo` muda) e `refresh()` (chamado depois de criar/editar/
   * excluir um indicador, ou depois de salvar o fechamento do mês em `submit()`). Sem
   * coordenação entre os dois, a resposta atrasada de um caminho pode sobrescrever a tela com
   * dado de um período que não é mais o selecionado: ex. o usuário edita um indicador no
   * período P e salva (dispara `refresh(P)`, que demora pra responder), troca pro período Q
   * antes dela voltar — a troca já atualiza a tela certinho pra Q (via o efeito abaixo), mas
   * quando a resposta atrasada de `refresh(P)` finalmente chega, ela sobrescreveria a tela (já
   * em Q) com o dado de P sem nenhum aviso — o seletor de período continuaria mostrando Q, mas
   * os valores na tela seriam de P, podendo até ser salvos como se fossem de Q se o usuário
   * confirmar o fechamento nesse meio-tempo (achado do Teulis na revisão da #472).
   *
   * 1ª correção (#473): um token de geração compartilhado (`fetchGenerationRef`/`beginFetch()`)
   * pelos dois caminhos — toda busca que ia escrever nesse estado pegava um token ANTES de
   * disparar o próprio fetch, e só aplicava o resultado se esse token ainda fosse O MAIS
   * RECENTE quando a resposta chegasse (ou seja: "alguma coisa mais nova começou desde então,
   * em QUALQUER período"). Resolvia o cenário acima, mas o critério "mais recente" era GLOBAL,
   * não por período — o que criou um bug novo (achado do Teulis numa 3ª rodada de revisão,
   * #477): criar um indicador A (resposta lenta) e, antes dela voltar, já editar um indicador B
   * (resposta rápida) no MESMO período P fazia o token de A "perder" pro token de B mesmo os
   * dois sendo do período que CONTINUA selecionado — nenhum dos dois é mais stale que o outro
   * em relação a P, mas o token de A, sendo numericamente menor, era descartado mesmo chegando
   * depois. Resultado: o indicador A criado "sumia" da tela (continuava existindo no banco) até
   * trocar de período ou recarregar.
   *
   * Critério atual (#477): em vez de "meu token ainda é o mais recente", `refresh()` pergunta
   * "meu `targetPeriodo` ainda é o período selecionado agora" — comparando contra
   * `selectedPeriodoRef` (ref abaixo, sempre atualizado; diferente de ler `selectedPeriodo`
   * direto de dentro de uma closure antiga, que refletiria o período de QUANDO aquela chamada
   * específica começou, não o de agora). Isso cobre o cenário original da #472/#473 (trocar de
   * período ainda descarta a resposta de um período abandonado) sem reabrir a #477 (duas
   * mutações independentes no MESMO período não competem mais entre si — cada uma aplica o
   * próprio resultado, não importa a ordem de chegada, desde que o período ainda seja o
   * selecionado quando a resposta chegar).
   *
   * Isso deixa de proteger, conscientemente, um caso bem mais raro e específico (pra não virar
   * um buraco sem fundo de sutileza de ordenação de rede): a própria busca deste `useEffect` ao
   * ENTRAR num período Q sendo tão lenta que só resolve DEPOIS do `refresh()` de uma mutação
   * feita nesse MESMO Q (ex.: o usuário já salva algo em Q antes da carga inicial de Q
   * terminar) — nesse caso a carga inicial, mesmo tendo começado antes, poderia sobrescrever o
   * resultado mais novo da mutação com um dado um pouco mais antigo de Q. Diferente da
   * #472/#473 (o usuário SAI de Q) e da #477 (duas mutações, nenhuma "causa" a outra), aqui as
   * duas buscas não têm nada que garanta que uma reflita pelo menos o efeito da outra. Não
   * reproduzido nem reportado até hoje (exigiria mutar o período muito rápido logo depois de
   * entrar nele, mais a rede entregar as respostas fora de ordem) — se um dia isso virar um
   * problema real, a correção é uma "geração" própria POR PERÍODO (não um contador global
   * compartilhado entre períodos diferentes, que é exatamente o que causava a #477).
   */
  const selectedPeriodoRef = useRef(selectedPeriodo);
  useEffect(() => {
    selectedPeriodoRef.current = selectedPeriodo;
  }, [selectedPeriodo]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reuniao/gerente?periodo=${selectedPeriodo}`)
      .then((res) => res.json())
      .then((data) => {
        // `cancelled`: esta própria instância do efeito foi desmontada/re-executada (ex.:
        // `selectedPeriodo` mudou de novo) antes da resposta chegar — descarta em silêncio.
        // Não compara mais contra nenhum token compartilhado com `refresh()` (ver comentário de
        // `selectedPeriodoRef` acima sobre por que os dois caminhos não precisam mais disso pra
        // não se atropelarem).
        if (cancelled) return;
        setCurrent(data.current);
        setForm(buildForm(data.current));
        setCustomIndicators(data.customIndicators ?? []);
        setCustomForm(buildCustomForm(data.customIndicators ?? []));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedPeriodo]);

  function customIndicatorState(ind: GerenteCustomIndicatorDTO) {
    const entry = customForm[ind.id] ?? { valor: "", valorReferencia: String(ind.valorPadrao), valorSecundario: "", valorTerciario: "" };
    const valor = entry.valor !== "" ? Number(entry.valor) : null;
    const valorReferencia = Number(entry.valorReferencia) || 0;
    const valorSecundario = entry.valorSecundario !== "" ? Number(entry.valorSecundario) : null;
    const valorTerciario = entry.valorTerciario !== "" ? Number(entry.valorTerciario) : null;
    return { entry, valor, valorReferencia, valorSecundario, valorTerciario };
  }

  function updateCustomForm(id: string, patch: Partial<CustomForm[string]>) {
    setCustomForm((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    // Busca as metas do próximo mês na hora de exportar (não reaproveita o estado `mp.metas`
    // já carregado na tela) pra garantir que o PDF sai com o que está salvo agora — inclusive
    // em modo Grupo Nord, onde a API já devolve lista vazia e o PDF mostra a mensagem de
    // "nenhuma meta cadastrada" em vez de pular a página.
    const metasData = await fetchMetasProximoMesForPdf("/api/reuniao/gerente", nextPeriodo(selectedPeriodo));

    // Busca os indicadores customizados ("Fechamento do mês") de cada período comparado,
    // fresquinhos do servidor (mesmo motivo de fetchMetasProximoMesForPdf acima) — a rota
    // GET só devolve os indicadores de UM período por chamada, então busca um por período
    // comparado, em paralelo (até 3 chamadas). Ver buildCustomIndicatorPdfEntries.
    const customIndicatorsByPeriodo = await Promise.all(
      periodosComparados.map((p) => fetchFechamentoDoMesIndicatorsForPdf("/api/reuniao/gerente", p))
    );

    // Faturamento Total, CMV, Turnover e Checklist Operacional eram 4 indicadores fixos aqui,
    // calculados/congelados à parte (ver histórico desta mesma tarefa) — removidos do PDF a
    // pedido do Matheus porque duplicavam, com fonte e valor DIFERENTES, os indicadores de
    // mesmo nome que já vêm de `buildCustomIndicatorPdfEntries` (o "Fechamento do mês" que o
    // usuário realmente edita hoje). Os 2 primeiros eram recalculados ao vivo a cada save
    // (podendo legitimamente estar zerados por falta de Fechamento do Dia, não por falta de
    // cadastro) e os 2 últimos estavam congelados desde que a seção "Resultado do período" foi
    // removida da tela (sem nenhum input que ainda os alimentasse) — nos dois casos, a fonte de
    // verdade pro usuário é só o indicador dinâmico abaixo.
    exportMeetingReportPdf({
      fileSlug: "reuniao-gerente",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal: 0,
      observacoes: form.notas,
      indicators: [
        // Indicadores customizados cadastrados pelo usuário em "Fechamento do mês" (ex.:
        // Ticket Médio Salão/Delivery, ou qualquer outro criado em "Novo indicador") — sem
        // isso, qualquer indicador customizado desaparecia do PDF mesmo aparecendo
        // normalmente na tela (card #467).
        ...buildCustomIndicatorPdfEntries(periodosComparados, customIndicatorsByPeriodo),
      ],
      metasProximoMes: {
        periodoLabel: metasData.periodoLabel,
        metas: metasData.metas.map((m) => ({
          metrica: m.metrica,
          valorAlvo: m.valorAlvo,
          valorPremio: m.valorPremio,
          destinatario: m.destinatario,
        })),
      },
    });
  }

  // `targetPeriodo` vem do CHAMADOR (ver o comentário de `selectedPeriodoRef` acima) — o
  // período que o usuário realmente tinha em mente quando disparou a mutação, capturado antes
  // do POST/PATCH/DELETE que antecede este `refresh`, não lido de novo depois (se o usuário já
  // tiver trocado de período nesse meio-tempo, pegar `selectedPeriodo` de novo aqui apontaria
  // pro período NOVO, não pro que essa mutação pertence).
  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/gerente?periodo=${targetPeriodo}`);
    const data = await res.json();
    // Se o usuário já trocou de período desde que esta busca começou, descarta a resposta POR
    // COMPLETO — sem aplicar nem o preserva-rascunho abaixo, nem o overwrite de
    // `meetings`/`current` — pra não sobrescrever a tela com dado de um período que
    // não é mais o selecionado (ver comentário de `selectedPeriodoRef` acima). Duas mutações
    // independentes do MESMO período (`targetPeriodo === selectedPeriodoRef.current` pras
    // duas) passam por aqui sem se atropelar — cada uma aplica o próprio resultado.
    if (targetPeriodo !== selectedPeriodoRef.current) return;
    setMeetings(data.meetings);
    setCurrent(data.current);
    const nextIndicators: GerenteCustomIndicatorDTO[] = data.customIndicators ?? [];
    // Criar/editar/excluir UM indicador no modal "Fechamento do mês" chama este refresh pra
    // recarregar a lista inteira do servidor — sem cuidado, isso sobrescreve `customForm` por
    // completo e apaga o valor que o usuário tiver digitado em QUALQUER OUTRO indicador e
    // ainda não salvo (o servidor devolve o valor antigo, porque esse rascunho nunca foi
    // enviado por um POST). Mesma lógica/`draftTouched` do `sync()` compartilhado em
    // src/components/reuniao/fechamento-do-mes.tsx (usado pelas outras 4 reuniões): compara,
    // campo a campo, o rascunho atual com o último valor "conhecido do servidor" (o
    // `customIndicators` de antes desta chamada, capturado por closure) — só assume o valor
    // novo quando o campo não foi tocado localmente. `valor` nunca tem input no formulário
    // (ver comentário de `buildCustomForm`/`CustomForm` acima), então sempre acompanha o
    // servidor sem necessidade de comparação.
    setCustomForm((prevForm) => {
      const next: CustomForm = {};
      for (const ind of nextIndicators) {
        const prevInd = customIndicators.find((p) => p.id === ind.id);
        const prevEntry = prevForm[ind.id];
        const freshEntry = indicatorFormEntry(ind);
        if (!prevInd || !prevEntry) {
          next[ind.id] = freshEntry;
          continue;
        }
        const lastKnown = indicatorFormEntry(prevInd);
        next[ind.id] = {
          valor: freshEntry.valor,
          valorReferencia: prevEntry.valorReferencia !== lastKnown.valorReferencia ? prevEntry.valorReferencia : freshEntry.valorReferencia,
          valorSecundario:
            prevEntry.valorSecundario !== lastKnown.valorSecundario ? prevEntry.valorSecundario : freshEntry.valorSecundario,
          valorTerciario:
            prevEntry.valorTerciario !== lastKnown.valorTerciario ? prevEntry.valorTerciario : freshEntry.valorTerciario,
        };
      }
      return next;
    });
    setCustomIndicators(nextIndicators);
  }

  async function submit() {
    // Guarda contra duplo-envio do MESMO período (`saving` já é `isSaving(selectedPeriodo)` —
    // ver comentário de `usePeriodoMutating`); um save de outro período em andamento não
    // bloqueia este.
    if (saving) return;
    startSaving(selectedPeriodo);
    try {
      await fetch("/api/reuniao/gerente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formToPayload(selectedPeriodo, form),
          customIndicators: customIndicators.map((ind) => ({ id: ind.id, ...customForm[ind.id] })),
        }),
      });
      await refresh(selectedPeriodo);
    } finally {
      finishSaving(selectedPeriodo);
    }
  }

  async function createIndicator() {
    if (creatingIndicator) return;
    setNewIndicatorError(null);
    if (!newIndicatorForm.nome.trim()) {
      setNewIndicatorError("Informe um nome para o indicador.");
      return;
    }
    if (newIndicatorForm.hasSecondary && !newIndicatorForm.nomeSecundario.trim()) {
      setNewIndicatorError("Informe o nome do segundo valor (ou desmarque a opção de segundo valor).");
      return;
    }
    if (newIndicatorForm.hasTertiary && !newIndicatorForm.nomeTerciario.trim()) {
      setNewIndicatorError("Informe o nome do terceiro valor (ou desmarque a opção de terceiro valor).");
      return;
    }
    setCreatingIndicator(true);
    try {
      const res = await fetch("/api/reuniao/gerente/indicadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newIndicatorForm.nome,
          unidade: newIndicatorForm.unidade,
          icon: newIndicatorForm.icon,
          valorPadrao: newIndicatorForm.valorPadrao,
          ...buildSecondaryPayload(newIndicatorForm),
          ...buildTertiaryPayload(newIndicatorForm),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNewIndicatorError(data?.error ?? "Não foi possível criar o indicador.");
        return;
      }
      setNewIndicatorOpen(false);
      setNewIndicatorForm(emptyIndicatorForm());
      await refresh(selectedPeriodo);
    } finally {
      setCreatingIndicator(false);
    }
  }

  function openEditIndicator(ind: GerenteCustomIndicatorDTO) {
    setEditIndicatorTarget(ind);
    setEditIndicatorForm({
      nome: ind.nome,
      unidade: ind.unidade,
      icon: ind.icon,
      valorPadrao: String(ind.valorPadrao),
      hasSecondary: !!ind.unidadeSecundaria,
      nomeSecundario: ind.nomeSecundario ?? "",
      unidadeSecundaria: ind.unidadeSecundaria ?? "PERCENT",
      hasTertiary: !!ind.unidadeTerciaria,
      nomeTerciario: ind.nomeTerciario ?? "",
      unidadeTerciaria: ind.unidadeTerciaria ?? "PERCENT",
    });
    setEditIndicatorError(null);
  }

  async function saveEditIndicator() {
    if (!editIndicatorTarget || savingEditIndicator) return;
    setEditIndicatorError(null);
    if (!editIndicatorForm.nome.trim()) {
      setEditIndicatorError("Informe um nome para o indicador.");
      return;
    }
    if (editIndicatorForm.hasSecondary && !editIndicatorForm.nomeSecundario.trim()) {
      setEditIndicatorError("Informe o nome do segundo valor (ou desmarque a opção de segundo valor).");
      return;
    }
    if (editIndicatorForm.hasTertiary && !editIndicatorForm.nomeTerciario.trim()) {
      setEditIndicatorError("Informe o nome do terceiro valor (ou desmarque a opção de terceiro valor).");
      return;
    }
    setSavingEditIndicator(true);
    try {
      const res = await fetch(`/api/reuniao/gerente/indicadores/${editIndicatorTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editIndicatorForm.nome,
          unidade: editIndicatorForm.unidade,
          icon: editIndicatorForm.icon,
          valorPadrao: editIndicatorForm.valorPadrao,
          ...buildSecondaryPayload(editIndicatorForm),
          ...buildTertiaryPayload(editIndicatorForm),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setEditIndicatorError(data?.error ?? "Não foi possível salvar as alterações do indicador.");
        return;
      }
      setEditIndicatorTarget(null);
      await refresh(selectedPeriodo);
    } finally {
      setSavingEditIndicator(false);
    }
  }

  async function confirmDeleteIndicator() {
    if (!deleteIndicatorTarget || deletingIndicator) return;
    setDeletingIndicator(true);
    try {
      await fetch(`/api/reuniao/gerente/indicadores/${deleteIndicatorTarget.id}`, { method: "DELETE" });
      setDeleteIndicatorTarget(null);
      await refresh(selectedPeriodo);
    } finally {
      setDeletingIndicator(false);
    }
  }

  async function doDelete() {
    // Guarda contra duplo-envio do MESMO período (`deleting` já é `isDeleting(current.periodo)`
    // — ver comentário de `usePeriodoMutating`); um delete de outro período em andamento não
    // bloqueia este.
    if (deleting || !current) return;
    startDeleting(current.periodo);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/reuniao/gerente?periodo=${current.periodo}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Não foi possível excluir esta reunião.");
        return;
      }
      setConfirmDelete(false);
      // `setCurrent(null)`/`setForm(buildForm(null))`, diferente de `setConfirmDelete` acima
      // (só estado do modal de confirmação, não dado de período), também precisam checar se o
      // período excluído ainda é o selecionado — sem isso, excluir a reunião de P enquanto o
      // usuário já trocou pra outro período Q zeraria `current`/notas na tela de Q quando este
      // DELETE atrasado respondesse, mesmo Q nunca tendo sido excluído (mesma classe de corrida
      // do comentário de `selectedPeriodoRef` acima, só que vindo do DELETE em vez do GET).
      if (current.periodo === selectedPeriodoRef.current) {
        setCurrent(null);
        setForm(buildForm(null));
      }
      await refresh(selectedPeriodo);
    } finally {
      finishDeleting(current.periodo);
    }
  }

  function editHistoryRow(m: Meeting) {
    setSelectedPeriodo(m.periodo);
    setCurrent(m);
    setForm(buildForm(m));
    setFechamentoModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedPeriodo}
            onChange={(e) => setSelectedPeriodo(e.target.value)}
            className="input w-auto"
          />
          <h3 className="text-white font-medium capitalize">{periodoLabel(selectedPeriodo)}</h3>
          {loading && <span className="text-xs text-nord-gray">Carregando...</span>}
        </div>
        <div className="flex items-center gap-4">
          <CompareMonthsPicker periodos={comparePeriodos} onChange={setComparePeriodos} />
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white hover:border-nord-blue-light"
          >
            <FileDown size={13} /> Exportar PDF
          </button>
          {canCreate && (
            <button onClick={() => setFechamentoModalOpen(true)} className="text-xs text-nord-blue-light hover:underline">
              Editar fechamento do mês
            </button>
          )}
        </div>
      </div>

      {/* Sem loja específica selecionada (visão consolidada "Grupo Nord"), a reunião não
          tem o que mostrar aqui: "Fechamento do mês"/"Observações" são por loja e o grid de
          indicadores fixos que ficava nesse espaço foi removido (deixou de existir desde que
          "Fechamento do mês" passou a ser a única fonte desses números, sem duplicar o que já
          aparece nela). Mesmo padrão de aviso já usado em outras telas com essa mesma
          limitação — ver src/app/portal/tarefas/checklist/checklist-client.tsx e
          src/app/portal/marketing/trafego-pago/trafego-pago-client.tsx — reaproveitado aqui
          em vez de inventar um texto novo. `!canCreate` aqui tem 2 motivos possíveis: visão
          consolidada "Grupo Nord" (sem loja específica selecionada) ou falta de permissão real
          (canEdit) numa loja única — ver comentário de `canCreate` em page.tsx.
          isGrupoNordMode escolhe a mensagem certa, mesmo padrão do item #255 (ex.:
          movimentacoes-client.tsx, insumos-client.tsx). */}
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para ver e editar o fechamento do mês desta reunião."
            : "Seu perfil de permissão não permite ver ou editar o fechamento do mês desta reunião."}
        </p>
      )}

      {/* "Fechamento do mês" (antiga "Metas e premiação"): lista única de indicadores —
          nome + 1 valor de referência por mês, sem meta-alvo nem premiação. Inclui tanto
          os 4 indicadores migrados de GerenteMeeting (Faturamento Total, CMV, Turnover,
          Checklist Operacional) quanto os criados livremente (ex.: Ticket Médio Salão/
          Delivery) — todos tratados exatamente igual, sem distinção nenhuma entre eles.
          Fica visível direto na tela (não só dentro do modal de edição) porque a ideia é
          servir de referência rápida durante a própria reunião. */}
      {canCreate && (
        <Section
          title="Fechamento do mês"
          action={
            <button
              onClick={() => setFechamentoModalOpen(true)}
              className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline"
            >
              <Pencil size={12} /> Editar
            </button>
          }
        >
          {customIndicators.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {customIndicators.map((ind, index) => {
                const { valorReferencia, valorSecundario, valorTerciario } = customIndicatorState(ind);
                const color = indicatorAccentColor(index);
                return (
                  <div
                    key={ind.id}
                    className="flex items-center gap-2.5 rounded-lg border border-nord-border/60 px-3 py-2.5 min-w-0"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}22` }}
                    >
                      <DynamicIcon name={ind.icon} size={15} style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        <span className="text-nord-gray">{ind.nome}:</span>{" "}
                        <span className="text-white font-semibold">{formatCustomValue(ind.unidade, valorReferencia)}</span>
                      </p>
                      {/* Segundo valor (indicador "composto", ex.: Cancelamentos = % + quantidade) —
                          só aparece quando o indicador tem unidadeSecundaria configurada. */}
                      {ind.unidadeSecundaria && (
                        <p className="text-xs text-nord-gray truncate">
                          {ind.nomeSecundario}:{" "}
                          <span className="text-white font-medium">
                            {formatCustomValue(ind.unidadeSecundaria, valorSecundario ?? 0)}
                          </span>
                        </p>
                      )}
                      {/* Terceiro valor — mesma ideia do segundo, só aparece quando o indicador
                          tem unidadeTerciaria configurada (que só existe junto da secundária). */}
                      {ind.unidadeTerciaria && (
                        <p className="text-xs text-nord-gray truncate">
                          {ind.nomeTerciario}:{" "}
                          <span className="text-white font-medium">
                            {formatCustomValue(ind.unidadeTerciaria, valorTerciario ?? 0)}
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
      )}

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            <div>
              {/* Lista única de indicadores — nome + 1 valor de referência por mês, sem
                  meta-alvo nem premiação. Inclui tanto os 4 indicadores migrados de
                  GerenteMeeting (Faturamento Total, CMV, Turnover, Checklist Operacional)
                  quanto os criados livremente (ex.: Ticket Médio Salão/Delivery) — sem
                  distinção nenhuma entre eles aqui. */}
              <p className="text-xs text-nord-gray mb-2 font-medium">Fechamento do mês</p>
              {customIndicators.length > 0 ? (
                <div className="space-y-3">
                  {customIndicators.map((ind, index) => {
                    const entry =
                      customForm[ind.id] ?? { valor: "", valorReferencia: String(ind.valorPadrao), valorSecundario: "", valorTerciario: "" };
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
                            <button
                              onClick={() => openEditIndicator(ind)}
                              className="text-nord-gray hover:text-white flex items-center gap-1 text-xs"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                            <button
                              onClick={() => setDeleteIndicatorTarget(ind)}
                              className="text-nord-gray hover:text-nord-danger flex items-center gap-1 text-xs"
                            >
                              <Trash2 size={12} /> Excluir indicador
                            </button>
                          </div>
                        </div>
                        {/* Grid de 1 (indicador simples), 2 (composto com 2º valor) ou 3 colunas
                            (composto com 2º E 3º valor) — o 3º valor só existe junto do 2º (ver
                            comentário de nomeTerciario em schema.prisma), então nunca pula de 1
                            pra 3 colunas direto. */}
                        <div
                          className={
                            ind.unidadeTerciaria ? "grid grid-cols-3 gap-3" : ind.unidadeSecundaria ? "grid grid-cols-2 gap-3" : ""
                          }
                        >
                          <label className="block">
                            <span className="block text-xs text-nord-gray mb-1">Valor {unidadeSuffix(ind.unidade)}</span>
                            <input
                              type="number"
                              step="0.1"
                              value={entry.valorReferencia}
                              onChange={(e) => updateCustomForm(ind.id, { valorReferencia: e.target.value })}
                              className="input"
                            />
                          </label>
                          {/* Segundo valor (indicador "composto") — só aparece quando o indicador
                              tem unidadeSecundaria configurada. */}
                          {ind.unidadeSecundaria && (
                            <label className="block">
                              <span className="block text-xs text-nord-gray mb-1">
                                {ind.nomeSecundario} {unidadeSuffix(ind.unidadeSecundaria)}
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                value={entry.valorSecundario}
                                onChange={(e) => updateCustomForm(ind.id, { valorSecundario: e.target.value })}
                                className="input"
                              />
                            </label>
                          )}
                          {/* Terceiro valor — mesma ideia do segundo, só aparece quando o indicador
                              tem unidadeTerciaria configurada. */}
                          {ind.unidadeTerciaria && (
                            <label className="block">
                              <span className="block text-xs text-nord-gray mb-1">
                                {ind.nomeTerciario} {unidadeSuffix(ind.unidadeTerciaria)}
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                value={entry.valorTerciario}
                                onChange={(e) => updateCustomForm(ind.id, { valorTerciario: e.target.value })}
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
                onClick={() => setNewIndicatorOpen(true)}
                className="mt-3 flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline"
              >
                <Plus size={13} /> Novo indicador
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-nord-border">
              {current ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-nord-danger hover:text-nord-danger/80"
                >
                  <Trash2 size={13} /> Excluir esta reunião
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={async () => {
                  await submit();
                  setFechamentoModalOpen(false);
                }}
                disabled={saving}
                className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
              >
                {saving ? "Salvando..." : current ? "Salvar alterações" : "Salvar fechamento do período"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir reunião"
        message={
          deleteError ||
          `Tem certeza que deseja excluir o fechamento de ${periodoLabel(selectedPeriodo)}? Os resultados e observações desse período serão perdidos.`
        }
        onConfirm={doDelete}
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteError(null);
        }}
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        danger
      />

      <Modal open={newIndicatorOpen} onClose={() => setNewIndicatorOpen(false)} title="Novo indicador">
        <FormError message={newIndicatorError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={newIndicatorForm.nome}
              onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={newIndicatorForm.icon} onChange={(icon) => setNewIndicatorForm({ ...newIndicatorForm, icon })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={newIndicatorForm.unidade}
                onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, unidade: e.target.value as GerenteCustomIndicatorDTO["unidade"] })}
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
                value={newIndicatorForm.valorPadrao}
                onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, valorPadrao: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={newIndicatorForm.hasSecondary}
              onChange={(e) => {
                const hasSecondary = e.target.checked;
                // Desmarcar o 2º valor também desmarca o 3º (nunca pode existir um sem o
                // outro — ver comentário de nomeTerciario em schema.prisma).
                setNewIndicatorForm({ ...newIndicatorForm, hasSecondary, hasTertiary: hasSecondary ? newIndicatorForm.hasTertiary : false });
              }}
            />
            Este indicador tem um segundo valor
          </label>
          {/* Ex.: "Cancelamentos" registra um percentual (campos acima) + uma quantidade de
              atrasos/cancelamentos (campos abaixo) — os dois valores por período. */}
          {newIndicatorForm.hasSecondary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do segundo valor</span>
                <input
                  type="text"
                  value={newIndicatorForm.nomeSecundario}
                  onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, nomeSecundario: e.target.value })}
                  placeholder="Ex.: Quantidade de atrasos"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do segundo valor</span>
                <select
                  value={newIndicatorForm.unidadeSecundaria}
                  onChange={(e) =>
                    setNewIndicatorForm({ ...newIndicatorForm, unidadeSecundaria: e.target.value as GerenteCustomIndicatorDTO["unidade"] })
                  }
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
          {/* 3º valor — só disponível quando o 2º já está marcado (ver comentário de
              nomeTerciario em schema.prisma); ex.: "Pedidos por canal" com Site (campos
              principais), 99Food (2º valor) e iFood (3º valor), os 3 do mesmo jeito. */}
          {newIndicatorForm.hasSecondary && (
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={newIndicatorForm.hasTertiary}
                onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, hasTertiary: e.target.checked })}
              />
              Este indicador também tem um terceiro valor
            </label>
          )}
          {newIndicatorForm.hasSecondary && newIndicatorForm.hasTertiary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do terceiro valor</span>
                <input
                  type="text"
                  value={newIndicatorForm.nomeTerciario}
                  onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, nomeTerciario: e.target.value })}
                  placeholder="Ex.: iFood"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do terceiro valor</span>
                <select
                  value={newIndicatorForm.unidadeTerciaria}
                  onChange={(e) =>
                    setNewIndicatorForm({ ...newIndicatorForm, unidadeTerciaria: e.target.value as GerenteCustomIndicatorDTO["unidade"] })
                  }
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
            onClick={createIndicator}
            disabled={creatingIndicator}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {creatingIndicator ? "Criando..." : "Criar indicador"}
          </button>
        </div>
      </Modal>

      <Modal open={editIndicatorTarget !== null} onClose={() => setEditIndicatorTarget(null)} title="Editar indicador">
        <FormError message={editIndicatorError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={editIndicatorForm.nome}
              onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={editIndicatorForm.icon} onChange={(icon) => setEditIndicatorForm({ ...editIndicatorForm, icon })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={editIndicatorForm.unidade}
                onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, unidade: e.target.value as GerenteCustomIndicatorDTO["unidade"] })}
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
                value={editIndicatorForm.valorPadrao}
                onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, valorPadrao: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={editIndicatorForm.hasSecondary}
              onChange={(e) => {
                const hasSecondary = e.target.checked;
                // Desmarcar o 2º valor também desmarca o 3º (nunca pode existir um sem o
                // outro — ver comentário de nomeTerciario em schema.prisma).
                setEditIndicatorForm({ ...editIndicatorForm, hasSecondary, hasTertiary: hasSecondary ? editIndicatorForm.hasTertiary : false });
              }}
            />
            Este indicador tem um segundo valor
          </label>
          {/* Desmarcar remove o 2º valor deste indicador (volta a ser simples) — o histórico
              de valores já salvos em meses anteriores permanece no banco, só deixa de
              aparecer/ser editável enquanto a opção estiver desmarcada. Remove também o 3º
              valor, se houver (não pode existir um sem o outro). */}
          {editIndicatorForm.hasSecondary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do segundo valor</span>
                <input
                  type="text"
                  value={editIndicatorForm.nomeSecundario}
                  onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, nomeSecundario: e.target.value })}
                  placeholder="Ex.: Quantidade de atrasos"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do segundo valor</span>
                <select
                  value={editIndicatorForm.unidadeSecundaria}
                  onChange={(e) =>
                    setEditIndicatorForm({ ...editIndicatorForm, unidadeSecundaria: e.target.value as GerenteCustomIndicatorDTO["unidade"] })
                  }
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
          {/* 3º valor — só disponível quando o 2º já está marcado (ver comentário de
              nomeTerciario em schema.prisma). */}
          {editIndicatorForm.hasSecondary && (
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={editIndicatorForm.hasTertiary}
                onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, hasTertiary: e.target.checked })}
              />
              Este indicador também tem um terceiro valor
            </label>
          )}
          {editIndicatorForm.hasSecondary && editIndicatorForm.hasTertiary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do terceiro valor</span>
                <input
                  type="text"
                  value={editIndicatorForm.nomeTerciario}
                  onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, nomeTerciario: e.target.value })}
                  placeholder="Ex.: iFood"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do terceiro valor</span>
                <select
                  value={editIndicatorForm.unidadeTerciaria}
                  onChange={(e) =>
                    setEditIndicatorForm({ ...editIndicatorForm, unidadeTerciaria: e.target.value as GerenteCustomIndicatorDTO["unidade"] })
                  }
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
            onClick={saveEditIndicator}
            disabled={savingEditIndicator}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {savingEditIndicator ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteIndicatorTarget !== null}
        title="Excluir indicador"
        message={`Tem certeza que quer excluir o indicador "${deleteIndicatorTarget?.nome}"? Isso remove esse indicador e o histórico de valores dele em todos os meses — o restante da reunião não é afetado.`}
        confirmLabel={deletingIndicator ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={confirmDeleteIndicator}
        onCancel={() => setDeleteIndicatorTarget(null)}
      />

      {canCreate && (
        <Section title="Observações da reunião">
          <textarea
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            placeholder="Pontos discutidos, dicas de melhoria, combinados com a equipe..."
            className="input min-h-24"
          />
          <button
            onClick={submit}
            disabled={saving}
            className="mt-3 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {saving ? "Salvando..." : current ? "Atualizar fechamento do mês" : "Salvar fechamento do mês"}
          </button>
        </Section>
      )}

      {/* "Metas de [próximo mês]": metas cadastradas pra equipe bater no mês seguinte (sempre
          calculado a partir de hoje, nunca digitado) — cada uma com o que precisa ser feito
          (métrica + valor-alvo) e o prêmio ao bater (valor + destinatário, "Equipe" por
          padrão). Componente compartilhado com Salão/Cozinha/Delivery/Liderança — ver
          src/components/reuniao/metas-proximo-mes.tsx. Mesmo `canCreate` (isSingle) das
          outras seções desta tela; excluir uma meta pede além disso `canDeleteMetas` (perfil
          "gerente" tem canCreate/canEdit mas não canDelete no módulo "reuniao" — ver
          page.tsx). */}
      {canCreate && <MetasProximoMesSection mp={mp} canDelete={canDeleteMetas} />}

      {/* Período + Editar (navegação rápida pra abrir o Fechamento do mês de um mês já
          lançado) — chegou a ter colunas de Faturamento/CMV/Turnover/Checklist aqui, mas eram
          lidas de GerenteMeeting (cálculo ao vivo congelado no momento do save, ou campo
          congelado desde que "Resultado do período" foi removida), duplicando com valores
          DIFERENTES os indicadores de mesmo nome do "Fechamento do mês" — removidas a pedido
          do Matheus (mesma decisão do PDF, ver comentário em `exportPdf` acima). */}
      {meetings.length > 0 && (
        <Section title="Histórico de reuniões">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white border-b border-nord-border">
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Calendar" size={13} className="text-nord-blue-light" /> Período
                    </span>
                  </th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} className={`border-b border-nord-border/50 ${m.periodo === selectedPeriodo ? "bg-white/5" : ""}`}>
                    <td className="py-2 px-3 text-white capitalize">{periodoLabel(m.periodo)}</td>
                    <td className="py-2 px-3">
                      {canCreate && (
                        <button onClick={() => editHistoryRow(m)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

    </div>
  );
}
