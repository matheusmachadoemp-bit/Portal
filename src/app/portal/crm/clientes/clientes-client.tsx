"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Download, Megaphone, PieChart, X } from "lucide-react";
import { Badge } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { STATUS_LABEL, STATUS_TONE, frequenciaLabel, matchesCriteria, type ClienteStatus, type SegmentCriteria } from "@/lib/crm";
import { ClientesImportButton } from "./clientes-import-button";

type Row = {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  lojaId: string;
  lojaNome: string;
  lojaColor: string;
  bairro: string | null;
  cidade: string | null;
  canalPreferido: string | null;
  createdAt: string;
  ehNovo: boolean;
  pedidos: number;
  totalGasto: number;
  ticketMedio: number;
  ultimaCompra: string | null;
  diasDesdeUltimaCompra: number | null;
  frequenciaMediaDias: number | null;
  status: ClienteStatus;
  produtos: string[];
};

const ALL_STATUS: ClienteStatus[] = ["VIP", "RECORRENTE", "ATIVO", "EM_RISCO", "INATIVO", "PERDIDO"];

export function ClientesClient({
  rows,
  lojas,
  isGrupo,
  canCreate,
}: {
  rows: Row[];
  lojas: { id: string; name: string; color: string }[];
  isGrupo: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [segmentCriteria, setSegmentCriteria] = useState<SegmentCriteria | null>(() => {
    const raw = searchParams.get("criteria");
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw)) as SegmentCriteria;
    } catch {
      return null;
    }
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<ClienteStatus>>(
    new Set((initialStatus?.split(",").filter(Boolean) as ClienteStatus[]) ?? [])
  );
  const [lojaFilter, setLojaFilter] = useState("todas");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minGasto, setMinGasto] = useState("");
  const [maxGasto, setMaxGasto] = useState("");
  const [minPedidos, setMinPedidos] = useState("");
  const [produto, setProduto] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSegmentModal, setShowSegmentModal] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.nome} ${r.telefone ?? ""} ${r.whatsapp ?? ""} ${r.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (lojaFilter !== "todas" && r.lojaId !== lojaFilter) return false;
      if (minGasto && r.totalGasto < Number(minGasto)) return false;
      if (maxGasto && r.totalGasto > Number(maxGasto)) return false;
      if (minPedidos && r.pedidos < Number(minPedidos)) return false;
      if (produto.trim() && !r.produtos.some((p) => p.toLowerCase().includes(produto.trim().toLowerCase()))) return false;
      if (segmentCriteria) {
        const matchable = {
          id: r.id,
          empresaId: r.lojaId,
          totalGasto: r.totalGasto,
          pedidos: r.pedidos,
          diasDesdeUltimaCompra: r.diasDesdeUltimaCompra,
          status: r.status,
          ehNovo: r.ehNovo,
          frequenciaMediaDias: r.frequenciaMediaDias,
        };
        if (!matchesCriteria(matchable, segmentCriteria, new Set(r.produtos))) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, lojaFilter, minGasto, maxGasto, minPedidos, produto, segmentCriteria]);

  function toggleStatus(s: ClienteStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  function exportCsv() {
    const target = selected.size > 0 ? filtered.filter((r) => selected.has(r.id)) : filtered;
    const header = ["Nome", "Telefone", "E-mail", "Loja", "Última compra", "Pedidos", "Total gasto", "Ticket médio", "Status"];
    const lines = target.map((r) =>
      [
        r.nome,
        r.telefone ?? "",
        r.email ?? "",
        r.lojaNome,
        r.ultimaCompra ? new Date(r.ultimaCompra).toLocaleDateString("pt-BR") : "",
        r.pedidos,
        r.totalGasto.toFixed(2),
        r.ticketMedio.toFixed(2),
        STATUS_LABEL[r.status],
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-nord-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function criarCampanha() {
    const ids = Array.from(selected);
    const qs = ids.length > 0 ? `?clientes=${ids.join(",")}` : "";
    router.push(`/portal/crm/campanhas/novo${qs}`);
  }

  async function salvarSegmento() {
    if (!segmentName.trim() || selected.size === 0) return;
    setSavingSegment(true);
    await fetch("/api/crm/segmentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: segmentName,
        description: `Segmento criado manualmente com ${selected.size} clientes selecionados.`,
        criteria: { clienteIds: Array.from(selected) },
      }),
    });
    setSavingSegment(false);
    setShowSegmentModal(false);
    setSegmentName("");
    router.push("/portal/crm/segmentos");
  }

  return (
    <div className="space-y-4">
      {segmentCriteria && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-nord-blue/10 border border-nord-blue/40">
          <span className="text-xs text-white">Filtro de segmento aplicado</span>
          <button onClick={() => setSegmentCriteria(null)} className="flex items-center gap-1 text-xs text-nord-gray hover:text-white">
            <X size={12} /> remover
          </button>
        </div>
      )}
      <div className="nord-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone, WhatsApp ou e-mail..."
              className="w-full bg-nord-panel border border-nord-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue"
            />
          </div>
          {isGrupo && (
            <select
              value={lojaFilter}
              onChange={(e) => setLojaFilter(e.target.value)}
              className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
            >
              <option value="todas">Todas as lojas</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border ${
              showAdvanced ? "border-nord-blue text-white bg-nord-blue/10" : "border-nord-border text-nord-gray hover:text-white"
            }`}
          >
            <SlidersHorizontal size={13} /> Filtros avançados
          </button>
          <ClientesImportButton canCreate={canCreate} />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_STATUS.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                statusFilter.has(s)
                  ? "border-nord-blue bg-nord-blue/15 text-white"
                  : "border-nord-border text-nord-gray hover:text-white"
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          {statusFilter.size > 0 && (
            <button onClick={() => setStatusFilter(new Set())} className="text-[11px] text-nord-gray hover:text-white flex items-center gap-0.5">
              <X size={11} /> limpar
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-nord-border">
            <div>
              <label className="block text-[11px] text-nord-gray mb-1">Total gasto mín.</label>
              <input value={minGasto} onChange={(e) => setMinGasto(e.target.value)} type="number" className="w-full bg-nord-panel border border-nord-border rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-nord-blue" />
            </div>
            <div>
              <label className="block text-[11px] text-nord-gray mb-1">Total gasto máx.</label>
              <input value={maxGasto} onChange={(e) => setMaxGasto(e.target.value)} type="number" className="w-full bg-nord-panel border border-nord-border rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-nord-blue" />
            </div>
            <div>
              <label className="block text-[11px] text-nord-gray mb-1">Pedidos mín.</label>
              <input value={minPedidos} onChange={(e) => setMinPedidos(e.target.value)} type="number" className="w-full bg-nord-panel border border-nord-border rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-nord-blue" />
            </div>
            <div>
              <label className="block text-[11px] text-nord-gray mb-1">Produto comprado</label>
              <input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex: Hot Philadelphia" className="w-full bg-nord-panel border border-nord-border rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-nord-blue" />
            </div>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="nord-card p-3 flex items-center justify-between flex-wrap gap-2 border-nord-blue/40">
          <span className="text-sm text-white font-medium">{selected.size} clientes selecionados</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={criarCampanha} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light text-white">
              <Megaphone size={13} /> Criar campanha
            </button>
            <button onClick={() => setShowSegmentModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-nord-border text-nord-gray hover:text-white">
              <PieChart size={13} /> Salvar como segmento
            </button>
            <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-nord-border text-nord-gray hover:text-white">
              <Download size={13} /> Exportar
            </button>
          </div>
        </div>
      )}

      <div className="nord-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-sm">Base de clientes ({formatNumber(filtered.length)})</h3>
          {selected.size === 0 && (
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs text-nord-gray hover:text-white">
              <Download size={13} /> Exportar tudo
            </button>
          )}
        </div>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-2 w-8">
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="accent-nord-blue" />
                </th>
                <th className="py-2 pr-4">Cliente</th>
                {isGrupo && <th className="py-2 pr-4">Loja</th>}
                <th className="py-2 pr-4">Última compra</th>
                <th className="py-2 pr-4">Pedidos</th>
                <th className="py-2 pr-4">Total gasto</th>
                <th className="py-2 pr-4">Ticket médio</th>
                <th className="py-2 pr-4">Frequência</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                  <td className="py-2.5 pr-2">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="accent-nord-blue" />
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link href={`/portal/crm/clientes/${r.id}`} className="text-white hover:text-nord-blue-light font-medium">
                      {r.nome}
                    </Link>
                    <p className="text-xs text-nord-gray">{r.telefone ?? r.whatsapp ?? r.email ?? "—"}</p>
                  </td>
                  {isGrupo && (
                    <td className="py-2.5 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${r.lojaColor}22`, color: r.lojaColor }}>
                        {r.lojaNome}
                      </span>
                    </td>
                  )}
                  <td className="py-2.5 pr-4 text-nord-gray">
                    {r.ultimaCompra ? new Date(r.ultimaCompra).toLocaleDateString("pt-BR") : "—"}
                    {r.diasDesdeUltimaCompra !== null && <span className="text-nord-gray/60"> ({r.diasDesdeUltimaCompra}d)</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray">{r.pedidos}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.totalGasto)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(r.ticketMedio)}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{frequenciaLabel(r.frequenciaMediaDias)}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isGrupo ? 9 : 8} className="py-8 text-center text-nord-gray">
                    Nenhum cliente encontrado com os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showSegmentModal} onClose={() => setShowSegmentModal(false)} title="Salvar seleção como segmento" widthClass="max-w-sm">
        <div className="space-y-4">
          <p className="text-xs text-nord-gray">{selected.size} clientes serão salvos neste segmento fixo.</p>
          <input
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
            placeholder="Nome do segmento"
            className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
          />
          <button
            onClick={salvarSegmento}
            disabled={!segmentName.trim() || savingSegment}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {savingSegment ? "Salvando..." : "Salvar segmento"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
