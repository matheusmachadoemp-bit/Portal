"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PackageCheck } from "lucide-react";
import { Badge, Section } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/modal";
import { formatNumber } from "@/lib/calc";
import { LOJA_NORD_REDEMPTION_STATUS_LABEL, LOJA_NORD_REDEMPTION_STATUS_TONE } from "@/lib/loja-nord";

type RedemptionDTO = {
  id: string;
  rewardNome: string;
  rewardImagemUrl: string | null;
  pontos: number;
  status: string;
  dataPrevista: string | null;
  aprovadoPorNome: string | null;
  motivoRecusa: string | null;
  observacoes: string | null;
  createdAt: string;
};

function codigo(id: string) {
  return `LN-${id.slice(-6).toUpperCase()}`;
}

export function MeusResgatesClient({ initialRedemptions }: { initialRedemptions: RedemptionDTO[] }) {
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancelar() {
    if (!confirmCancelId) return;
    const res = await fetch(`/api/loja-nord/redemptions/${confirmCancelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancelar" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Não foi possível cancelar o resgate.");
      setConfirmCancelId(null);
      return;
    }
    setRedemptions((list) => list.map((r) => (r.id === confirmCancelId ? { ...r, status: "CANCELADO" } : r)));
    setConfirmCancelId(null);
  }

  if (redemptions.length === 0) {
    return (
      <div className="nord-card p-8 text-center">
        <PackageCheck size={28} className="text-nord-gray mx-auto mb-3" />
        <p className="text-white text-sm font-medium mb-1">Você ainda não fez nenhum resgate</p>
        <p className="text-xs text-nord-gray">Visite a Loja Nord e troque seus pontos por produtos e benefícios.</p>
      </div>
    );
  }

  return (
    <Section title="Solicitações de resgate">
      {error && <p className="text-xs text-nord-danger mb-3">{error}</p>}
      <div className="overflow-x-auto nord-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
              <th className="py-2 pr-4">Código</th>
              <th className="py-2 pr-4">Brinde</th>
              <th className="py-2 pr-4">Data</th>
              <th className="py-2 pr-4">Pontos</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Previsão de entrega</th>
              <th className="py-2 pr-4">Aprovado por</th>
              <th className="py-2 pr-4">Observações</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {redemptions.map((r) => (
              <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                <td className="py-2 pr-4 text-nord-gray font-mono text-xs">{codigo(r.id)}</td>
                <td className="py-2 pr-4 text-white">{r.rewardNome}</td>
                <td className="py-2 pr-4 text-nord-gray whitespace-nowrap">
                  {format(new Date(r.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </td>
                <td className="py-2 pr-4 text-nord-danger">-{formatNumber(r.pontos)}</td>
                <td className="py-2 pr-4">
                  <Badge tone={LOJA_NORD_REDEMPTION_STATUS_TONE[r.status] ?? "default"}>
                    {LOJA_NORD_REDEMPTION_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-nord-gray whitespace-nowrap">
                  {r.dataPrevista ? format(new Date(r.dataPrevista), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                </td>
                <td className="py-2 pr-4 text-nord-gray">{r.aprovadoPorNome ?? "-"}</td>
                <td className="py-2 pr-4 text-nord-gray max-w-[220px] truncate" title={r.motivoRecusa ?? r.observacoes ?? undefined}>
                  {r.motivoRecusa ?? r.observacoes ?? "-"}
                </td>
                <td className="py-2 pr-4">
                  {r.status === "AGUARDANDO_APROVACAO" && (
                    <button onClick={() => setConfirmCancelId(r.id)} className="text-xs text-nord-gray hover:text-nord-danger">
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmCancelId}
        title="Cancelar resgate"
        message="Tem certeza que deseja cancelar esse resgate? Os pontos serão devolvidos ao seu saldo."
        onConfirm={cancelar}
        onCancel={() => setConfirmCancelId(null)}
        confirmLabel="Cancelar resgate"
        danger
      />
    </Section>
  );
}
