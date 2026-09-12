"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock, Eye, PenLine, RefreshCw } from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { FECHAMENTO_STATUS_LABEL, FECHAMENTO_STATUS_TONE, type FechamentoStatusValor, formatDiaExtenso, formatHora } from "./format";

// ---------------------------------------------------------------------------
// GET /api/fechamento-dia/status — devolve um card por cargo, já com
// podeVisualizar/podeExecutar resolvidos e cargos sem nenhum dos dois já
// filtrados fora. Este componente só busca e renderiza; nenhuma decisão de
// autorização é tomada aqui.
// ---------------------------------------------------------------------------

type CargoInfo = {
  id: string;
  key: string;
  nome: string;
  icon: string;
  ordem: number;
  empresa: { id: string; name: string };
  responsavel: { id: string; name: string } | null;
  substituto: { id: string; name: string } | null;
  horarioLiberacao: string;
  horarioLimite: string;
};

type SubmissaoInfo = {
  id: string;
  status: FechamentoStatusValor;
  releaseAt: string;
  dueAt: string;
  enviadoEm: string | null;
  notaGeral: number | null;
};

type CargoStatus = {
  cargo: CargoInfo;
  submissao: SubmissaoInfo | null;
  podeVisualizar: boolean;
  podeExecutar: boolean;
};

type StatusResponse = { date: string; cargos: CargoStatus[] };

type ResumoTone = "success" | "warning" | "danger" | "default";

const RESUMO_CLASSNAME: Record<ResumoTone, string> = {
  success: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400",
  warning: "border-amber-500/40 bg-amber-500/5 text-amber-400",
  danger: "border-red-500/40 bg-red-500/5 text-red-400",
  default: "text-nord-gray",
};

function CardSkeleton() {
  return (
    <div className="nord-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/5 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-2/3 bg-white/5 rounded" />
          <div className="h-2.5 w-1/2 bg-white/5 rounded" />
        </div>
      </div>
      <div className="h-9 w-full bg-white/5 rounded-lg" />
    </div>
  );
}

function CargoCard({ item }: { item: CargoStatus }) {
  const { cargo, submissao, podeExecutar } = item;
  const enviadoComAtraso =
    submissao?.status === "ENVIADO" && submissao.enviadoEm
      ? new Date(submissao.enviadoEm).getTime() > new Date(submissao.dueAt).getTime()
      : false;

  return (
    <div className="nord-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-nord-blue/15 flex items-center justify-center shrink-0">
            <DynamicIcon name={cargo.icon} size={20} className="text-nord-blue-light" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium text-sm truncate">{cargo.nome}</p>
            <p className="text-xs text-nord-gray truncate">{cargo.empresa.name}</p>
          </div>
        </div>
        {submissao ? (
          <Badge tone={FECHAMENTO_STATUS_TONE[submissao.status]}>{FECHAMENTO_STATUS_LABEL[submissao.status]}</Badge>
        ) : (
          <Badge tone="default">Sem expediente hoje</Badge>
        )}
      </div>

      <div className="text-xs text-nord-gray space-y-1">
        <p className="truncate">Responsável: {cargo.responsavel?.name ?? "não definido"}</p>
        {submissao?.status === "ENVIADO" && submissao.enviadoEm && (
          <p className="flex items-center gap-1">
            <Clock size={12} className="shrink-0" />
            Enviado às {formatHora(submissao.enviadoEm)} · {enviadoComAtraso ? "com atraso" : "no prazo"}
          </p>
        )}
        {submissao && submissao.status !== "ENVIADO" && (
          <p className="flex items-center gap-1">
            <Clock size={12} className="shrink-0" />
            Prazo até {cargo.horarioLimite}
          </p>
        )}
      </div>

      {submissao?.status === "ENVIADO" ? (
        <Link
          href={`/portal/fechamento-dia/${cargo.id}`}
          className="mt-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 border border-nord-border text-white font-medium transition"
        >
          <Eye size={15} /> Ver feedback
        </Link>
      ) : submissao && podeExecutar ? (
        <Link
          href={`/portal/fechamento-dia/${cargo.id}`}
          className="mt-1 flex items-center justify-center gap-1.5 py-3 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition"
        >
          <PenLine size={15} /> Preencher agora
        </Link>
      ) : null}
    </div>
  );
}

