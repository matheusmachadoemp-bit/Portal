"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Megaphone, Users } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { matchesCriteria, type SegmentCriteria, type ClienteStatus, type AutoSegment } from "@/lib/crm";

type ClienteRow = {
  id: string;
  empresaId: string;
  totalGasto: number;
  pedidos: number;
  diasDesdeUltimaCompra: number | null;
  status: ClienteStatus;
  ehNovo: boolean;
  frequenciaMediaDias: number | null;
  produtos: string[];
};

type CustomSegment = {
  id: string;
  name: string;
  description: string | null;
  criteria: SegmentCriteria;
  createdBy: string;
  createdAt: string;
  count: number;
  receita: number;
  ticketMedio: number;
};

const ALL_STATUS: ClienteStatus[] = ["VIP", "RECORRENTE", "ATIVO", "EM_RISCO", "INATIVO", "PERDIDO"];

export function SegmentosClient({
  autoSegments,
  customSegments: initialCustom,
  clienteRows,
  lojas,
  isGrupo,
  canCreate,
}: {
  autoSegments: AutoSegment[];
  customSegments: CustomSegment[];
  clienteRows: ClienteRow[];
  lojas: { id: string; name: string; color: string }[];
  isGrupo: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [customSegments, setCustomSegments] = useState(initialCustom);
  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<SegmentCriteria>({});
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const matched = clienteRows.filter((c) => matchesCriteria(c, criteria, new Set(c.produtos)));
    const receita = matched.reduce((s, c) => s + c.totalGasto, 0);
    return { count: matched.length, receita, ticketMedio: matched.length ? receita / matched.length : 0 };
  }, [clienteRows, criteria]);

  function toggleStatus(s: ClienteStatus) {
    setCriteria((prev) => {
      const current = new Set(prev.status ?? []);
      if (current.has(s)) current.delete(s);
      else current.add(s);
      return { ...prev, status: Array.from(current) };
    });
  }

  async function salvar() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/crm/segmentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, criteria }),
    });
    if (res.ok) {
      setShowBuilder(false);
      setName("");
      setDescription("");
      setCriteria({});
      router.refresh();
    }
    setSaving(false);
  }

  async function excluir(id: string) {
    await fetch(`/api/crm/segmentos/${id}`, { method: "DELETE" });
    setCustomSegments((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-6">
      <Section title="Segmentos automáticos">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {autoSegments.map((s) => (
            <SegmentCard
              key={s.key}
              name={s.name}
              description={s.description}
              count={s.count}
              receita={s.receita}
              ticketMedio={s.ticketMedio}
              onCampanha={() => router.push(`/portal/crm/campanhas/novo?autoSegmento=${s.key}`)}
              onVer={() => router.push(`/portal/crm/clientes?criteria=${encodeURIComponent(JSON.stringify(s.criteria))}`)}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Segmentos personalizados"
        action={
          canCreate && (
            <button
              onClick={() => setShowBuilder(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light text-white"
            >
              <Plus size={13} /> Criar Segmento
            </button>
          )
        }
      >
        {customSegments.length === 0 ? (
          <p className="text-sm text-nord-gray text-center py-6">Nenhum segmento personalizado criado ainda.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {customSegments.map((s) => (
              <SegmentCard
                key={s.id}
                name={s.name}
                description={s.description ?? "Segmento personalizado"}
                count={s.count}
                receita={s.receita}
                ticketMedio={s.ticketMedio}
                onCampanha={() => router.push(`/portal/crm/campanhas/novo?segmentoId=${s.id}`)}
                onVer={() => router.push(`/portal/crm/clientes?criteria=${encodeURIComponent(JSON.stringify(s.criteria))}`)}
                onDelete={() => excluir(s.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Modal open={showBuilder} onClose={() => setShowBuilder(false)} title="Criar Segmento" widthClass="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-nord-gray mb-1.5">Nome do segmento</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue" />
            </div>
            <div>
              <label className="block text-xs text-nord-gray mb-1.5">Descrição (opcional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue" />
            </div>
          </div>

          {isGrupo && (
            <div>
              <label className="block text-xs text-nord-gray mb-1.5">Lojas</label>
              <div className="flex gap-2 flex-wrap">
                {lojas.map((l) => {
                  const active = criteria.lojas?.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() =>
                        setCriteria((prev) => {
                          const current = new Set(prev.lojas ?? []);
                          if (current.has(l.id)) current.delete(l.id);
                          else current.add(l.id);
                          return { ...prev, lojas: Array.from(current) };
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${active ? "border-nord-blue bg-nord-blue/15 text-white" : "border-nord-border text-nord-gray"}`}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-nord-gray mb-1.5">Status</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_STATUS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                    criteria.status?.includes(s) ? "border-nord-blue bg-nord-blue/15 text-white" : "border-nord-border text-nord-gray"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumField label="Gasto mín. (R$)" onChange={(v) => setCriteria((p) => ({ ...p, minGasto: v }))} />
            <NumField label="Pedidos mín." onChange={(v) => setCriteria((p) => ({ ...p, minPedidos: v }))} />
            <NumField label="Sem comprar há (mín. dias)" onChange={(v) => setCriteria((p) => ({ ...p, semCompraDiasMin: v }))} />
            <NumField label="Sem comprar há (máx. dias)" onChange={(v) => setCriteria((p) => ({ ...p, semCompraDiasMax: v }))} />
          </div>

          <div>
            <label className="block text-xs text-nord-gray mb-1.5">Produto comprado</label>
            <input
              placeholder="Ex: Hot Philadelphia"
              onChange={(e) => setCriteria((p) => ({ ...p, produtos: e.target.value.trim() ? [e.target.value.trim()] : undefined }))}
              className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
            />
          </div>

          <div className="rounded-xl border border-nord-blue/40 bg-nord-blue/5 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-nord-blue-light" />
              <div>
                <p className="text-white text-sm font-semibold">{formatNumber(preview.count)} clientes encontrados</p>
                <p className="text-xs text-nord-gray">
                  Receita histórica: {formatCurrency(preview.receita)} · Ticket médio: {formatCurrency(preview.ticketMedio)}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={salvar}
            disabled={!name.trim() || saving}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
          >
            {saving ? "Salvando..." : "Salvar segmento"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function NumField({ label, onChange }: { label: string; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-nord-gray mb-1">{label}</label>
      <input
        type="number"
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="w-full bg-nord-panel border border-nord-border rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-nord-blue"
      />
    </div>
  );
}

function SegmentCard({
  name,
  description,
  count,
  receita,
  ticketMedio,
  onCampanha,
  onVer,
  onDelete,
}: {
  name: string;
  description: string;
  count: number;
  receita: number;
  ticketMedio: number;
  onCampanha: () => void;
  onVer: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-xl border border-nord-border p-4 space-y-3 hover:border-nord-blue/50 transition">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white text-sm font-semibold">{name}</p>
          <p className="text-xs text-nord-gray mt-0.5">{description}</p>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="text-nord-gray hover:text-red-400 shrink-0">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <button onClick={onVer} className="text-left w-full">
        <p className="text-white text-xl font-semibold">{formatNumber(count)}</p>
        <p className="text-xs text-nord-gray">
          {formatCurrency(receita)} · ticket médio {formatCurrency(ticketMedio)}
        </p>
      </button>
      <button
        onClick={onCampanha}
        className="flex items-center gap-1.5 text-xs font-medium text-nord-blue-light hover:text-white"
      >
        <Megaphone size={12} /> Criar campanha para este segmento
      </button>
    </div>
  );
}
