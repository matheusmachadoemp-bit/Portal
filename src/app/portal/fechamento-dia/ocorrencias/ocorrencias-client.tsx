"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Pencil, Wand2, RefreshCw, ExternalLink, X, Inbox, History } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { Toolbar } from "@/components/ui/toolbar";
import { STANDARD_PERIOD_OPTIONS, resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from "@/lib/tarefas";
import { CHAMADO_STATUS_COLOR, CHAMADO_STATUS_LABEL } from "@/lib/manutencao";
import {
  GRAVIDADE_COLOR,
  GRAVIDADE_ICON,
  GRAVIDADE_LABEL,
  GRAVIDADE_OPTIONS,
  GRAVIDADE_ORDER,
  STATUS_LABEL,
  STATUS_TONE,
  formatDataCurta,
  formatDataHora,
} from "./constants";
import { EditarOcorrenciaModal } from "./editar-modal";
import { TransformarOcorrenciaModal } from "./transformar-modal";
import type { CategoriaOption, EmpresaOption, FechamentoGravidade, FechamentoOcorrenciaStatus, Ocorrencia, UserOption } from "./types";

// ---------------------------------------------------------------------------
// GET /api/fechamento-dia/ocorrencias aceita from/to/gravidade/status/categoriaId/cargoId.
// Aqui só from/to/gravidade viram parâmetro real de busca (o servidor limita a 500 linhas —
// restringir por período/gravidade é o que evita perder ocorrências antigas fora dessa janela).
// "Loja" e "Categoria" são filtrados no cliente por nome/id sobre o lote já carregado, porque:
// - Categoria é uma tabela POR LOJA (`FechamentoCategoria.empresaId`, `@@unique([empresaId,
//   nome])`) — no modo Grupo Nord, "Equipamento" de uma loja e de outra são IDs diferentes,
//   então filtrar pela rota (que só aceita um `categoriaId`) exigiria uma chamada por loja;
//   filtrar por `categoria.nome` no cliente resolve isso com uma única busca.
// - "Loja" já é implícito na resposta (`ocorrencia.empresa`), sem precisar de outro parâmetro —
//   mesmo padrão do filtro de unidade em Tarefas (`tarefas-client.tsx`), que também filtra
//   `empresaId` no cliente sobre a lista completa.
// "Status" não é enviado ao servidor: a aba Em aberto/Histórico e o sub-filtro de status dentro
// do Histórico são só uma fatia client-side da mesma resposta.
// ---------------------------------------------------------------------------

const HISTORICO_STATUSES: FechamentoOcorrenciaStatus[] = ["TRANSFORMADA", "RESOLVIDA", "DESCARTADA"];

function CardSkeleton() {
  return (
    <div className="nord-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 bg-white/5 rounded" />
          <div className="h-2.5 w-1/2 bg-white/5 rounded" />
        </div>
      </div>
      <div className="h-3 w-full bg-white/5 rounded" />
      <div className="h-3 w-2/3 bg-white/5 rounded" />
    </div>
  );
}

function OcorrenciaCard({
  ocorrencia: o,
  canEdit,
  onEdit,
  onTransform,
}: {
  ocorrencia: Ocorrencia;
  canEdit: boolean;
  onEdit: (o: Ocorrencia) => void;
  onTransform: (o: Ocorrencia) => void;
}) {
  const jaTransformada = !!(o.transformadoEmTaskId || o.transformadoEmChamadoId);

  return (
    <div className="nord-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${GRAVIDADE_COLOR[o.gravidade]}22` }}
            title={GRAVIDADE_LABEL[o.gravidade]}
          >
            <DynamicIcon name={GRAVIDADE_ICON[o.gravidade]} size={18} style={{ color: GRAVIDADE_COLOR[o.gravidade] }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: GRAVIDADE_COLOR[o.gravidade] }}>
                {GRAVIDADE_LABEL[o.gravidade]}
              </span>
              <span className="text-nord-gray/50 text-xs">·</span>
              <span className="inline-flex items-center gap-1 text-xs text-nord-gray">
                <DynamicIcon name={o.categoria.icon} size={12} />
                {o.categoria.nome}
              </span>
            </div>
            <p className="text-xs text-nord-gray mt-0.5">
              {o.empresa.name} · {o.cargo.nome} · {formatDataCurta(o.data)}
              {o.submissao.enviadoPor && <> · enviado por {o.submissao.enviadoPor.name}</>}
            </p>
          </div>
        </div>
        <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
      </div>

      <div>
        <p className="text-[11px] text-nord-gray/70 italic mb-1">Pergunta de origem: {o.pergunta.texto}</p>
        <p className="text-sm text-white">{o.descricao}</p>
      </div>

      {o.comoFoiResolvido && (
        <p className="text-xs text-nord-gray">
          <span className="text-nord-gray/70">Como foi resolvido: </span>
          {o.comoFoiResolvido}
        </p>
      )}
      {o.pendencia && (
        <p className="text-xs text-amber-300">
          <span className="text-amber-300/70">Pendência: </span>
          {o.pendencia}
        </p>
      )}

      {o.transformadoEmTask && (
        <div className="rounded-lg border border-nord-border/60 bg-white/5 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-nord-gray">
            Transformada em tarefa: <span className="text-white">{o.transformadoEmTask.title}</span>{" "}
            <Badge tone={TASK_STATUS_TONE[o.transformadoEmTask.status] ?? "default"}>
              {TASK_STATUS_LABEL[o.transformadoEmTask.status] ?? o.transformadoEmTask.status}
            </Badge>
          </span>
          <Link
            href="/portal/tarefas"
            className="inline-flex items-center gap-1 text-xs text-nord-blue-light hover:underline shrink-0"
          >
            Ver em Tarefas <ExternalLink size={12} />
          </Link>
        </div>
      )}
      {o.transformadoEmChamado && (
        <div className="rounded-lg border border-nord-border/60 bg-white/5 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-nord-gray">
            Transformada em chamado{" "}
            <span className="text-white font-mono">{o.transformadoEmChamado.protocolo}</span>{" "}
            <span className="text-[11px] font-medium" style={{ color: CHAMADO_STATUS_COLOR[o.transformadoEmChamado.status] }}>
              {CHAMADO_STATUS_LABEL[o.transformadoEmChamado.status] ?? o.transformadoEmChamado.status}
            </span>
          </span>
          <Link
            href={`/portal/manutencao/chamados/${o.transformadoEmChamado.id}`}
            className="inline-flex items-center gap-1 text-xs text-nord-blue-light hover:underline shrink-0"
          >
            Ver chamado <ExternalLink size={12} />
          </Link>
        </div>
      )}
      {(o.status === "RESOLVIDA" || o.status === "DESCARTADA") && (
        <p className="text-[11px] text-nord-gray/70">
          {o.status === "RESOLVIDA" ? "Resolvida" : "Descartada"}
          {o.resolvidoPor && <> por {o.resolvidoPor.name}</>}
          {o.resolvidoEm && <> em {formatDataHora(o.resolvidoEm)}</>}
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-2 justify-end pt-2 border-t border-nord-border/60 flex-wrap">
          <button onClick={() => onEdit(o)} className="btn-outline">
            <Pencil size={12} /> Editar
          </button>
          {!jaTransformada && (
            <button onClick={() => onTransform(o)} className="btn-primary">
              <Wand2 size={12} /> Transformar em ação
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OcorrenciasClient({
  categorias,
  teamMembers,
  empresas,
  canEdit,
}: {
  categorias: CategoriaOption[];
  teamMembers: UserOption[];
  empresas: EmpresaOption[];
  canEdit: boolean;
}) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"abertas" | "historico">("abertas");
  const [empresaId, setEmpresaId] = useState("");
  const [categoriaNome, setCategoriaNome] = useState("");
  const [gravidade, setGravidade] = useState<FechamentoGravidade | "">("");
  const [statusHistorico, setStatusHistorico] = useState<FechamentoOcorrenciaStatus | "">("");
  const [periodo, setPeriodo] = useState<RollingPeriodKey | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function selectPeriodo(key: RollingPeriodKey | "") {
    setPeriodo(key);
    if (!key || key === "personalizado") {
      if (!key) {
        setFrom("");
        setTo("");
      }
      return;
    }
    const range = resolveRollingPeriod(key);
    setFrom(format(range.from, "yyyy-MM-dd"));
    setTo(format(range.to, "yyyy-MM-dd"));
  }

  const [editing, setEditing] = useState<Ocorrencia | null>(null);
  // Incrementado a cada clique em "Editar" (mesmo para a mesma ocorrência já aberta antes) — vira
  // parte da `key` do modal abaixo pra forçar remontagem a cada abertura, garantindo que o form
  // sempre nasça com os valores atuais e nunca reaproveite um rascunho de uma edição cancelada.
  const [editSeq, setEditSeq] = useState(0);
  function openEdit(o: Ocorrencia) {
    setEditSeq((s) => s + 1);
    setEditing(o);
  }

  const [transforming, setTransforming] = useState<Ocorrencia | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (gravidade) params.set("gravidade", gravidade);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(`/api/fechamento-dia/ocorrencias${qs ? `?${qs}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível carregar as ocorrências. Tente novamente em instantes.");
        return;
      }
      setOcorrencias(data.ocorrencias ?? []);
    } catch {
      setError("Não foi possível carregar as ocorrências. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [gravidade, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a lista ao montar e sempre que gravidade/período mudar
    load();
  }, [load]);

  const categoriaNomes = useMemo(
    () => Array.from(new Set(categorias.map((c) => c.nome))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [categorias]
  );

  const filtrada = useMemo(() => {
    return ocorrencias.filter((o) => {
      if (empresaId && o.empresaId !== empresaId) return false;
      if (categoriaNome && o.categoria.nome !== categoriaNome) return false;
      return true;
    });
  }, [ocorrencias, empresaId, categoriaNome]);

  const abertas = useMemo(
    () =>
      filtrada
        .filter((o) => o.status === "ABERTA")
        .sort((a, b) => GRAVIDADE_ORDER[a.gravidade] - GRAVIDADE_ORDER[b.gravidade] || new Date(b.data).getTime() - new Date(a.data).getTime()),
    [filtrada]
  );

  const historico = useMemo(
    () =>
      filtrada
        .filter((o) => HISTORICO_STATUSES.includes(o.status))
        .filter((o) => !statusHistorico || o.status === statusHistorico)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [filtrada, statusHistorico]
  );

  const criticasAbertas = abertas.filter((o) => o.gravidade === "CRITICO").length;

  const hasActiveFilters = !!(empresaId || categoriaNome || gravidade || from || to || statusHistorico);
  function limparFiltros() {
    setEmpresaId("");
    setCategoriaNome("");
    setGravidade("");
    setStatusHistorico("");
    setPeriodo("");
    setFrom("");
    setTo("");
  }

  const listaAtual = tab === "abertas" ? abertas : historico;

  return (
    <div className="space-y-6">
      <FormError message={error} />

      <div
        className={`nord-card p-4 flex items-center gap-2 text-sm ${
          criticasAbertas > 0 ? "text-nord-danger" : abertas.length > 0 ? "text-amber-400" : "text-nord-gray"
        }`}
      >
        {loading && ocorrencias.length === 0 ? (
          "Carregando ocorrências..."
        ) : criticasAbertas > 0 ? (
          <>
            <DynamicIcon name="Siren" size={16} className="shrink-0" />
            {criticasAbertas} {criticasAbertas === 1 ? "ocorrência crítica" : "ocorrências críticas"} em aberto — priorize
            {abertas.length > criticasAbertas ? ` (${abertas.length} no total em aberto)` : ""}
          </>
        ) : abertas.length > 0 ? (
          <>
            <DynamicIcon name="Clock" size={16} className="shrink-0" />
            {abertas.length} {abertas.length === 1 ? "ocorrência em aberto" : "ocorrências em aberto"} precisando de ação
          </>
        ) : (
          <>
            <DynamicIcon name="CheckCircle2" size={16} className="shrink-0" />
            Nenhuma ocorrência em aberto com os filtros atuais
          </>
        )}
      </div>

      <Toolbar
        filters={
          <>
            {empresas.length > 1 && (
              <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className="input input-compact">
                <option value="">Todas as lojas</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            <select value={categoriaNome} onChange={(e) => setCategoriaNome(e.target.value)} className="input input-compact">
              <option value="">Todas as categorias</option>
              {categoriaNomes.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
            <select
              value={gravidade}
              onChange={(e) => setGravidade(e.target.value as FechamentoGravidade | "")}
              className="input input-compact"
            >
              <option value="">Todas as gravidades</option>
              {GRAVIDADE_OPTIONS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <select
              value={periodo}
              onChange={(e) => selectPeriodo(e.target.value as RollingPeriodKey | "")}
              className="input input-compact"
            >
              <option value="">Qualquer período</option>
              {STANDARD_PERIOD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            {periodo === "personalizado" && (
              <>
                <span className="flex items-center gap-1.5 text-xs text-nord-gray">
                  De <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input input-compact date-input" />
                </span>
                <span className="flex items-center gap-1.5 text-xs text-nord-gray">
                  Até <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input input-compact date-input" />
                </span>
              </>
            )}
            {hasActiveFilters && (
              <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-nord-gray hover:text-white px-1">
                <X size={13} /> Limpar filtros
              </button>
            )}
          </>
        }
        exportFilename="ocorrencias-fechamento-dia"
        exportSheetName="Ocorrencias"
        exportRows={() =>
          filtrada.map((o) => ({
            Loja: o.empresa.name,
            Cargo: o.cargo.nome,
            Data: formatDataCurta(o.data),
            Categoria: o.categoria.nome,
            Gravidade: GRAVIDADE_LABEL[o.gravidade],
            Descrição: o.descricao,
            Status: STATUS_LABEL[o.status],
            "Transformada em": o.transformadoEmTask ? `Tarefa: ${o.transformadoEmTask.title}` : o.transformadoEmChamado ? `Chamado ${o.transformadoEmChamado.protocolo}` : "",
          }))
        }
        onRefresh={load}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-nord-border overflow-hidden">
          <button
            onClick={() => setTab("abertas")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
              tab === "abertas" ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"
            }`}
          >
            <Inbox size={13} /> Em aberto ({abertas.length})
          </button>
          <button
            onClick={() => setTab("historico")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-nord-border ${
              tab === "historico" ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"
            }`}
          >
            <History size={13} /> Histórico ({historico.length})
          </button>
        </div>

        {tab === "historico" && (
          <select
            value={statusHistorico}
            onChange={(e) => setStatusHistorico(e.target.value as FechamentoOcorrenciaStatus | "")}
            className="input input-compact"
          >
            <option value="">Todos os status do histórico</option>
            {HISTORICO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}

        {loading && ocorrencias.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-nord-gray">
            <RefreshCw size={12} className="animate-spin" /> Atualizando...
          </span>
        )}
      </div>

      {loading && ocorrencias.length === 0 && (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {!loading && listaAtual.length === 0 && (
        <div className="nord-card p-10 text-center text-sm text-nord-gray">
          {tab === "abertas" ? "Nenhuma ocorrência em aberto com os filtros atuais." : "Nenhuma ocorrência no histórico com os filtros atuais."}
        </div>
      )}

      {listaAtual.length > 0 && (
        <div className="space-y-3">
          {listaAtual.map((o) => (
            <OcorrenciaCard key={o.id} ocorrencia={o} canEdit={canEdit} onEdit={openEdit} onTransform={setTransforming} />
          ))}
        </div>
      )}

      <EditarOcorrenciaModal
        key={editing ? `${editing.id}-${editSeq}` : "none"}
        ocorrencia={editing}
        categorias={categorias}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <TransformarOcorrenciaModal
        ocorrencia={transforming}
        teamMembers={teamMembers}
        onClose={() => setTransforming(null)}
        onTransformed={() => { setTransforming(null); load(); }}
      />

      <style jsx global>{`
        .date-input {
          cursor: pointer;
        }
        .date-input::-webkit-calendar-picker-indicator {
          filter: invert(35%) sepia(90%) saturate(2000%) hue-rotate(211deg) brightness(100%) contrast(101%);
          cursor: pointer;
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