export function StatusDoDiaClient() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fechamento-dia/status");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Não foi possível carregar o status do dia. Tente novamente em instantes.");
        return;
      }
      setData(body);
    } catch {
      setError("Não foi possível carregar o status do dia. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca o status do dia ao montar a tela
    load();
  }, [load]);

  const cargos = data?.cargos ?? [];
  const enviados = cargos.filter((c) => c.submissao?.status === "ENVIADO").length;
  const pendentes = cargos.filter((c) => c.submissao?.status === "PENDENTE").length;
  const atrasados = cargos.filter((c) => c.submissao?.status === "ATRASADO").length;

  const empresasDistintas = Array.from(new Set(cargos.map((c) => c.cargo.empresa.id)));
  const agruparPorLoja = empresasDistintas.length > 1;
  const grupos = agruparPorLoja
    ? empresasDistintas.map((empresaId) => ({
        empresaId,
        nome: cargos.find((c) => c.cargo.empresa.id === empresaId)?.cargo.empresa.name ?? "",
        itens: cargos.filter((c) => c.cargo.empresa.id === empresaId),
      }))
    : [{ empresaId: "todos", nome: "", itens: cargos }];

  let resumoIcon: LucideIcon = Clock;
  let resumoTone: ResumoTone = "default";
  let resumoTexto = "Nenhum fechamento previsto para hoje";
  if (data) {
    if (atrasados > 0) {
      resumoIcon = AlertTriangle;
      resumoTone = "danger";
      resumoTexto = `${atrasados} ${atrasados === 1 ? "fechamento atrasado" : "fechamentos atrasados"}`;
      if (pendentes > 0) resumoTexto += ` · ${pendentes} ${pendentes === 1 ? "pendente" : "pendentes"}`;
    } else if (pendentes > 0) {
      resumoIcon = Clock;
      resumoTone = "warning";
      resumoTexto = `${pendentes} ${pendentes === 1 ? "fechamento pendente" : "fechamentos pendentes"}`;
    } else if (enviados > 0) {
      resumoIcon = CheckCircle2;
      resumoTone = "success";
      resumoTexto = "Todos os fechamentos de hoje estão em dia";
    }
  }
  const ResumoIcon = resumoIcon;

  return (
    <div className="space-y-6">
      <FormError message={error} />

      <div className="nord-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-white text-base font-semibold capitalize">
            {data ? formatDiaExtenso(data.date) : "Carregando..."}
          </p>
          {data && (
            <p className={`text-sm mt-1 flex items-center gap-1.5 ${RESUMO_CLASSNAME[resumoTone]}`}>
              <ResumoIcon size={14} className="shrink-0" /> {resumoTexto}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-nord-gray hover:text-white disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {!loading && data && cargos.length === 0 && (
        <div className="nord-card p-10 text-center text-sm text-nord-gray">
          Nenhum cargo do Fechamento do Dia disponível para você nesta loja.
        </div>
      )}

      {data &&
        cargos.length > 0 &&
        grupos.map((grupo) => (
          <div key={grupo.empresaId} className="space-y-3">
            {agruparPorLoja && <p className="text-xs font-medium text-nord-gray uppercase tracking-wide">{grupo.nome}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grupo.itens
                .slice()
                .sort((a, b) => a.cargo.ordem - b.cargo.ordem)
                .map((item) => (
                  <CargoCard key={item.cargo.id} item={item} />
                ))}
            </div>
          </div>
        ))}
    </div>
  );
}
