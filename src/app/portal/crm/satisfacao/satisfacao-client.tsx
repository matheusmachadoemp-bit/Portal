"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Section, StatCard, Badge } from "@/components/ui/stat-card";
import { formatNumber, formatPercent } from "@/lib/calc";

type Distribuicao = { promotores: number; neutros: number; detratores: number };
type Loja = Distribuicao & { nome: string; color: string; nps: number };
type Insatisfeito = {
  id: string;
  cliente: string;
  nota: number;
  comentario: string | null;
  status: string;
  responsavel: string | null;
  lojaNome: string;
  lojaColor: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = { PENDENTE: "Pendente", EM_CONTATO: "Em contato", RESOLVIDO: "Resolvido" };

export function SatisfacaoClient({
  npsGeral,
  distribuicaoGeral,
  porLoja,
  evolucaoMensal,
  insatisfeitos: initialInsatisfeitos,
  isGrupo,
  totalRespostas,
}: {
  npsGeral: number;
  distribuicaoGeral: Distribuicao;
  porLoja: Loja[];
  evolucaoMensal: { mes: string; nps: number; respostas: number }[];
  insatisfeitos: Insatisfeito[];
  isGrupo: boolean;
  totalRespostas: number;
}) {
  const router = useRouter();
  const [insatisfeitos, setInsatisfeitos] = useState(initialInsatisfeitos);

  async function atualizarStatus(id: string, status: string) {
    await fetch(`/api/crm/nps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInsatisfeitos((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="NPS Geral" value={formatNumber(npsGeral, 0)} icon="Smile" color={npsGeral >= 50 ? "#22c55e" : npsGeral >= 0 ? "#f59e0b" : "#ef4444"} />
        <StatCard label="Total de respostas" value={formatNumber(totalRespostas)} icon="MessageSquare" />
        <StatCard label="Promotores" value={formatNumber(distribuicaoGeral.promotores)} icon="ThumbsUp" color="#22c55e" />
        <StatCard label="Detratores" value={formatNumber(distribuicaoGeral.detratores)} icon="ThumbsDown" color="#ef4444" />
      </div>

      {isGrupo && porLoja.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {porLoja.map((l) => (
            <div key={l.nome} className="nord-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: l.color }}>
                  {l.nome}
                </span>
                <span className="text-white text-lg font-semibold">{formatNumber(l.nps, 0)}</span>
              </div>
              <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500" style={{ width: `${(l.promotores / (l.promotores + l.neutros + l.detratores || 1)) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(l.neutros / (l.promotores + l.neutros + l.detratores || 1)) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(l.detratores / (l.promotores + l.neutros + l.detratores || 1)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Section title="Evolução mensal do NPS">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
                <YAxis stroke="#9a9aa2" fontSize={11} domain={[-100, 100]} />
                <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
                <Line type="monotone" dataKey="nps" name="NPS" stroke="#2952E3" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>
        <Section title="Distribuição geral">
          <div className="space-y-3">
            <DistRow label="Promotores" tone="success" count={distribuicaoGeral.promotores} total={totalRespostas} />
            <DistRow label="Neutros" tone="warning" count={distribuicaoGeral.neutros} total={totalRespostas} />
            <DistRow label="Detratores" tone="danger" count={distribuicaoGeral.detratores} total={totalRespostas} />
          </div>
        </Section>
      </div>

      <Section title={`Clientes insatisfeitos (${insatisfeitos.length})`}>
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Nota</th>
                <th className="py-2 pr-4">Comentário</th>
                <th className="py-2 pr-4">Responsável</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {insatisfeitos.map((i) => (
                <tr key={i.id} className="border-b border-nord-border/50 hover:bg-white/5 align-top">
                  <td className="py-2.5 pr-4 text-white">
                    {i.cliente}
                    <p className="text-[11px] text-nord-gray">{new Date(i.createdAt).toLocaleDateString("pt-BR")}</p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone="danger">{i.nota}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-nord-gray max-w-xs">{i.comentario ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-nord-gray">{i.responsavel ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <select
                      value={i.status}
                      onChange={(e) => atualizarStatus(i.id, e.target.value)}
                      className="bg-nord-panel border border-nord-border rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-nord-blue"
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {insatisfeitos.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-nord-gray">
                    Nenhum cliente insatisfeito pendente. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function DistRow({ label, tone, count, total }: { label: string; tone: "success" | "warning" | "danger"; count: number; total: number }) {
  const colors = { success: "#22c55e", warning: "#f59e0b", danger: "#ef4444" };
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-nord-gray">{label}</span>
        <span className="text-white font-medium">
          {formatNumber(count)} ({formatPercent(total ? (count / total) * 100 : 0)})
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-nord-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%`, backgroundColor: colors[tone] }} />
      </div>
    </div>
  );
}
