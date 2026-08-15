"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Gift, Sparkles } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatNumber } from "@/lib/calc";

type Kpis = {
  participantes: number;
  pontosEmitidos: number;
  pontosUtilizados: number;
  cashbackEmitido: number;
  cashbackUtilizado: number;
  receitaMembros: number;
  ticketMedioMembros: number;
  frequenciaMedia: number | null;
};

type Reward = { id: string; name: string; pontosNecessarios: number; ativo: boolean };
type Membro = { id: string; clienteId: string; nome: string; pontos: number; cashback: number; totalGasto: number; ticketMedio: number; pedidos: number };

export function FidelidadeClient({
  kpis,
  rewards: initialRewards,
  membros,
  pontosPorReal: initialPontosPorReal,
  canManage,
}: {
  kpis: Kpis;
  rewards: Reward[];
  membros: Membro[];
  pontosPorReal: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [rewards, setRewards] = useState(initialRewards);
  const [pontosPorReal, setPontosPorReal] = useState(String(initialPontosPorReal));
  const [showReward, setShowReward] = useState(false);
  const [rewardForm, setRewardForm] = useState({ name: "", pontosNecessarios: "" });
  const [showAjustar, setShowAjustar] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nome: string; telefone: string | null }[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<{ id: string; nome: string } | null>(null);
  const [ajusteForm, setAjusteForm] = useState({ tipo: "GANHO", pontos: "", cashback: "", descricao: "" });
  const [saving, setSaving] = useState(false);

  async function salvarConfig() {
    await fetch("/api/crm/fidelidade/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pontosPorReal: Number(pontosPorReal) }),
    });
    router.refresh();
  }

  async function criarReward() {
    if (!rewardForm.name.trim() || !rewardForm.pontosNecessarios) return;
    const res = await fetch("/api/crm/fidelidade/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rewardForm.name, pontosNecessarios: Number(rewardForm.pontosNecessarios) }),
    });
    if (res.ok) {
      const { reward } = await res.json();
      setRewards((prev) => [...prev, reward].sort((a, b) => a.pontosNecessarios - b.pontosNecessarios));
      setShowReward(false);
      setRewardForm({ name: "", pontosNecessarios: "" });
    }
  }

  async function toggleReward(id: string, ativo: boolean) {
    await fetch(`/api/crm/fidelidade/rewards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !ativo }),
    });
    setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, ativo: !ativo } : r)));
  }

  async function buscarClientes(q: string) {
    setBusca(q);
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    const res = await fetch(`/api/crm/clientes/buscar?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResultados(data.clientes ?? []);
  }

  async function salvarAjuste() {
    if (!clienteSelecionado) return;
    setSaving(true);
    await fetch("/api/crm/fidelidade/ajustar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId: clienteSelecionado.id,
        tipo: ajusteForm.tipo,
        pontos: Number(ajusteForm.pontos) || 0,
        cashback: Number(ajusteForm.cashback) || 0,
        descricao: ajusteForm.descricao,
      }),
    });
    setSaving(false);
    setShowAjustar(false);
    setClienteSelecionado(null);
    setBusca("");
    setResultados([]);
    setAjusteForm({ tipo: "GANHO", pontos: "", cashback: "", descricao: "" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <SortableStatCards
        storageKey="crm-fidelidade-kpi-order"
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        cards={[
          { key: "clientes-participantes", label: "Clientes participantes", value: formatNumber(kpis.participantes), icon: "Users" },
          { key: "pontos-emitidos", label: "Pontos emitidos", value: formatNumber(kpis.pontosEmitidos), icon: "Star", color: "#f59e0b" },
          { key: "pontos-utilizados", label: "Pontos utilizados", value: formatNumber(kpis.pontosUtilizados), icon: "Gift" },
          { key: "cashback-emitido", label: "Cashback emitido", value: formatCurrency(kpis.cashbackEmitido), icon: "Wallet", color: "#22c55e" },
          { key: "cashback-utilizado", label: "Cashback utilizado", value: formatCurrency(kpis.cashbackUtilizado), icon: "Wallet" },
          { key: "receita-membros", label: "Receita dos membros", value: formatCurrency(kpis.receitaMembros), icon: "TrendingUp", color: "#22c55e" },
          { key: "ticket-medio-membros", label: "Ticket médio dos membros", value: formatCurrency(kpis.ticketMedioMembros), icon: "Receipt" },
          { key: "frequencia-membros", label: "Frequência dos membros", value: kpis.frequenciaMedia !== null ? `${formatNumber(kpis.frequenciaMedia, 0)} dias` : "—", icon: "Clock" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Section
            title="Membros do Clube Nord"
            action={
              canManage && (
                <button onClick={() => setShowAjustar(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light text-white">
                  <Sparkles size={13} /> Ajustar pontos
                </button>
              )
            }
          >
            <div className="overflow-x-auto nord-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">Cliente</th>
                    <th className="py-2 pr-4">Saldo pontos</th>
                    <th className="py-2 pr-4">Cashback</th>
                    <th className="py-2 pr-4">Total gasto</th>
                    <th className="py-2 pr-4">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {membros.map((m) => (
                    <tr key={m.id} className="border-b border-nord-border/50 hover:bg-white/5">
                      <td className="py-2.5 pr-4 text-white">{m.nome}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{formatNumber(m.pontos)} pontos</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(m.cashback)}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(m.totalGasto)}</td>
                      <td className="py-2.5 pr-4 text-nord-gray">{formatCurrency(m.ticketMedio)}</td>
                    </tr>
                  ))}
                  {membros.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-nord-gray">
                        Nenhum membro cadastrado ainda no Clube Nord.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          {canManage && (
            <Section title="Configuração de pontos">
              <div className="space-y-2">
                <label className="block text-xs text-nord-gray">R$ 1 gasto equivale a quantos pontos?</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={pontosPorReal}
                    onChange={(e) => setPontosPorReal(e.target.value)}
                    className="flex-1 bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
                  />
                  <button onClick={salvarConfig} className="px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium">
                    Salvar
                  </button>
                </div>
              </div>
            </Section>
          )}

          <Section
            title="Recompensas"
            action={
              canManage && (
                <button onClick={() => setShowReward(true)} className="flex items-center gap-1.5 text-xs text-nord-blue-light hover:text-white">
                  <Plus size={13} /> Nova
                </button>
              )
            }
          >
            <div className="space-y-2">
              {rewards.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-nord-panel/60 border border-nord-border/50">
                  <div className="flex items-center gap-2">
                    <Gift size={14} className="text-nord-blue-light" />
                    <div>
                      <p className="text-xs text-white font-medium">{r.name}</p>
                      <p className="text-[11px] text-nord-gray">{formatNumber(r.pontosNecessarios)} pontos</p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => toggleReward(r.id, r.ativo)}
                      className={`text-[11px] px-2 py-0.5 rounded-full ${r.ativo ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-nord-gray"}`}
                    >
                      {r.ativo ? "Ativa" : "Inativa"}
                    </button>
                  )}
                </div>
              ))}
              {rewards.length === 0 && <p className="text-xs text-nord-gray text-center py-3">Nenhuma recompensa configurada.</p>}
            </div>
          </Section>
        </div>
      </div>

      <Modal open={showReward} onClose={() => setShowReward(false)} title="Nova recompensa" widthClass="max-w-sm">
        <div className="space-y-3">
          <input
            value={rewardForm.name}
            onChange={(e) => setRewardForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Batata grátis"
            className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
          />
          <input
            type="number"
            value={rewardForm.pontosNecessarios}
            onChange={(e) => setRewardForm((f) => ({ ...f, pontosNecessarios: e.target.value }))}
            placeholder="Pontos necessários"
            className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
          />
          <button onClick={criarReward} className="w-full bg-nord-blue hover:bg-nord-blue-light text-white text-sm font-medium rounded-lg py-2.5">
            Salvar
          </button>
        </div>
      </Modal>

      <Modal open={showAjustar} onClose={() => setShowAjustar(false)} title="Ajustar pontos / cashback" widthClass="max-w-sm">
        <div className="space-y-3">
          {!clienteSelecionado ? (
            <>
              <input
                value={busca}
                onChange={(e) => buscarClientes(e.target.value)}
                placeholder="Buscar cliente por nome ou telefone"
                className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
              />
              <div className="space-y-1">
                {resultados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setClienteSelecionado({ id: c.id, nome: c.nome })}
                    className="w-full text-left px-3 py-2 rounded-lg border border-nord-border hover:border-nord-blue text-sm text-white"
                  >
                    {c.nome} {c.telefone ? `· ${c.telefone}` : ""}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-white">
                Cliente: <span className="font-medium">{clienteSelecionado.nome}</span>{" "}
                <button onClick={() => setClienteSelecionado(null)} className="text-xs text-nord-blue-light ml-1">
                  trocar
                </button>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAjusteForm((f) => ({ ...f, tipo: "GANHO" }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium ${ajusteForm.tipo === "GANHO" ? "bg-nord-blue text-white" : "bg-white/5 text-nord-gray"}`}
                >
                  Adicionar (ganho)
                </button>
                <button
                  onClick={() => setAjusteForm((f) => ({ ...f, tipo: "RESGATE" }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium ${ajusteForm.tipo === "RESGATE" ? "bg-nord-blue text-white" : "bg-white/5 text-nord-gray"}`}
                >
                  Resgatar
                </button>
              </div>
              <input
                type="number"
                value={ajusteForm.pontos}
                onChange={(e) => setAjusteForm((f) => ({ ...f, pontos: e.target.value }))}
                placeholder="Pontos"
                className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
              />
              <input
                type="number"
                value={ajusteForm.cashback}
                onChange={(e) => setAjusteForm((f) => ({ ...f, cashback: e.target.value }))}
                placeholder="Cashback (R$)"
                className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
              />
              <input
                value={ajusteForm.descricao}
                onChange={(e) => setAjusteForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição (opcional)"
                className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-nord-blue"
              />
              <button onClick={salvarAjuste} disabled={saving} className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5">
                {saving ? "Salvando..." : "Confirmar"}
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
