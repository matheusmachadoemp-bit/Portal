"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Trophy } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { periodoLabel } from "@/lib/reuniao";

type Meeting = {
  id: string;
  periodo: string;
  cmvPercent: number | null;
  desperdicioValor: number | null;
  tempoPedidoMinutos: number | null;
  organizacaoPercent: number | null;
  cmvMetaPercent: number;
  desperdicioMetaValor: number;
  tempoPedidoMetaMinutos: number;
  organizacaoMetaPercent: number;
  premiacaoCmv: number;
  premiacaoDesperdicio: number;
  premiacaoTempoPedido: number;
  premiacaoOrganizacao: number;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

type Metrics = { cmvPercent: number | null; desperdicioValor: number; faturamento: number };

const emptyForm = (m: Metrics, latest?: Meeting | null) => ({
  tempoPedidoMinutos: "",
  organizacaoPercent: "",
  cmvMetaPercent: String(latest?.cmvMetaPercent ?? 30),
  desperdicioMetaValor: String(latest?.desperdicioMetaValor ?? 450),
  tempoPedidoMetaMinutos: String(latest?.tempoPedidoMetaMinutos ?? 15),
  organizacaoMetaPercent: String(latest?.organizacaoMetaPercent ?? 90),
  premiacaoCmv: String(latest?.premiacaoCmv ?? 400),
  premiacaoDesperdicio: String(latest?.premiacaoDesperdicio ?? 300),
  premiacaoTempoPedido: String(latest?.premiacaoTempoPedido ?? 500),
  premiacaoOrganizacao: String(latest?.premiacaoOrganizacao ?? 300),
  notas: "",
});

function metricCard({
  label,
  value,
  unit,
  meta,
  metaUnit,
  bateu,
  premio,
  lowerIsBetter = true,
}: {
  label: string;
  value: number | null;
  unit: string;
  meta: number;
  metaUnit: string;
  bateu: boolean | null;
  premio: number;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="nord-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">{label}</span>
        {bateu === null ? (
          <Badge tone="default">Sem dado</Badge>
        ) : bateu ? (
          <Badge tone="success">
            <CheckCircle2 size={11} className="inline mr-1 -mt-0.5" />
            Meta batida
          </Badge>
        ) : (
          <Badge tone="warning">
            <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
            Abaixo da meta
          </Badge>
        )}
      </div>
      <span className="text-2xl font-semibold text-white">
        {value === null ? "-" : `${formatNumber(value, 1)}${unit}`}
      </span>
      <span className="text-xs text-nord-gray">
        Meta: {lowerIsBetter ? "até" : "mín."} {formatNumber(meta, 1)}
        {metaUnit}
      </span>
      {bateu && premio > 0 && (
        <span className="text-xs text-amber-400 flex items-center gap-1">
          <Trophy size={11} /> {formatCurrency(premio)} de premiação
        </span>
      )}
    </div>
  );
}

export function CozinhaClient({
  initialMeetings,
  initialCurrent,
  initialMetrics,
  periodo,
  canCreate,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  periodo: string;
  canCreate: boolean;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [current, setCurrent] = useState(initialCurrent);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [form, setForm] = useState(
    initialCurrent
      ? {
          tempoPedidoMinutos: String(initialCurrent.tempoPedidoMinutos ?? ""),
          organizacaoPercent: String(initialCurrent.organizacaoPercent ?? ""),
          cmvMetaPercent: String(initialCurrent.cmvMetaPercent),
          desperdicioMetaValor: String(initialCurrent.desperdicioMetaValor),
          tempoPedidoMetaMinutos: String(initialCurrent.tempoPedidoMetaMinutos),
          organizacaoMetaPercent: String(initialCurrent.organizacaoMetaPercent),
          premiacaoCmv: String(initialCurrent.premiacaoCmv),
          premiacaoDesperdicio: String(initialCurrent.premiacaoDesperdicio),
          premiacaoTempoPedido: String(initialCurrent.premiacaoTempoPedido),
          premiacaoOrganizacao: String(initialCurrent.premiacaoOrganizacao),
          notas: initialCurrent.notas ?? "",
        }
      : emptyForm(initialMetrics, initialMeetings[0])
  );
  const [saving, setSaving] = useState(false);
  const [showMetas, setShowMetas] = useState(false);

  const cmvMeta = Number(form.cmvMetaPercent) || 0;
  const desperdicioMeta = Number(form.desperdicioMetaValor) || 0;
  const tempoMeta = Number(form.tempoPedidoMetaMinutos) || 0;
  const organizacaoMeta = Number(form.organizacaoMetaPercent) || 0;

  const tempoValor = form.tempoPedidoMinutos ? Number(form.tempoPedidoMinutos) : null;
  const organizacaoValor = form.organizacaoPercent ? Number(form.organizacaoPercent) : null;

  const bateuCmv = metrics.cmvPercent === null ? null : metrics.cmvPercent <= cmvMeta;
  const bateuDesperdicio = metrics.desperdicioValor <= desperdicioMeta;
  const bateuTempo = tempoValor === null ? null : tempoValor <= tempoMeta;
  const bateuOrganizacao = organizacaoValor === null ? null : organizacaoValor >= organizacaoMeta;

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    if (bateuCmv) total += Number(form.premiacaoCmv) || 0;
    if (bateuDesperdicio) total += Number(form.premiacaoDesperdicio) || 0;
    if (bateuTempo) total += Number(form.premiacaoTempoPedido) || 0;
    if (bateuOrganizacao) total += Number(form.premiacaoOrganizacao) || 0;
    return total;
  }, [bateuCmv, bateuDesperdicio, bateuTempo, bateuOrganizacao, form]);

  async function refresh() {
    const res = await fetch(`/api/reuniao/cozinha?periodo=${periodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
  }

  async function submit() {
    setSaving(true);
    try {
      await fetch("/api/reuniao/cozinha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, ...form }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium capitalize">{periodoLabel(periodo)}</h3>
        {canCreate && (
          <button onClick={() => setShowMetas((s) => !s)} className="text-xs text-nord-blue-light hover:underline">
            {showMetas ? "Ocultar metas e premiação" : "Editar metas e premiação"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCard({
          label: "CMV",
          value: metrics.cmvPercent,
          unit: "%",
          meta: cmvMeta,
          metaUnit: "%",
          bateu: bateuCmv,
          premio: Number(form.premiacaoCmv) || 0,
        })}
        {metricCard({
          label: "Desperdício",
          value: metrics.desperdicioValor,
          unit: "",
          meta: desperdicioMeta,
          metaUnit: "",
          bateu: bateuDesperdicio,
          premio: Number(form.premiacaoDesperdicio) || 0,
        })}
        <div className="nord-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white font-medium">Tempo de Pedido</span>
            {bateuTempo === null ? (
              <Badge tone="default">Sem dado</Badge>
            ) : bateuTempo ? (
              <Badge tone="success">
                <CheckCircle2 size={11} className="inline mr-1 -mt-0.5" />
                Meta batida
              </Badge>
            ) : (
              <Badge tone="warning">
                <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                Abaixo da meta
              </Badge>
            )}
          </div>
          {canCreate ? (
            <input
              type="number"
              value={form.tempoPedidoMinutos}
              onChange={(e) => setForm({ ...form, tempoPedidoMinutos: e.target.value })}
              placeholder="minutos"
              className="input"
            />
          ) : (
            <span className="text-2xl font-semibold text-white">{tempoValor ?? "-"} min</span>
          )}
          <span className="text-xs text-nord-gray">Meta: até {formatNumber(tempoMeta, 0)} min</span>
          {bateuTempo && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <Trophy size={11} /> {formatCurrency(Number(form.premiacaoTempoPedido) || 0)} de premiação
            </span>
          )}
        </div>
        <div className="nord-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white font-medium">Organização e Limpeza</span>
            {bateuOrganizacao === null ? (
              <Badge tone="default">Sem dado</Badge>
            ) : bateuOrganizacao ? (
              <Badge tone="success">
                <CheckCircle2 size={11} className="inline mr-1 -mt-0.5" />
                Meta batida
              </Badge>
            ) : (
              <Badge tone="warning">
                <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
                Abaixo da meta
              </Badge>
            )}
          </div>
          {canCreate ? (
            <input
              type="number"
              value={form.organizacaoPercent}
              onChange={(e) => setForm({ ...form, organizacaoPercent: e.target.value })}
              placeholder="%"
              className="input"
            />
          ) : (
            <span className="text-2xl font-semibold text-white">{organizacaoValor ?? "-"}%</span>
          )}
          <span className="text-xs text-nord-gray">Meta: mín. {formatNumber(organizacaoMeta, 0)}%</span>
          {bateuOrganizacao && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <Trophy size={11} /> {formatCurrency(Number(form.premiacaoOrganizacao) || 0)} de premiação
            </span>
          )}
        </div>
      </div>

      {premiacaoTotal > 0 && (
        <div className="nord-card p-4 flex items-center gap-3 bg-amber-950/10 border-amber-900/40">
          <Trophy size={20} className="text-amber-400 shrink-0" />
          <span className="text-sm text-white">
            Premiação total do mês: <strong>{formatCurrency(premiacaoTotal)}</strong>
          </span>
        </div>
      )}

      {canCreate && showMetas && (
        <Section title="Metas e premiação do período">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta CMV (%)</span>
              <input type="number" value={form.cmvMetaPercent} onChange={(e) => setForm({ ...form, cmvMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Desperdício (R$)</span>
              <input type="number" value={form.desperdicioMetaValor} onChange={(e) => setForm({ ...form, desperdicioMetaValor: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Tempo Pedido (min)</span>
              <input type="number" value={form.tempoPedidoMetaMinutos} onChange={(e) => setForm({ ...form, tempoPedidoMetaMinutos: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Organização (%)</span>
              <input type="number" value={form.organizacaoMetaPercent} onChange={(e) => setForm({ ...form, organizacaoMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação CMV (R$)</span>
              <input type="number" value={form.premiacaoCmv} onChange={(e) => setForm({ ...form, premiacaoCmv: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Desperdício (R$)</span>
              <input type="number" value={form.premiacaoDesperdicio} onChange={(e) => setForm({ ...form, premiacaoDesperdicio: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Tempo Pedido (R$)</span>
              <input type="number" value={form.premiacaoTempoPedido} onChange={(e) => setForm({ ...form, premiacaoTempoPedido: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Organização (R$)</span>
              <input type="number" value={form.premiacaoOrganizacao} onChange={(e) => setForm({ ...form, premiacaoOrganizacao: e.target.value })} className="input" />
            </label>
          </div>
        </Section>
      )}

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

      {meetings.length > 0 && (
        <Section title="Histórico de fechamentos">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 px-3">Período</th>
                  <th className="py-2 px-3">CMV</th>
                  <th className="py-2 px-3">Desperdício</th>
                  <th className="py-2 px-3">Tempo Pedido</th>
                  <th className="py-2 px-3">Organização</th>
                  <th className="py-2 px-3">Premiação total</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} className="border-b border-nord-border/50">
                    <td className="py-2 px-3 text-white capitalize">{periodoLabel(m.periodo)}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.cmvPercent === null ? "-" : `${formatNumber(m.cmvPercent, 1)}%`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.desperdicioValor === null ? "-" : formatCurrency(m.desperdicioValor)}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.tempoPedidoMinutos === null ? "-" : `${m.tempoPedidoMinutos} min`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.organizacaoPercent === null ? "-" : `${m.organizacaoPercent}%`}</td>
                    <td className="py-2 px-3 text-amber-400">
                      {formatCurrency(
                        (m.cmvPercent !== null && m.cmvPercent <= m.cmvMetaPercent ? m.premiacaoCmv : 0) +
                          (m.desperdicioValor !== null && m.desperdicioValor <= m.desperdicioMetaValor ? m.premiacaoDesperdicio : 0) +
                          (m.tempoPedidoMinutos !== null && m.tempoPedidoMinutos <= m.tempoPedidoMetaMinutos ? m.premiacaoTempoPedido : 0) +
                          (m.organizacaoPercent !== null && m.organizacaoPercent >= m.organizacaoMetaPercent ? m.premiacaoOrganizacao : 0)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}
