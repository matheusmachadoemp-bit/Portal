"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Clock, Play, Printer, RefreshCw, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import {
  compareProductionOrders,
  effectiveProductionStatus,
  PRODUCTION_PRIORITY_COLOR,
  PRODUCTION_PRIORITY_LABEL,
  PRODUCTION_STATUS_LABEL,
  PRODUCTION_STATUS_TONE,
} from "@/lib/producao";
import type { ProductionOrderDTO, CategoriaOption, SetorOption, UserOption } from "../types";
import { ModoPreparoModal } from "../modo-preparo-modal";
import { IniciarModal } from "./iniciar-modal";
import { FinalizarModal } from "./finalizar-modal";
import { EtiquetaModal } from "./etiqueta-modal";

type StatusFilter = "TODOS" | "PENDENTE" | "EM_PRODUCAO" | "CONCLUIDO" | "ATRASADO";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: "PENDENTE", label: "Pendentes" },
  { key: "EM_PRODUCAO", label: "Em produção" },
  { key: "CONCLUIDO", label: "Concluídos" },
  { key: "ATRASADO", label: "Atrasados" },
];

export function HojeClient({
  initialOrdens,
  categorias,
  setores,
  teamMembers,
  canManage,
}: {
  initialOrdens: ProductionOrderDTO[];
  categorias: CategoriaOption[];
  setores: SetorOption[];
  teamMembers: UserOption[];
  canManage: boolean;
}) {
  const [ordens, setOrdens] = useState(initialOrdens);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("TODOS");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [setorFilter, setSetorFilter] = useState("");
  const [responsavelFilter, setResponsavelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [iniciando, setIniciando] = useState<ProductionOrderDTO | null>(null);
  const [finalizando, setFinalizando] = useState<ProductionOrderDTO | null>(null);
  const [imprimindo, setImprimindo] = useState<ProductionOrderDTO | null>(null);
  const [vendoModoPreparo, setVendoModoPreparo] = useState<ProductionOrderDTO | null>(null);
  const [gerando, setGerando] = useState(false);
  const [gerarFeedback, setGerarFeedback] = useState<{ tone: "success" | "error"; message: string; detail?: string } | null>(
    null
  );

  async function refresh() {
    const res = await fetch("/api/producao/ordens");
    const data = await res.json();
    setOrdens(data.ordens);
  }

  async function gerarPlanoHoje() {
    setGerando(true);
    setGerarFeedback(null);
    try {
      const res = await fetch("/api/producao/planejamento/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        await refresh();
        if (data.totalItens === 0) {
          setGerarFeedback({
            tone: "success",
            message:
              "Nenhum produto de produção cadastrado ainda — cadastre os itens em Produção > Produtos antes de gerar o plano.",
          });
        } else {
          setGerarFeedback({
            tone: "success",
            message: `Plano de hoje gerado: ${data.created} produção(ões) criada(s), ${data.updated} atualizada(s).`,
            detail:
              data.skipped > 0
                ? `${data.skipped} produção(ões) já em andamento ou ajustada(s) manualmente — mantida(s) sem alteração.`
                : undefined,
          });
        }
      } else {
        setGerarFeedback({ tone: "error", message: data?.error ?? "Não foi possível gerar o plano de hoje. Tente novamente." });
      }
    } catch {
      setGerarFeedback({
        tone: "error",
        message: "Não foi possível gerar o plano de hoje. Verifique sua conexão e tente novamente.",
      });
    } finally {
      setGerando(false);
    }
  }

  const filtered = useMemo(() => {
    return ordens
      .map((o) => ({ ...o, status: effectiveProductionStatus({ prazo: o.prazo, status: o.status }) }))
      .filter((o) => {
        if (statusFilter !== "TODOS" && o.status !== statusFilter) return false;
        if (categoriaFilter && o.productionItem.category.id !== categoriaFilter) return false;
        if (setorFilter && o.productionItem.setor?.id !== setorFilter) return false;
        if (responsavelFilter && o.responsavelId !== responsavelFilter) return false;
        if (search && !o.productionItem.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort(compareProductionOrders);
  }, [ordens, statusFilter, categoriaFilter, setorFilter, responsavelFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              statusFilter === tab.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="input pl-8"
          />
        </div>
        <select value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)} className="input-sm">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={setorFilter} onChange={(e) => setSetorFilter(e.target.value)} className="input-sm">
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={responsavelFilter} onChange={(e) => setResponsavelFilter(e.target.value)} className="input-sm">
          <option value="">Todos os responsáveis</option>
          {teamMembers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {canManage && (
          <button
            onClick={gerarPlanoHoje}
            disabled={gerando}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium shrink-0"
          >
            {gerando ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />} Gerar plano de hoje
          </button>
        )}
      </div>

      {gerarFeedback && (
        <div
          className={`text-xs rounded-lg px-3 py-2 border space-y-1 ${
            gerarFeedback.tone === "success"
              ? "bg-nord-success/10 border-nord-success/30 text-nord-success"
              : "bg-nord-danger/10 border-nord-danger/30 text-nord-danger"
          }`}
        >
          <p>{gerarFeedback.message}</p>
          {gerarFeedback.detail && <p className="text-nord-gray">{gerarFeedback.detail}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((ordem) => {
          const quantidade = ordem.quantidadeAprovada ?? ordem.quantidadeSugerida;
          const prazoLabel = new Date(ordem.prazo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={ordem.id} className="nord-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DynamicIcon name={ordem.productionItem.category.icon} size={16} style={{ color: ordem.productionItem.category.color }} />
                  <p className="text-sm font-semibold text-white">{ordem.productionItem.name}</p>
                </div>
                <Badge tone={PRODUCTION_STATUS_TONE[ordem.status] ?? "default"}>{PRODUCTION_STATUS_LABEL[ordem.status] ?? ordem.status}</Badge>
              </div>

              {ordem.productionItem.setor && (
                <p className="flex items-center gap-1.5 text-xs text-nord-gray">
                  <DynamicIcon name={ordem.productionItem.setor.icon} size={11} style={{ color: ordem.productionItem.setor.color }} />
                  {ordem.productionItem.setor.name}
                </p>
              )}

              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-nord-gray uppercase tracking-wide">Produzir</span>
                <span className="text-2xl font-semibold tracking-tight text-white">
                  {quantidade} <span className="text-sm text-nord-gray">{ordem.productionItem.unidade}</span>
                </span>
              </div>

              {ordem.quantidadeProduzida !== null && (
                <p className="text-xs text-nord-gray">
                  Produzido: <span className="text-white font-medium">{ordem.quantidadeProduzida}</span> {ordem.productionItem.unidade}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-nord-gray">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Até {prazoLabel}
                </span>
                <span className="font-medium" style={{ color: PRODUCTION_PRIORITY_COLOR[ordem.prioridade] }}>
                  {PRODUCTION_PRIORITY_LABEL[ordem.prioridade] ?? ordem.prioridade}
                </span>
              </div>

              {ordem.status === "ATRASADO" && (
                <p className="flex items-center gap-1 text-xs text-nord-danger">
                  <AlertTriangle size={12} /> Prazo vencido
                </p>
              )}

              <p className="text-xs text-nord-gray">Responsável: {ordem.responsavel?.name ?? "—"}</p>

              <button
                onClick={() => setVendoModoPreparo(ordem)}
                className="w-full flex items-center justify-center gap-1.5 border border-nord-border text-nord-gray hover:text-white text-xs font-medium rounded-lg py-1.5"
              >
                <BookOpen size={12} /> Modo de preparo
              </button>

              {ordem.status === "PENDENTE" && (
                <button
                  onClick={() => setIniciando(ordem)}
                  className="w-full flex items-center justify-center gap-1.5 bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5"
                >
                  <Play size={14} /> Iniciar Produção
                </button>
              )}
              {(ordem.status === "EM_PRODUCAO" || ordem.status === "ATRASADO") && (
                <button
                  onClick={() => setFinalizando(ordem)}
                  className="w-full flex items-center justify-center gap-1.5 bg-nord-success/90 hover:bg-nord-success text-white text-sm font-medium rounded-lg py-2.5"
                >
                  Finalizar Produção
                </button>
              )}
              {ordem.status === "CONCLUIDO" && (
                <button
                  onClick={() => setImprimindo(ordem)}
                  className="w-full flex items-center justify-center gap-1.5 border border-nord-border text-nord-gray hover:text-white text-sm font-medium rounded-lg py-2"
                >
                  <Printer size={13} /> Imprimir Etiqueta
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 &&
          (ordens.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-3 text-center py-10">
              <p className="text-sm text-nord-gray">Nenhuma produção gerada para hoje ainda.</p>
              {canManage && (
                <button
                  onClick={gerarPlanoHoje}
                  disabled={gerando}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
                >
                  {gerando ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} Gerar plano de hoje
                </button>
              )}
            </div>
          ) : (
            <p className="col-span-full text-center text-sm text-nord-gray py-10">Nenhuma produção encontrada com esses filtros.</p>
          ))}
      </div>

      {iniciando && (
        <IniciarModal
          ordem={iniciando}
          teamMembers={teamMembers}
          onClose={() => setIniciando(null)}
          onDone={() => {
            setIniciando(null);
            refresh();
          }}
        />
      )}
      {finalizando && (
        <FinalizarModal
          ordem={finalizando}
          onClose={() => setFinalizando(null)}
          onDone={() => {
            setFinalizando(null);
            refresh();
          }}
        />
      )}
      {imprimindo && <EtiquetaModal ordem={imprimindo} onClose={() => setImprimindo(null)} />}
      {vendoModoPreparo && <ModoPreparoModal ordem={vendoModoPreparo} onClose={() => setVendoModoPreparo(null)} />}
    </div>
  );
}
