"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Badge, Section, StatCard } from "@/components/ui/stat-card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/calc";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE, CAMPAIGN_CHANNEL_LABEL, CAMPAIGN_OFFER_LABEL } from "@/lib/crm";

type Campanha = {
  id: string;
  name: string;
  status: string;
  audienceType: string;
  segmentoNome: string | null;
  channel: string;
  offerType: string;
  offerValue: number | null;
  offerDescription: string | null;
  message: string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  createdBy: string;
  empresaNome: string;
  empresaColor: string;
};

type Resultados = {
  enviados: number;
  pedidos: number;
  compradores: number;
  conversao: number;
  receita: number;
  ticketMedio: number;
  descontos: number;
  custo: number;
  roi: number | null;
  reativados: number;
};

export function CampanhaDetailClient({ campanha, resultados }: { campanha: Campanha; resultados: Resultados }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function enviarAgora() {
    setSending(true);
    await fetch(`/api/crm/campanhas/${campanha.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enviar-agora" }),
    });
    setSending(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={CAMPAIGN_STATUS_TONE[campanha.status]}>{CAMPAIGN_STATUS_LABEL[campanha.status]}</Badge>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-nord-gray">{CAMPAIGN_CHANNEL_LABEL[campanha.channel]}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-nord-gray">{CAMPAIGN_OFFER_LABEL[campanha.offerType]}</span>
        </div>
        {(campanha.status === "RASCUNHO" || campanha.status === "AGENDADA") && (
          <button
            onClick={enviarAgora}
            disabled={sending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white"
          >
            <Send size={13} /> {sending ? "Enviando..." : "Enviar agora"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Enviados" value={formatNumber(resultados.enviados)} icon="Send" />
        <StatCard label="Entregues" value="—" icon="CheckCheck" hint="Requer integração com o canal" />
        <StatCard label="Visualizados" value="—" icon="Eye" hint="Requer integração com o canal" />
        <StatCard label="Cliques" value="—" icon="MousePointerClick" hint="Requer integração com o canal" />
        <StatCard label="Pedidos" value={formatNumber(resultados.pedidos)} icon="ShoppingBag" color="#22c55e" />
        <StatCard label="Conversão" value={formatPercent(resultados.conversao)} icon="Target" color="#f59e0b" />
        <StatCard label="Receita" value={formatCurrency(resultados.receita)} icon="TrendingUp" color="#22c55e" />
        <StatCard label="Ticket médio" value={formatCurrency(resultados.ticketMedio)} icon="Receipt" />
        <StatCard label="Descontos concedidos" value={formatCurrency(resultados.descontos)} icon="Percent" />
        <StatCard label="Custo da campanha" value={formatCurrency(resultados.custo)} icon="Wallet" />
        <StatCard label="ROI" value={resultados.roi !== null ? `${formatNumber(resultados.roi, 2)}x` : "—"} icon="Sparkles" color="#a855f7" />
        <StatCard label="Clientes reativados" value={formatNumber(resultados.reativados)} icon="Rocket" color="#a855f7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Section title="Mensagem">
            <p className="text-sm text-white whitespace-pre-wrap">{campanha.message}</p>
            {campanha.offerDescription && <p className="text-xs text-nord-gray mt-3">Oferta: {campanha.offerDescription}</p>}
          </Section>
        </div>
        <Section title="Detalhes">
          <dl className="space-y-2.5 text-sm">
            <Row label="Loja" value={campanha.empresaNome} />
            <Row label="Público" value={campanha.audienceType === "TODOS" ? "Todos os clientes" : campanha.audienceType === "SEGMENTO" ? campanha.segmentoNome ?? "Segmento" : "Clientes específicos"} />
            <Row label="Criada por" value={campanha.createdBy} />
            <Row label="Criada em" value={new Date(campanha.createdAt).toLocaleDateString("pt-BR")} />
            {campanha.sentAt && <Row label="Enviada em" value={new Date(campanha.sentAt).toLocaleString("pt-BR")} />}
            {campanha.scheduledAt && <Row label="Agendada para" value={new Date(campanha.scheduledAt).toLocaleString("pt-BR")} />}
          </dl>
        </Section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-nord-gray text-xs">{label}</dt>
      <dd className="text-white text-xs text-right">{value}</dd>
    </div>
  );
}
