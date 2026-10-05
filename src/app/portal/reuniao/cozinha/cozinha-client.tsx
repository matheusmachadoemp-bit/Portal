"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, FileDown, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import {
  FechamentoDoMesSection,
  FechamentoDoMesEditor,
  useFechamentoDoMes,
  fetchFechamentoDoMesIndicatorsForPdf,
  buildCustomIndicatorPdfEntries,
  type FechamentoIndicator,
} from "@/components/reuniao/fechamento-do-mes";
import { useMetasProximoMes, MetasProximoMesSection, fetchMetasProximoMesForPdf } from "@/components/reuniao/metas-proximo-mes";
import { nextPeriodo, periodoLabel, resolveComparePeriodos } from "@/lib/reuniao";

type Meeting = {
  id: string;
  periodo: string;
  cmvPercent: number | null;
  desperdicioValor: number | null;
  tempoPedidoMinutos: number | null;
  organizacaoPercent: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

// Tempo Pedido e Organização e Limpeza não têm mais input no modal "Fechamento do mês"
// (seção "Resultado do período" removida a pedido do usuário), mas continuam inicializados
// aqui a partir do registro já salvo pra fazer round-trip no `submit()`: pararam de ter
// qualquer exibição na tela (nem no modal, nem na tabela "Histórico de reuniões" — removida
// de lá por duplicar, com valor DIFERENTE, o indicador dinâmico de mesmo nome no "Fechamento
// do mês"; ver comentário acima de `FechamentoDoMesEditor`/da tabela mais abaixo), mas o
// valor continua sendo lido do banco e reenviado por baixo, sem input nenhum alterando-o.
// Mesmo round-trip "congelado" das telas irmãs (Salão/Delivery/Gerente): a rota POST
// /api/reuniao/cozinha grava explicitamente `null` quando o campo vem ausente/vazio no
// `create` (registro novo); no `update` de um registro já existente ela passa `undefined`
// nesse caso, que o Prisma trata como "não mexer nessa coluna" — ou seja, aqui o risco de
// null-ar retroativamente um valor de mês anterior é menor que em Gerente/Salão/Delivery,
// mas continuamos sempre reenviando o valor atual por consistência (é um no-op seguro) e
// para cobrir também o caminho de criação de um registro novo.
function buildForm(m?: Meeting | null) {
  return {
    tempoPedidoMinutos: m?.tempoPedidoMinutos != null ? String(m.tempoPedidoMinutos) : "",
    organizacaoPercent: m?.organizacaoPercent != null ? String(m.organizacaoPercent) : "",
    notas: m?.notas ?? "",
  };
}

export function CozinhaClient({
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
  initialCustomIndicators: FechamentoIndicator[];
  periodo: string;
  canCreate: boolean;
  /** Diferencia por que `canCreate` é falso: modo Grupo Nord (consolidado) ou permissão do perfil numa loja específica. */
  isGrupoNordMode: boolean;
  /** Controla só o botão de excluir do card "Metas de [próximo mês]" — ver
   * canDeleteMetas em gerente/page.tsx (mesmo critério, `canDelete` no módulo "reuniao"). */
  canDeleteMetas: boolean;
  empresaName: string;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [form, setForm] = useState(buildForm(initialCurrent));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const fdm = useFechamentoDoMes("/api/reuniao/cozinha", selectedPeriodo, initialCustomIndicators);
  const mp = useMetasProximoMes("/api/reuniao/cozinha", canCreate, nextPeriodo(selectedPeriodo));

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    const fdmToken = fdm.beginFetch();
    setLoading(true);
    fetch(`/api/reuniao/cozinha?periodo=${selectedPeriodo}`)
      .then((res) => res.json())
      .then((data) => {
        // `cancelled`: esta própria instância do efeito foi desmontada/re-executada (ex.:
        // `selectedPeriodo` mudou de novo) antes da resposta chegar. `!fdm.isLatest(fdmToken)`:
        // uma busca MAIS NOVA — deste mesmo efeito reexecutando, OU de `refresh()` (disparado
        // por `submit()`/`doDelete()`) — já começou desde então; ver o comentário de
        // `fetchGenerationRef`/`beginFetch`/`isLatest` em fechamento-do-mes.tsx e o mesmo
        // cuidado em gerente-client.tsx. Nos dois casos, descarta a resposta em silêncio (sem
        // sobrescrever a tela com dado de um período que não é mais o selecionado).
        if (cancelled || !fdm.isLatest(fdmToken)) return;
        setCurrent(data.current);
        setForm(buildForm(data.current));
        fdm.sync(fdmToken, data.customIndicators ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fdm.sync só chama setState estáveis por baixo (ver useFechamentoDoMes); incluir `fdm` recriaria o efeito a cada render (objeto novo) e causaria um loop de fetch.
  }, [selectedPeriodo]);

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    // Busca as metas do próximo mês na hora de exportar (não reaproveita o estado `mp.metas`
    // já carregado na tela) pra garantir que o PDF sai com o que está salvo agora — mesmo
    // padrão da Reunião Gerente (ver fetchMetasProximoMesForPdf).
    const metasData = await fetchMetasProximoMesForPdf("/api/reuniao/cozinha", nextPeriodo(selectedPeriodo));

    // Busca os indicadores customizados ("Fechamento do mês") de cada período comparado,
    // fresquinhos do servidor (mesmo motivo de fetchMetasProximoMesForPdf acima) — a rota
    // GET só devolve os indicadores de UM período por chamada, então busca um por período
    // comparado, em paralelo (até 3 chamadas). Ver buildCustomIndicatorPdfEntries.
    const customIndicatorsByPeriodo = await Promise.all(
      periodosComparados.map((p) => fetchFechamentoDoMesIndicatorsForPdf("/api/reuniao/cozinha", p))
    );

    // CMV, Desperdício, Tempo de Pedido e Organização eram 4 indicadores fixos aqui,
    // calculados/congelados à parte (ver histórico desta mesma tarefa) — removidos do PDF a
    // pedido do Matheus porque duplicavam, com fonte e valor DIFERENTES, os indicadores de
    // mesmo nome que já vêm de `buildCustomIndicatorPdfEntries` (o "Fechamento do mês" que o
    // usuário realmente edita hoje). CMV/Desperdício eram recalculados ao vivo a cada save
    // (podendo legitimamente estar zerados por falta de Fechamento do Dia, não por falta de
    // cadastro) e Tempo de Pedido/Organização estavam congelados desde que a seção "Resultado
    // do período" foi removida da tela — nos dois casos, a fonte de verdade pro usuário é só o
    // indicador dinâmico abaixo.
    exportMeetingReportPdf({
      fileSlug: "reuniao-cozinha",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal: 0,
      observacoes: form.notas,
      indicators: [
        // Indicadores customizados cadastrados pelo usuário em "Fechamento do mês" (ex.:
        // qualquer indicador criado em "Novo indicador") — sem isso, qualquer indicador
        // customizado desaparecia do PDF mesmo aparecendo normalmente na tela (card #467).
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

  // `token` vem do CHAMADOR (`submit`/`doDelete`), obtido por ele ANTES de disparar a própria
  // mutação (POST/DELETE) — nunca gerado aqui dentro. Ver o comentário de `fetchGenerationRef`/
  // `beginFetch`/`isLatest` em fechamento-do-mes.tsx e o mesmo cuidado em gerente-client.tsx:
  // gerar o token só aqui, depois da mutação já ter respondido, reabriria exatamente o buraco
  // que esse mecanismo existe pra fechar.
  async function refresh(targetPeriodo: string, token: number) {
    const res = await fetch(`/api/reuniao/cozinha?periodo=${targetPeriodo}`);
    const data = await res.json();
    // Se uma busca mais nova (do efeito de troca de período, ou de outra chamada de refresh())
    // já começou enquanto esta estava em andamento, descarta a resposta POR COMPLETO — sem
    // aplicar nem os campos "soltos" abaixo, nem o fdm.sync() — pra não sobrescrever a tela com
    // dado de um período que não é mais o selecionado.
    if (!fdm.isLatest(token)) return;
    setMeetings(data.meetings);
    setCurrent(data.current);
    fdm.sync(token, data.customIndicators ?? []);
  }

  async function submit() {
    if (saving) return;
    // Pega o token ANTES do POST (não só antes do refresh) — ver o comentário de `refresh`
    // acima sobre por que isso precisa acontecer já aqui.
    const token = fdm.beginFetch();
    setSaving(true);
    try {
      await fetch("/api/reuniao/cozinha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formToPayload(selectedPeriodo, form), customIndicators: fdm.buildIndicatorsPayload() }),
      });
      await refresh(selectedPeriodo, token);
    } finally {
      setSaving(false);
    }
  }

  function editHistoryRow(m: Meeting) {
    setSelectedPeriodo(m.periodo);
    setCurrent(m);
    setForm(buildForm(m));
    setFechamentoModalOpen(true);
  }

  async function doDelete() {
    if (deleting || !current) return;
    // Pega o token ANTES do DELETE (não só antes do refresh) — ver o comentário de `refresh`
    // acima.
    const token = fdm.beginFetch();
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/reuniao/cozinha?periodo=${current.periodo}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Não foi possível excluir esta reunião.");
        return;
      }
      setConfirmDelete(false);
      // `setCurrent(null)`/`setForm`, diferente de `setConfirmDelete` acima (só estado do
      // modal de confirmação, não dado de período), também precisam do mesmo token — sem
      // isso, excluir a reunião de P enquanto o usuário já trocou pra outro período Q zeraria
      // a tela de Q quando este DELETE atrasado respondesse, mesmo Q nunca tendo sido
      // excluído (mesma classe de corrida do comentário de `refresh` acima, só que vindo do
      // DELETE em vez do GET).
      if (fdm.isLatest(token)) {
        setCurrent(null);
        setForm(buildForm(null));
      }
      await refresh(selectedPeriodo, token);
    } finally {
      setDeleting(false);
    }
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

      {/* !canCreate aqui tem 2 motivos possíveis (diferente de gerente/lideranca/delivery/salao,
          onde canCreate é só isSingle): visão consolidada "Grupo Nord" (sem loja específica
          selecionada) ou falta de permissão real (canEdit) numa loja única — ver comentário de
          `canCreate` em page.tsx. isGrupoNordMode escolhe a mensagem certa, mesmo padrão do
          item #255 (ex.: movimentacoes-client.tsx, insumos-client.tsx). */}
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          {isGrupoNordMode
            ? "Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para ver e editar o fechamento do mês desta reunião."
            : "Seu perfil de permissão não permite ver ou editar o fechamento do mês desta reunião."}
        </p>
      )}

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            {/* Seção "Resultado do período" (Tempo Pedido + Organização e Limpeza) removida a
                pedido do usuário — aparecia sempre vazia no modal. Os 2 campos continuam
                "congelados" no round-trip do `submit()` (ver comentário de `buildForm` acima),
                mas pararam de ter qualquer exibição na tela (nem no modal, nem na tabela
                "Histórico de reuniões" — removida de lá por duplicar, com valor DIFERENTE, o
                indicador dinâmico de mesmo nome no "Fechamento do mês"). */}
            <FechamentoDoMesEditor fdm={fdm} />

            <div className="flex items-center justify-between pt-2 border-t border-nord-border">
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

      {canCreate && <MetasProximoMesSection mp={mp} canDelete={canDeleteMetas} />}

      {/* Período + Editar (navegação rápida pra abrir o Fechamento do mês de um mês já
          lançado) — chegou a ter colunas de CMV/Desperdício/Tempo Pedido/Organização aqui, mas
          eram lidas de KitchenMeeting (cálculo ao vivo congelado no momento do save, ou campo
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
